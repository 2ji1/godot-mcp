import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installProject } from "../dist/setup-project.js";

const sandbox = mkdtempSync(join(tmpdir(), "godot-mcp-project-setup-"));

function createServerRoot(name) {
  const serverRoot = join(sandbox, name);
  mkdirSync(join(serverRoot, "addons", "godot_mcp"), { recursive: true });
  writeFileSync(join(serverRoot, "addons", "godot_mcp", "plugin.cfg"), "author=\"2ji1\"\n");
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
  const tokenPath = join(sandbox, "state", "auth-token");

  const result = installProject({ projectRoot, serverRoot, force: false, repairToken: false, tokenPath });
  assert.equal(result.projectRoot, projectRoot);
  assert.equal(result.addonPath, join(projectRoot, "addons", "godot_mcp"));
  assert.equal(result.tokenPath, tokenPath);
  assert.equal(existsSync(join(projectRoot, "addons", "godot_mcp", "plugin.cfg")), true);
  assert.equal(existsSync(join(projectRoot, ".godot-mcp.json")), false);
  assert.equal(existsSync(join(projectRoot, ".codex", "config.toml")), false);
  const firstToken = readFileSync(tokenPath, "utf8").trim();
  assert.match(firstToken, /^[a-f0-9]{64}$/);

  assert.throws(
    () => installProject({ projectRoot, serverRoot, force: false, repairToken: false, tokenPath }),
    /already exists/
  );

  writeFileSync(join(serverRoot, "addons", "godot_mcp", "plugin.cfg"), "author=\"updated\"\n");
  installProject({ projectRoot, serverRoot, force: true, repairToken: false, tokenPath });
  assert.match(readFileSync(join(projectRoot, "addons", "godot_mcp", "plugin.cfg"), "utf8"), /updated/);
  assert.equal(readFileSync(tokenPath, "utf8").trim(), firstToken);

  writeFileSync(tokenPath, "broken\n", "utf8");
  const secondProject = createProject("second-project");
  assert.throws(
    () => installProject({ projectRoot: secondProject, serverRoot, force: false, repairToken: false, tokenPath }),
    /TOKEN_INVALID/
  );
  const repaired = installProject({
    projectRoot: secondProject,
    serverRoot,
    force: false,
    repairToken: true,
    tokenPath
  });
  const repairedToken = readFileSync(repaired.tokenPath, "utf8").trim();
  assert.match(repairedToken, /^[a-f0-9]{64}$/);
  assert.notEqual(repairedToken, "broken");

  const missingProject = join(sandbox, "missing-project");
  mkdirSync(missingProject, { recursive: true });
  assert.throws(
    () => installProject({ projectRoot: missingProject, serverRoot, force: false, repairToken: false, tokenPath }),
    /Godot project file does not exist/
  );

  const legacyProject = createProject("legacy-project");
  mkdirSync(join(legacyProject, ".codex"), { recursive: true });
  writeFileSync(join(legacyProject, ".godot-mcp.json"), "legacy project config\n");
  writeFileSync(join(legacyProject, ".codex", "config.toml"), "[mcp_servers.godot]\n");
  const legacyResult = installProject({
    projectRoot: legacyProject,
    serverRoot,
    force: false,
    repairToken: false,
    tokenPath
  });
  assert.deepEqual(legacyResult.legacyFiles, [
    join(legacyProject, ".godot-mcp.json"),
    join(legacyProject, ".codex", "config.toml")
  ]);
  assert.equal(readFileSync(join(legacyProject, ".godot-mcp.json"), "utf8"), "legacy project config\n");

  console.log("project-setup.test.mjs passed");
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
