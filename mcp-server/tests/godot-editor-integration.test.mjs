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
    if (await predicate()) {
      return true;
    }
    await delay(50);
  }
  return await predicate();
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
    "--headless",
    "--editor",
    "--path",
    projectRoot,
    "res://audit_scene.tscn"
  ], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  editor.stdout.on("data", (chunk) => {
    editorOutput += chunk.toString();
  });
  editor.stderr.on("data", (chunk) => {
    editorOutput += chunk.toString();
  });

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
  if (bridge) {
    await bridge.close().catch(() => {});
  }
  if (editor?.exitCode === null) {
    editor.kill();
    await waitFor(() => editor.exitCode !== null, 5000);
    if (editor.exitCode === null) {
      editor.kill("SIGKILL");
    }
  }
  if (projectRoot) {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("creates the token before the first bridge authentication", async () => {
  assert.equal(await waitFor(() => existsSync(tokenPath), 5000), true);
  await bridge.connect();
  let status;
  assert.equal(
    await waitFor(async () => {
      status = await bridge.request("editor.status", {});
      return status.scenePath === "res://audit_scene.tscn";
    }, 5000),
    true,
    editorOutput
  );
  assert.match(status.godotVersion, /^4\.7(?:\.1)?-stable/);
});

test("returns a created node path that resolves for later mutations", async () => {
  const created = await bridge.request("scene.create_node", {
    parentPath: ".",
    type: "Node3D",
    name: "AuditChild"
  });
  const tree = await bridge.request("scene.get_tree", { maxDepth: 2 });
  assert.equal(created.nodePath, "AuditChild");
  assert.equal(tree.nodes.some((node) => node.path === created.nodePath), true);

  await bridge.request("scene.set_property", {
    nodePath: created.nodePath,
    property: "position",
    value: { $godotType: "Vector3", x: 1, y: 2, z: 3 }
  });
  await bridge.request("scene.delete_node", {
    nodePath: created.nodePath,
    confirm: true
  });

  const afterDelete = await bridge.request("scene.get_tree", { maxDepth: 2 });
  assert.equal(afterDelete.nodes.some((node) => node.path === created.nodePath), false);
});
