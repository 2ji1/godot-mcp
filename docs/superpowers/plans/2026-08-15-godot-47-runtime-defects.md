# Godot 4.7 Runtime Defects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make clean-install authentication succeed on the first call and make created-node paths resolve to the requested node name.

**Architecture:** Keep token ownership in the Godot plugin and initialize it before the bridge listens. Exercise the real Godot editor bridge through an opt-in Node integration test, then apply the smallest GDScript fixes at the two root causes.

**Tech Stack:** Godot 4.7/4.7.1 GDScript, Node.js 24, TypeScript, WebSocket bridge, Node built-in test runner.

## Global Constraints

- Preserve loopback-only WebSocket binding and token authentication.
- Do not add authentication retries or accept empty tokens.
- Preserve Godot editor undo/redo behavior.
- Keep the Godot integration test opt-in through `GODOT_EXECUTABLE`.
- Do not change README command ordering or dependency versions in this PR.

---

### Task 1: Add the Godot editor regression test

**Files:**
- Create: `mcp-server/tests/godot-editor-integration.test.mjs`
- Modify: `mcp-server/package.json`

**Interfaces:**
- Consumes: `GODOT_EXECUTABLE`, `GodotBridge`, addon files under `addons/godot_mcp`.
- Produces: `npm run test:godot`, which exits nonzero when first-call authentication or returned node paths are broken.

- [ ] **Step 1: Add the opt-in test script**

Add `"test:godot": "node --test tests/godot-editor-integration.test.mjs"` to `package.json`.

- [ ] **Step 2: Write the real-editor failing test**

Create the test with this complete harness:

```js
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { GodotBridge } from "../dist/godot-bridge.js";

const godotExecutable = process.env.GODOT_EXECUTABLE;
assert.ok(godotExecutable, "GODOT_EXECUTABLE is required");

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(serverRoot, "..");
let projectRoot;
let tokenPath;
let editor;
let editorOutput = "";
let bridge;

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await delay(50);
  }
  return predicate();
}

before(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "godot-mcp-integration-"));
  await cp(join(repositoryRoot, "addons"), join(projectRoot, "addons"), { recursive: true });
  await writeFile(join(projectRoot, "project.godot"), `[application]
config/name="Godot MCP Integration"

[editor_plugins]
enabled=PackedStringArray("res://addons/godot_mcp/plugin.cfg")

[rendering]
renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
`);
  await writeFile(join(projectRoot, "audit_scene.tscn"), `[gd_scene format=3]

[node name="Root" type="Node3D"]
`);
  tokenPath = join(projectRoot, ".godot", "godot-mcp-token");
  editor = spawn(godotExecutable, [
    "--headless", "--editor", "--path", projectRoot, "res://audit_scene.tscn"
  ], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  editor.stdout.on("data", (chunk) => { editorOutput += chunk.toString(); });
  editor.stderr.on("data", (chunk) => { editorOutput += chunk.toString(); });
  assert.equal(
    await waitFor(() => editorOutput.includes("Godot MCP bridge listening"), 15000),
    true,
    editorOutput
  );
  bridge = new GodotBridge({
    host: "127.0.0.1",
    port: 8765,
    token: () => existsSync(tokenPath) ? readFileSync(tokenPath, "utf8").trim() : ""
  });
});

after(async () => {
  if (bridge) await bridge.close().catch(() => {});
  if (editor?.exitCode === null) {
    editor.kill();
    await waitFor(() => editor.exitCode !== null, 5000);
    if (editor.exitCode === null) editor.kill("SIGKILL");
  }
  if (projectRoot) await rm(projectRoot, { recursive: true, force: true });
});

test("creates the token before the first bridge authentication", async () => {
  assert.equal(await waitFor(() => existsSync(tokenPath), 5000), true);
  await bridge.connect();
  const status = await bridge.request("editor.status", {});
  assert.match(status.godotVersion, /^4\.7(?:\.1)?-stable/);
});

test("returns a created node path that resolves for later mutations", async () => {
  const created = await bridge.request("scene.create_node", {
    parentPath: ".", type: "Node3D", name: "AuditChild"
  });
  const tree = await bridge.request("scene.get_tree", { maxDepth: 2 });
  assert.equal(created.nodePath, "AuditChild");
  assert.equal(tree.nodes.some((node) => node.path === created.nodePath), true);
  await bridge.request("scene.set_property", {
    nodePath: created.nodePath,
    property: "position",
    value: { $godotType: "Vector3", x: 1, y: 2, z: 3 }
  });
  await bridge.request("scene.delete_node", { nodePath: created.nodePath, confirm: true });
  const afterDelete = await bridge.request("scene.get_tree", { maxDepth: 2 });
  assert.equal(afterDelete.nodes.some((node) => node.path === created.nodePath), false);
});
```

