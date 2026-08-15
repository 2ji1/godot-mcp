import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocketServer } from "ws";
import { GodotBridge } from "../dist/godot-bridge.js";

async function createServer(port = 0, authenticate = true) {
  const server = new WebSocketServer({ host: "127.0.0.1", port });
  server.on("connection", (socket, request) => {
    assert.equal(request.headers["x-godot-mcp-token"], "secret");
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.method === "delay") {
        return;
      }
      if (message.method === "bridge.authenticate" && !authenticate) {
        socket.send(JSON.stringify({
          id: message.id,
          ok: false,
          error: { code: "AUTHENTICATION_FAILED", message: "Invalid bridge token" }
        }));
        return;
      }
      socket.send(JSON.stringify({ id: message.id, ok: true, result: message.params }));
    });
  });
  await once(server, "listening");
  return server;
}

function serverPort(server) {
  const address = server.address();
  assert.equal(typeof address, "object");
  return address.port;
}

async function closeServer(server) {
  for (const client of server.clients) {
    client.terminate();
  }
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => setTimeout(resolve, 20));
}

const refusedServer = await createServer();
const refusedPort = serverPort(refusedServer);
await closeServer(refusedServer);
const refusedBridge = new GodotBridge({
  host: "127.0.0.1",
  port: refusedPort,
  token: "secret",
  connectTimeoutMs: 300,
  requestTimeoutMs: 100
});
await assert.rejects(
  refusedBridge.request("echo", {}),
  (error) => error.code === "NO_ACTIVE_EDITOR"
);

const firstServer = await createServer();
const port = serverPort(firstServer);
const bridge = new GodotBridge({
  host: "127.0.0.1",
  port,
  token: "secret",
  connectTimeoutMs: 1000,
  requestTimeoutMs: 100
});
const results = await Promise.all([
  bridge.request("echo", { value: 1 }),
  bridge.request("echo", { value: 2 })
]);
assert.deepEqual(results, [{ value: 1 }, { value: 2 }]);
await assert.rejects(bridge.request("delay", {}), (error) => error.code === "BRIDGE_TIMEOUT");

await closeServer(firstServer);
await assert.rejects(bridge.request("echo", {}), (error) => error.code === "NO_ACTIVE_EDITOR");
const secondServer = await createServer(port);
assert.deepEqual(await bridge.request("echo", { editor: "B" }), { editor: "B" });
await bridge.close();
await closeServer(secondServer);

const authServer = await createServer(0, false);
const authBridge = new GodotBridge({
  host: "127.0.0.1",
  port: serverPort(authServer),
  token: "secret",
  connectTimeoutMs: 1000,
  requestTimeoutMs: 100
});
await assert.rejects(authBridge.connect(), (error) => error.code === "AUTHENTICATION_FAILED");
await closeServer(authServer);

console.log("godot-bridge.test.mjs passed");
