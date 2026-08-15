import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callBridge } from "./editor.js";
import type { GodotBridge } from "../godot-bridge.js";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { getActiveEditorStatus } from "../active-editor.js";

export type RuntimeErrorRecord = {
  severity: "error" | "warning";
  source: "stdout" | "stderr" | "process";
  message: string;
  timestamp: string;
};

export type RuntimeProcess = {
  pid: number;
};

export function classifyRuntimeError(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
    return "GODOT_NOT_FOUND";
  }
  return "PROJECT_RUN_FAILED";
}

export class RuntimeManager {
  private readonly processes = new Map<number, ChildProcess>();
  private readonly recentErrors: RuntimeErrorRecord[] = [];

  run(projectRoot: string, executable = process.env.GODOT_EXECUTABLE ?? "godot"): Promise<RuntimeProcess> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const child = spawn(executable, ["--path", projectRoot], {
        cwd: projectRoot,
        stdio: ["ignore", "pipe", "pipe"]
      });
      child.stdout?.on("data", (chunk: Buffer) => this.record("stdout", chunk.toString()));
      child.stderr?.on("data", (chunk: Buffer) => this.record("stderr", chunk.toString()));
      child.once("spawn", () => {
        if (child.pid === undefined) {
          settled = true;
          reject(new Error("Project process did not expose a PID"));
          return;
        }
        this.processes.set(child.pid, child);
        settled = true;
        resolve({ pid: child.pid });
      });
      child.once("error", (error) => {
        this.record("process", error.message);
        if (!settled) {
          settled = true;
          const typedError = new Error(error.message) as Error & { code?: string };
          typedError.code = classifyRuntimeError(error);
          reject(typedError);
        }
      });
      child.once("exit", () => {
        if (child.pid !== undefined) {
          this.processes.delete(child.pid);
        }
      });
    });
  }

  stop(pid: number): void {
    const child = this.processes.get(pid);
    if (!child) {
      const error = new Error("Unknown project process: " + pid) as Error & { code?: string };
      error.code = "PROJECT_NOT_FOUND";
      throw error;
    }
    child.kill();
    this.processes.delete(pid);
  }

  errors(): RuntimeErrorRecord[] {
    return [...this.recentErrors];
  }

  private record(source: RuntimeErrorRecord["source"], rawMessage: string): void {
    for (const message of rawMessage.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
      this.recentErrors.push({
        severity: source === "stderr" || source === "process" ? "error" : "warning",
        source,
        message,
        timestamp: new Date().toISOString()
      });
    }
    if (this.recentErrors.length > 200) {
      this.recentErrors.splice(0, this.recentErrors.length - 200);
    }
  }
}

export async function runActiveProject(
  bridge: Pick<GodotBridge, "request">,
  runtime: Pick<RuntimeManager, "run">
): Promise<RuntimeProcess> {
  const status = await getActiveEditorStatus(bridge);
  return runtime.run(status.projectPath);
}

export function registerRuntimeTools(
  server: McpServer,
  bridge: GodotBridge,
  runtime: RuntimeManager
): void {
  server.registerTool(
    "godot_run_project",
    {
      title: "Godot Run Project",
      description: "Run the Godot project with the configured executable"
    },
    async () => {
      try {
        const result = await runActiveProject(bridge, runtime);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          structuredContent: result
        };
      } catch (error) {
        const code = error instanceof Error && "code" in error ? String(error.code) : "PROJECT_RUN_FAILED";
        const message = error instanceof Error ? error.message : String(error);
        return { isError: true, content: [{ type: "text" as const, text: `${code}: ${message}` }] };
      }
    }
  );

  server.registerTool(
    "godot_stop_project",
    {
      title: "Godot Stop Project",
      description: "Stop a project process started by Godot MCP",
      inputSchema: { pid: z.number().int().positive() }
    },
    async ({ pid }) => {
      try {
        runtime.stop(pid);
        const result = { pid, stopped: true };
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result };
      } catch (error) {
        const code = error instanceof Error && "code" in error ? String(error.code) : "PROJECT_NOT_FOUND";
        const message = error instanceof Error ? error.message : String(error);
        return { isError: true, content: [{ type: "text" as const, text: `${code}: ${message}` }] };
      }
    }
  );

  server.registerTool(
    "godot_editor_errors",
    {
      title: "Godot Editor Errors",
      description: "Read recent editor and project runtime errors"
    },
    async () => {
      const localErrors = runtime.errors();
      const bridgeResult = await callBridge(bridge, "runtime.errors", {});
      if (bridgeResult.isError) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(localErrors) }],
          structuredContent: { errors: localErrors }
        };
      }
      return bridgeResult;
    }
  );
}
