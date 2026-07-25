import assert from "node:assert/strict";
import { parseBridgeMessage } from "../dist/protocol.js";

const success = parseBridgeMessage(JSON.stringify({
  id: "request-1",
  ok: true,
  result: { connected: true }
}));
assert.deepEqual(success, {
  id: "request-1",
  ok: true,
  result: { connected: true }
});

const failure = parseBridgeMessage(JSON.stringify({
  id: "request-2",
  ok: false,
  error: { code: "NODE_NOT_FOUND", message: "Missing node" }
}));
assert.equal(failure.ok, false);
assert.equal(failure.error.code, "NODE_NOT_FOUND");

assert.throws(
  () => parseBridgeMessage(JSON.stringify({ id: "request-3", ok: true })),
  /PROTOCOL_ERROR/
);
console.log("protocol.test.mjs passed");