- [ ] **Step 3: Run the test and verify RED**

Run:

```powershell
$env:GODOT_EXECUTABLE='C:\path\to\Godot_v4.7-stable_win64.exe'
npm run build
npm run test:godot
```

Expected: FAIL because `.godot/godot-mcp-token` is absent before the first authentication attempt.

- [ ] **Step 4: Commit the regression test**

```powershell
git add mcp-server/package.json mcp-server/tests/godot-editor-integration.test.mjs
git commit -m "test: cover Godot editor bridge regressions"
```

---

### Task 2: Initialize the token before listening

**Files:**
- Modify: `addons/godot_mcp/rpc_dispatcher.gd`
- Modify: `addons/godot_mcp/bridge_server.gd`

**Interfaces:**
- Consumes: project-local `.godot/godot-mcp-token` path.
- Produces: `RpcDispatcher.initialize_token() -> bool`; the bridge listens only when it returns `true`.

- [ ] **Step 1: Expose reliable token initialization**

Add:

```gdscript
func initialize_token() -> bool:
    return not _get_token().is_empty()
```

When creating a token, assign `token` only after `FileAccess.open()` succeeds:

```gdscript
var generated_token = str(Time.get_ticks_usec()) + "-" + str(randi())
var file = FileAccess.open(path, FileAccess.WRITE)
if file == null:
    return ""
file.store_string(generated_token)
token = generated_token
```

- [ ] **Step 2: Gate bridge startup on token initialization**

In `BridgeServer.start()` before `create_server()`:

```gdscript
if not dispatcher.initialize_token():
    push_error("Godot MCP bridge failed to initialize authentication token")
    return
```

- [ ] **Step 3: Re-run the integration test**

Run `npm run test:godot` with Godot 4.7.

Expected: token and first-authentication test PASS; created-path test FAIL because the actual child still has a generated Godot name.

- [ ] **Step 4: Commit the authentication fix**

```powershell
git add addons/godot_mcp/rpc_dispatcher.gd addons/godot_mcp/bridge_server.gd
git commit -m "fix: initialize bridge token before listening"
```

---

### Task 3: Apply the requested node name before insertion

**Files:**
- Modify: `addons/godot_mcp/scene_operations.gd`

**Interfaces:**
- Consumes: validated `node_name` supplied by the MCP mutation schema.
- Produces: a created `Node` whose actual scene-tree path equals the returned `nodePath`.

- [ ] **Step 1: Apply the name before the undo action adds the node**

Immediately after validating the instantiated object:

```gdscript
created.name = node_name
```

- [ ] **Step 2: Run the integration test and verify GREEN**

Run `npm run test:godot` with Godot 4.7.

Expected: both integration tests PASS, including property mutation and deletion through `AuditChild`.

- [ ] **Step 3: Run the complete repository checks**

```powershell
npm run typecheck
npm run build
npm test
```

Run both included GDScript smoke scripts with Godot 4.7 and 4.7.1. Expected: all commands exit 0.

- [ ] **Step 4: Commit the node-name fix**

```powershell
git add addons/godot_mcp/scene_operations.gd
git commit -m "fix: preserve requested names for created nodes"
```

---

### Task 4: Publish the verified branch

**Files:**
- Review all committed files; do not stage prior audit artifacts or `.uid` files.

**Interfaces:**
- Consumes: verified branch `fix/godot-47-runtime-defects`.
- Produces: pushed branch and draft PR against `main`.

- [ ] **Step 1: Verify final scope and clean tracked diff**

Run `git status -sb`, `git diff main...HEAD --check`, and `git diff main...HEAD --stat`.

- [ ] **Step 2: Push the branch**

Push with `git push -u origin fix/godot-47-runtime-defects`.

- [ ] **Step 3: Open a draft PR**

Title: `Fix Godot 4.7 bridge authentication and node creation`

The body must explain both root causes, first-call and mutation impact, and list TypeScript, Godot 4.7, Godot 4.7.1, and real-editor integration checks.
