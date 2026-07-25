import assert from "node:assert/strict";
import { classifyRuntimeError, RuntimeManager } from "../dist/tools/runtime.js";

assert.equal(classifyRuntimeError({ code: "ENOENT" }), "GODOT_NOT_FOUND");
assert.equal(classifyRuntimeError(new Error("bridge launch failed")), "PROJECT_RUN_FAILED");
const manager = new RuntimeManager();
assert.deepEqual(manager.errors(), []);
console.log("runtime.test.mjs passed");
