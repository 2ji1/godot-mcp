import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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
const token = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

let sandbox;
let projectA;
let projectB;
let tokenPath;
let editorA;
let editorB;
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

async function createProject(name) {
  const projectRoot = join(sandbox, name);
  await mkdir(projectRoot, { recursive: true });
  await cp(join(repositoryRoot, "addons"), join(projectRoot, "addons"), { recursive: true });
  await writeFile(join(projectRoot, "project.godot"), `[application]
config/name="${name}"

[editor_plugins]
enabled=PackedStringArray("res://addons/godot_mcp/plugin.cfg")

[rendering]
renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
`);
  await writeFile(join(projectRoot, "audit_scene.tscn"), `[gd_scene format=3]

[node name="Root" type="Node3D"]
`);
  return projectRoot;
}

function startEditor(projectRoot) {
  let output = "";
  const child = spawn(godotExecutable, [
    "--headless",
    "--editor",
    "--path",
    projectRoot,
    "res://audit_scene.tscn"
  ], {
    env: { ...process.env, GODOT_MCP_TOKEN_PATH: tokenPath },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  return { child, output: () => output };
}

async function stopEditor(editor) {
  if (!editor || editor.child.exitCode !== null) {
    return;
  }
  editor.child.kill();
  await waitFor(() => editor.child.exitCode !== null, 5000);
  if (editor.child.exitCode === null) {
    editor.child.kill("SIGKILL");
    await waitFor(() => editor.child.exitCode !== null, 5000);
  }
}

async function waitForProject(projectRoot, editor) {
  let status;
  const ready = await waitFor(async () => {
    try {
      status = await bridge.request("editor.status", {});
      return resolve(status.projectPath) === resolve(projectRoot)
        && status.scenePath === "res://audit_scene.tscn";
    } catch {
      return false;
    }
  }, 15000);
  assert.equal(ready, true, editor.output());
  return status;
}

before(async () => {
  sandbox = await mkdtemp(join(tmpdir(), "godot-mcp-editor-handoff-"));
  projectA = await createProject("project-a");
  projectB = await createProject("project-b");
  tokenPath = join(sandbox, "state", "auth-token");
  await mkdir(dirname(tokenPath), { recursive: true });
  await writeFile(tokenPath, token + "\n");
  bridge = new GodotBridge({
    host: "127.0.0.1",
    port: 8765,
    token,
    connectTimeoutMs: 1000,
    requestTimeoutMs: 2000
  });
  editorA = startEditor(projectA);
  await waitForProject(projectA, editorA);
});

after(async () => {
  if (bridge) {
    await bridge.close().catch(() => {});
  }
  await stopEditor(editorA);
  await stopEditor(editorB);
  if (sandbox) {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("uses the active editor for authenticated scene operations", async () => {
  const status = await waitForProject(projectA, editorA);
  assert.match(status.godotVersion, /^4\.7(?:\.1)?-stable/);

  const created = await bridge.request("scene.create_node", {
    parentPath: ".",
    type: "Node3D",
    name: "AuditChild"
  });
  assert.equal(created.nodePath, "AuditChild");
  await bridge.request("scene.delete_node", { nodePath: created.nodePath, confirm: true });
});

test("enforces one editor and reconnects from project A to project B", async () => {
  editorB = startEditor(projectB);
  assert.equal(
    await waitFor(() => editorB.output().includes("EDITOR_ALREADY_ACTIVE"), 15000),
    true,
    editorB.output()
  );
  const stillA = await bridge.request("editor.status", {});
  assert.equal(resolve(stillA.projectPath), resolve(projectA));

  await stopEditor(editorB);
  editorB = undefined;
  await stopEditor(editorA);
  editorA = undefined;
  assert.equal(
    await waitFor(async () => {
      try {
        await bridge.request("editor.status", {});
        return false;
      } catch (error) {
        return error.code === "NO_ACTIVE_EDITOR";
      }
    }, 5000),
    true
  );

  editorB = startEditor(projectB);
  const statusB = await waitForProject(projectB, editorB);
  assert.equal(resolve(statusB.projectPath), resolve(projectB));
});
