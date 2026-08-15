import assert from "node:assert/strict";
import { classifyRuntimeError, runActiveProject, RuntimeManager } from "../dist/tools/runtime.js";

assert.equal(classifyRuntimeError({ code: "ENOENT" }), "GODOT_NOT_FOUND");
assert.equal(classifyRuntimeError(new Error("bridge launch failed")), "PROJECT_RUN_FAILED");
const manager = new RuntimeManager();
assert.deepEqual(manager.errors(), []);

const requests = [];
const runs = [];
const result = await runActiveProject(
  {
    async request(method, params) {
      requests.push({ method, params });
      return {
        projectPath: "D:/godot/active-project",
        godotVersion: "4.7.1.stable",
        scenePath: "res://main.tscn",
        rootName: "Main",
        rootType: "Node"
      };
    }
  },
  {
    async run(projectRoot) {
      runs.push(projectRoot);
      return { pid: 4242 };
    }
  }
);
assert.deepEqual(requests, [{ method: "editor.status", params: {} }]);
assert.deepEqual(runs, ["D:/godot/active-project"]);
assert.deepEqual(result, { pid: 4242 });
console.log("runtime.test.mjs passed");
