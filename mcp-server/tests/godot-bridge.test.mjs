import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocketServer } from "ws";
import { GodotBridge } from "../dist/godot-bridge.js";

const port = 18765;
const server = new WebSocketServer({ host: "127.0.0.1", port });
server.on("connection", (socket, request) => {
  assert.equal(request.headers["x-godot-mcp-token"], "secret");
  socket.on("message", (raw) => {
    const requestMessage = JSON.parse(raw.toString());
    if (requestMessage.method === "delay") {
      return;
    }
    socket.send(JSON.stringify({
      id: requestMessage.id,
      ok: true,
      result: requestMessage.params
    }));
  });
});
await once(server, "listening");

const bridge = new GodotBridge({
  host: "127.0.0.1",
  port,
  token: "secret",
  connectTimeoutMs: 1000,
  requestTimeoutMs: 100
});
await bridge.connect();
const results = await Promise.all([
  bridge.request("echo", { value: 1 }),
  bridge.request("echo", { value: 2 })
]);
assert.deepEqual(results, [{ value: 1 }, { value: 2 }]);
await assert.rejects(
  bridge.request("delay", {}),
  (error) => error.code === "BRIDGE_TIMEOUT"
);
await bridge.close();
await new Promise((resolve) => server.close(resolve));
console.log("godot-bridge.test.mjs passed");
