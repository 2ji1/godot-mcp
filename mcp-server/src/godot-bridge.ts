import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { makeBridgeRequest, parseBridgeMessage, type BridgeResponse } from "./protocol.js";

export type GodotBridgeOptions = {
  host: string;
  port: number;
  token: string | (() => string);
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: BridgeError) => void;
  timeout: NodeJS.Timeout;
};

export class BridgeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "BridgeError";
  }
}

export class GodotBridge {
  private socket: WebSocket | undefined;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly connectTimeoutMs: number;
  private readonly requestTimeoutMs: number;

  constructor(private readonly options: GodotBridgeOptions) {
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10000;
  }

  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    const token = this.resolveToken();
    const socket = new WebSocket(`ws://${this.options.host}:${this.options.port}`, {
      headers: { "X-Godot-MCP-Token": token }
    });
    this.socket = socket;
    socket.on("message", (data) => this.handleMessage(data.toString()));
    socket.on("close", () => this.rejectPending("BRIDGE_CLOSED", "Godot bridge connection closed"));

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.terminate();
        reject(new BridgeError("BRIDGE_TIMEOUT", "Timed out connecting to Godot editor"));
      }, this.connectTimeoutMs);
      socket.once("open", () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.once("error", (error) => {
        clearTimeout(timeout);
        reject(new BridgeError("BRIDGE_CONNECTION_FAILED", error.message));
      });
    });

    try {
      await this.request("bridge.authenticate", { token });
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      await this.connect();
    }
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new BridgeError("BRIDGE_NOT_CONNECTED", "Godot editor bridge is not connected");
    }

    const id = randomUUID();
    const payload = makeBridgeRequest(id, method, params);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new BridgeError("BRIDGE_TIMEOUT", `Timed out waiting for ${method}`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket?.send(payload, (error) => {
        if (error) {
          clearTimeout(timeout);
          this.pending.delete(id);
          reject(new BridgeError("BRIDGE_SEND_FAILED", error.message));
        }
      });
    });
  }

  async close(): Promise<void> {
    if (!this.socket) {
      return;
    }
    this.rejectPending("BRIDGE_CLOSED", "Godot bridge connection closed");
    const socket = this.socket;
    this.socket = undefined;
    if (socket.readyState === WebSocket.CLOSED) {
      return;
    }
    await new Promise<void>((resolve) => {
      socket.once("close", () => resolve());
      socket.close();
    });
  }

  private resolveToken(): string {
    return typeof this.options.token === "function" ? this.options.token() : this.options.token;
  }

  private handleMessage(raw: string): void {
    let response: BridgeResponse;
    try {
      response = parseBridgeMessage(raw);
    } catch {
      return;
    }
    const request = this.pending.get(response.id);
    if (!request) {
      return;
    }
    clearTimeout(request.timeout);
    this.pending.delete(response.id);
    if (response.ok) {
      request.resolve(response.result);
    } else {
      request.reject(new BridgeError(response.error.code, response.error.message));
    }
  }

  private rejectPending(code: string, message: string): void {
    for (const [id, request] of this.pending) {
      clearTimeout(request.timeout);
      request.reject(new BridgeError(code, message));
      this.pending.delete(id);
    }
  }
}
