import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = mkdtempSync(join(tmpdir(), "godot-mcp-server-startup-"));
const tokenPath = join(root, "state", "auth-token");
let stderr = "";
const child = spawn(process.execPath, [fileURLToPath(new URL("../dist/index.js", import.meta.url))], {
  env: { ...process.env, GODOT_MCP_TOKEN_PATH: tokenPath },
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true
});
child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  const deadline = Date.now() + 3000;
  while (!existsSync(tokenPath) && child.exitCode === null && Date.now() < deadline) {
    await delay(25);
  }
  assert.equal(
    existsSync(tokenPath),
    true,
    `MCP startup must prepare the shared token before any tool call\nexit=${child.exitCode}\n${stderr}`
  );
  console.log("server-startup.test.mjs passed");
} finally {
  if (child.exitCode === null) {
    child.kill();
    await once(child, "exit");
  }
  rmSync(root, { recursive: true, force: true });
}
