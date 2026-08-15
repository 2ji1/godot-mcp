import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installProject } from "../dist/setup-project.js";

const sandbox = mkdtempSync(join(tmpdir(), "godot-mcp-project-setup-"));

function createServerRoot(name) {
  const serverRoot = join(sandbox, name);
  mkdirSync(join(serverRoot, "addons", "godot_mcp"), { recursive: true });
  mkdirSync(join(serverRoot, "mcp-server", "dist"), { recursive: true });
  writeFileSync(join(serverRoot, "addons", "godot_mcp", "plugin.cfg"), "author=\"2ji1\"\n");
  writeFileSync(join(serverRoot, "mcp-server", "dist", "index.js"), "");
  writeFileSync(
    join(serverRoot, ".godot-mcp.example.json"),
    '{"host":"127.0.0.1","port":8765,"projectRoot":".","tokenPath":".godot/godot-mcp-token"}\n'
  );
  return serverRoot;
}

function createProject(name) {
  const projectRoot = join(sandbox, name);
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(join(projectRoot, "project.godot"), "[application]\n");
  return projectRoot;
}

try {
  const serverRoot = createServerRoot("server");
  const projectRoot = createProject("project");
  const godotExecutable = join(sandbox, "Godot.exe");
  writeFileSync(godotExecutable, "");

  installProject({ projectRoot, serverRoot, godotExecutable, force: false });

  assert.equal(existsSync(join(projectRoot, "addons", "godot_mcp", "plugin.cfg")), true);
  assert.equal(existsSync(join(projectRoot, ".godot-mcp.json")), true);
  const firstConfig = readFileSync(join(projectRoot, ".codex", "config.toml"), "utf8");
  assert.match(firstConfig, /# BEGIN godot-mcp managed config/);
  assert.match(firstConfig, /\[mcp_servers\.godot\]/);
  assert.match(firstConfig, /GODOT_PROJECT_ROOT/);
  assert.match(firstConfig, /GODOT_EXECUTABLE/);

  writeFileSync(join(projectRoot, ".godot-mcp.json"), "custom\n");
  writeFileSync(
    join(projectRoot, ".codex", "config.toml"),
    `model = "gpt-test"\n\n${firstConfig}`
  );
  installProject({ projectRoot, serverRoot, godotExecutable, force: true });
  const updatedConfig = readFileSync(join(projectRoot, ".codex", "config.toml"), "utf8");
  assert.match(updatedConfig, /^model = "gpt-test"/);
  assert.equal(updatedConfig.match(/# BEGIN godot-mcp managed config/g)?.length, 1);
  assert.equal(readFileSync(join(projectRoot, ".godot-mcp.json"), "utf8"), "custom\n");

  assert.throws(
    () => installProject({ projectRoot, serverRoot, godotExecutable, force: false }),
    /already exists/
  );

  const conflictingProject = createProject("conflict");
  mkdirSync(join(conflictingProject, ".codex"), { recursive: true });
  writeFileSync(
    join(conflictingProject, ".codex", "config.toml"),
    "[mcp_servers.godot]\ncommand = \"custom\"\n"
  );
  assert.throws(
    () => installProject({
      projectRoot: conflictingProject,
      serverRoot,
      godotExecutable,
      force: false
    }),
    /unmanaged \[mcp_servers\.godot\]/
  );

  const workspaceRoot = join(sandbox, "workspace");
  const nestedProject = join(workspaceRoot, "godot-project");
  mkdirSync(nestedProject, { recursive: true });
  writeFileSync(join(nestedProject, "project.godot"), "[application]\n");
  installProject({
    projectRoot: nestedProject,
    codexProjectRoot: workspaceRoot,
    serverRoot,
    godotExecutable,
    force: false
  });
  assert.equal(existsSync(join(workspaceRoot, ".codex", "config.toml")), true);
  assert.equal(existsSync(join(nestedProject, ".codex", "config.toml")), false);

  console.log("project-setup.test.mjs passed");
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
