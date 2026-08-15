import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  getOrCreateUserToken,
  readUserToken,
  resolveUserTokenPath,
  rotateUserToken
} from "../dist/user-token.js";

const root = mkdtempSync(join(tmpdir(), "godot-mcp-user-token-"));

try {
  assert.equal(
    resolveUserTokenPath({
      platform: "win32",
      env: { LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local" },
      homeDir: "C:\\Users\\tester"
    }),
    resolve("C:\\Users\\tester\\AppData\\Local", "godot-mcp", "auth-token")
  );
  assert.equal(
    resolveUserTokenPath({
      platform: "darwin",
      env: {},
      homeDir: "/Users/tester"
    }),
    "/Users/tester/Library/Application Support/godot-mcp/auth-token"
  );
  assert.equal(
    resolveUserTokenPath({
      platform: "linux",
      env: { XDG_STATE_HOME: "/state" },
      homeDir: "/home/tester"
    }),
    "/state/godot-mcp/auth-token"
  );
  assert.equal(
    resolveUserTokenPath({
      platform: "linux",
      env: {},
      homeDir: "/home/tester"
    }),
    "/home/tester/.local/state/godot-mcp/auth-token"
  );
  assert.equal(
    resolveUserTokenPath({
      platform: "linux",
      env: { GODOT_MCP_TOKEN_PATH: join(root, "override-token") },
      homeDir: "/home/tester"
    }),
    join(root, "override-token")
  );

  const tokenPath = join(root, "nested", "auth-token");
  const first = getOrCreateUserToken({ tokenPath });
  const second = getOrCreateUserToken({ tokenPath });
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(second, first);
  assert.equal(readFileSync(tokenPath, "utf8"), first + "\n");
  assert.equal(readUserToken({ tokenPath }), first);

  const rotated = rotateUserToken({ tokenPath });
  assert.match(rotated, /^[a-f0-9]{64}$/);
  assert.notEqual(rotated, first);
  assert.equal(readFileSync(tokenPath, "utf8"), rotated + "\n");

  const malformedPath = join(root, "malformed", "auth-token");
  mkdirSync(join(root, "malformed"), { recursive: true });
  writeFileSync(malformedPath, "not-a-token\n", "utf8");
  assert.throws(
    () => readUserToken({ tokenPath: malformedPath }),
    /TOKEN_INVALID/
  );
  assert.throws(
    () => getOrCreateUserToken({ tokenPath: malformedPath }),
    /TOKEN_INVALID/
  );

  console.log("user-token.test.mjs passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
