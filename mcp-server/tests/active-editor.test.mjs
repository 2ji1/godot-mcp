import assert from "node:assert/strict";
import { getActiveEditorStatus } from "../dist/active-editor.js";

const expectedStatus = {
  projectPath: "D:/godot/project-b",
  godotVersion: "4.7.1.stable",
  scenePath: "res://main.tscn",
  rootName: "Main",
  rootType: "Node3D"
};

let calls = 0;
const bridge = {
  async request(method, params) {
    calls += 1;
    assert.equal(method, "editor.status");
    assert.deepEqual(params, {});
    return expectedStatus;
  }
};

assert.deepEqual(await getActiveEditorStatus(bridge), expectedStatus);
assert.deepEqual(await getActiveEditorStatus(bridge), expectedStatus);
assert.equal(calls, 2);

await assert.rejects(
  getActiveEditorStatus({
    async request() {
      return { ...expectedStatus, projectPath: "" };
    }
  }),
  (error) => error.code === "NO_ACTIVE_EDITOR"
);

console.log("active-editor.test.mjs passed");
