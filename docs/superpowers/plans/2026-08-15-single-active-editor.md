# Single Active Editor Automatic Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one globally configured MCP server work with any prepared Godot 4 project by automatically targeting the only editor currently listening on `127.0.0.1:8765`.

**Architecture:** The MCP server and every installed addon share one user-scoped authentication token. `setup-project` only installs or updates `addons/godot_mcp`; it never writes project MCP or Codex configuration. Every editor tool resolves the live editor through the fixed loopback bridge, and runtime launch resolves its project directory from a fresh `editor.status` response.

**Tech Stack:** TypeScript 5.9, Node.js 24, `ws`, MCP TypeScript SDK, Zod, Godot 4.7 GDScript, Node test runner, GitHub Actions.

## Global Constraints

- Preserve the existing nine MCP tool names and their schemas.
- Do not use `GODOT_PROJECT_ROOT`, `.godot-mcp.json`, project `.codex/config.toml`, or MCP workspace roots for editor selection.
- Allow exactly one active addon listener on `127.0.0.1:8765`; a second editor must report `EDITOR_ALREADY_ACTIVE` and stay disconnected.
- Store one shared token outside projects. Defaults are `%LOCALAPPDATA%/godot-mcp/auth-token` on Windows, `~/Library/Application Support/godot-mcp/auth-token` on macOS, and `${XDG_STATE_HOME:-~/.local/state}/godot-mcp/auth-token` on Linux.
- Support `GODOT_MCP_TOKEN_PATH` only as an advanced/test override; it is not a project selector.
- Never stage or overwrite the checkout-local untracked `.godot-mcp.json` used for earlier diagnostics.
- Keep compatibility with Godot 4.7 and 4.7.1.

---

### Task 1: Introduce the shared user token store

**Files:**
- Create: `mcp-server/src/user-token.ts`
- Create: `mcp-server/tests/user-token.test.mjs`
- Modify: `mcp-server/tests/run-tests.mjs`
- Modify: `mcp-server/src/index.ts`
- Delete: `mcp-server/src/config.ts`
- Delete: `mcp-server/tests/config.test.mjs`

- [ ] **Step 1: Write failing path-resolution and lifecycle tests**

Test these exact behaviors with isolated temporary directories:

```js
assert.equal(resolveUserTokenPath({
  platform: "win32",
  env: { LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local" },
  homeDir: "C:\\Users\\tester"
}), resolve("C:\\Users\\tester\\AppData\\Local", "godot-mcp", "auth-token"));

const first = getOrCreateUserToken({ tokenPath });
const second = getOrCreateUserToken({ tokenPath });
assert.match(first, /^[a-f0-9]{64}$/);
assert.equal(second, first);

const rotated = rotateUserToken({ tokenPath });
assert.notEqual(rotated, first);
assert.equal(readFileSync(tokenPath, "utf8"), rotated + "\n");
```

Also cover macOS, Linux with and without `XDG_STATE_HOME`, `GODOT_MCP_TOKEN_PATH`, a missing Windows `LOCALAPPDATA` fallback, an empty/corrupt token, and exclusive-create recovery when another process wins the first write.

- [ ] **Step 2: Run the token tests and confirm failure**

Run: `npm run build && node --test tests/user-token.test.mjs`

Expected: build or import failure because `dist/user-token.js` does not exist.

- [ ] **Step 3: Implement the token API**

Export these interfaces:

```ts
export type UserTokenOptions = {
  tokenPath?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
};

export function resolveUserTokenPath(options?: UserTokenOptions): string;
export function readUserToken(options?: UserTokenOptions): string;
export function getOrCreateUserToken(options?: UserTokenOptions): string;
export function rotateUserToken(options?: UserTokenOptions): string;
```

Use `randomBytes(32).toString("hex")`, `mkdirSync(..., { recursive: true })`, and `writeFileSync(..., { flag: "wx", mode: 0o600 })`. On `EEXIST`, read and validate the winner's token. Reject blank or malformed token content with a message containing `TOKEN_INVALID`; only `rotateUserToken` may replace an existing token.

- [ ] **Step 4: Replace project config startup with fixed bridge startup**

`mcp-server/src/index.ts` must construct the bridge with:

```ts
const bridge = new GodotBridge({
  host: "127.0.0.1",
  port: 8765,
  token: () => getOrCreateUserToken()
});
```

Remove every import and use of `loadConfig`, `GODOT_PROJECT_ROOT`, and project token paths. Delete the obsolete config module and tests.

- [ ] **Step 5: Run focused and full Node tests**

Run: `npm run build && node --test tests/user-token.test.mjs && npm test`

Expected: all tests pass and no source import references `./config.js`.

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/index.ts mcp-server/src/user-token.ts mcp-server/tests/user-token.test.mjs mcp-server/tests/run-tests.mjs mcp-server/src/config.ts mcp-server/tests/config.test.mjs
git commit -m "refactor: use shared user authentication token"
```

### Task 2: Reduce `setup-project` to addon installation

**Files:**
- Modify: `mcp-server/src/setup-project.ts`
- Rewrite: `mcp-server/tests/project-setup.test.mjs`

- [ ] **Step 1: Replace setup tests with the new contract**

The tests must create a temporary server root and Godot project and assert:

```js
const result = installProject({
  projectRoot,
  serverRoot,
  force: false,
  repairToken: false,
  tokenPath
});

assert.equal(result.addonPath, join(projectRoot, "addons", "godot_mcp"));
assert.equal(result.tokenPath, tokenPath);
assert.equal(existsSync(join(projectRoot, ".godot-mcp.json")), false);
assert.equal(existsSync(join(projectRoot, ".codex", "config.toml")), false);
```

Cover missing `project.godot`, first install, refusal to overwrite without `--force`, successful update with `--force`, idempotent token reuse, malformed token refusal, and successful `--repair-token` rotation.

- [ ] **Step 2: Run the setup test and confirm the old API fails**

Run: `npm run build && node --test tests/project-setup.test.mjs`

Expected: assertions fail because the current implementation writes `.godot-mcp.json` and `.codex/config.toml` and requires a Godot executable.

- [ ] **Step 3: Implement the narrow setup API and CLI**

Use these contracts:

```ts
export type ProjectSetupOptions = {
  projectRoot: string;
  serverRoot: string;
  force: boolean;
  repairToken: boolean;
  tokenPath?: string;
};

export type ProjectSetupResult = {
  projectRoot: string;
  addonPath: string;
  tokenPath: string;
};
```

The CLI usage must be:

```text
npm run setup-project -- --project-root <path> [--force] [--repair-token]
```

Keep `--server-root` as a documented development-only override. Remove `--godot-executable` and `--codex-project-root`. Call `getOrCreateUserToken`, or `rotateUserToken` only when `--repair-token` is present. Copy only `addons/godot_mcp`.

- [ ] **Step 4: Run focused and full tests**

Run: `npm run build && node --test tests/project-setup.test.mjs && npm test`

Expected: all tests pass and test project directories contain neither project config file.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/setup-project.ts mcp-server/tests/project-setup.test.mjs
git commit -m "refactor: make project setup addon-only"
```

### Task 3: Make the Godot addon consume the shared token and enforce one editor

**Files:**
- Create: `addons/godot_mcp/user_token.gd`
- Create: `tests/godot_user_token_smoke.gd`
- Modify: `addons/godot_mcp/rpc_dispatcher.gd`
- Modify: `addons/godot_mcp/bridge_server.gd`
- Modify: `tests/godot_plugin_smoke.gd`

- [ ] **Step 1: Add a failing Godot token smoke test**

The test must set `GODOT_MCP_TOKEN_PATH` to a temporary file before loading `user_token.gd`, then assert that `resolve_path()` returns the override, `read_token()` returns a valid 64-character lowercase hex token, and a missing file returns an error dictionary with code `TOKEN_NOT_FOUND`. It must not create the missing file.

- [ ] **Step 2: Run the smoke test and confirm failure**

Run with each installed executable:

```powershell
& $godot47 --headless --path . --script tests/godot_user_token_smoke.gd
& $godot471 --headless --path . --script tests/godot_user_token_smoke.gd
```

Expected: preload failure because `addons/godot_mcp/user_token.gd` does not exist.

- [ ] **Step 3: Implement cross-platform token lookup**

`user_token.gd` must expose:

```gdscript
static func resolve_path() -> String
static func read_token() -> Dictionary
```

Resolution order is `GODOT_MCP_TOKEN_PATH`, Windows `LOCALAPPDATA`, macOS `HOME/Library/Application Support`, Linux `XDG_STATE_HOME`, then Linux `HOME/.local/state`. `read_token()` returns `{"token": token}` or `{"error": {"code": "TOKEN_NOT_FOUND" | "TOKEN_INVALID", "message": ...}}`; it never generates or writes a token.

- [ ] **Step 4: Use the token helper in the dispatcher**

Replace `_get_token()` project-file generation with one initialization read. `initialize_token()` stores the token once. Authentication compares against that cached token and continues returning `AUTHENTICATION_FAILED` for a mismatch.

- [ ] **Step 5: Emit stable startup diagnostics**

In `bridge_server.gd`, emit exact codes in editor output:

```gdscript
push_error("TOKEN_NOT_FOUND: Godot MCP shared authentication token is unavailable")
push_error("EDITOR_ALREADY_ACTIVE: Another Godot editor already owns 127.0.0.1:8765")
```

Use `ERR_ALREADY_IN_USE` when available and fall back to the same `EDITOR_ALREADY_ACTIVE` code for any bind failure on the fixed loopback endpoint. Do not select another port.

- [ ] **Step 6: Run all Godot smoke tests on 4.7 and 4.7.1**

Run `godot_plugin_smoke.gd`, `godot_typed_values_smoke.gd`, and `godot_user_token_smoke.gd` under both versions with an isolated token override.

Expected: every process exits 0 and no parser errors are printed.

- [ ] **Step 7: Commit**

```bash
git add addons/godot_mcp/user_token.gd addons/godot_mcp/rpc_dispatcher.gd addons/godot_mcp/bridge_server.gd tests/godot_user_token_smoke.gd tests/godot_plugin_smoke.gd
git commit -m "feat: connect addon with shared user token"
```

### Task 4: Resolve every operation through the active editor

**Files:**
- Create: `mcp-server/src/active-editor.ts`
- Create: `mcp-server/tests/active-editor.test.mjs`
- Modify: `mcp-server/src/godot-bridge.ts`
- Modify: `mcp-server/src/tools/runtime.ts`
- Modify: `mcp-server/src/index.ts`
- Modify: `mcp-server/tests/godot-bridge.test.mjs`
- Modify: `mcp-server/tests/runtime.test.mjs`
- Modify: `mcp-server/tests/run-tests.mjs`

- [ ] **Step 1: Write failing active-editor and runtime tests**

Define and test:

```ts
export type ActiveEditorStatus = {
  projectPath: string;
  godotVersion: string;
  scenePath: string;
  rootName: string;
  rootType: string;
};

export async function getActiveEditorStatus(bridge: GodotBridge): Promise<ActiveEditorStatus>;
```

Assert it calls `editor.status` every time, rejects a blank/missing `projectPath` with `NO_ACTIVE_EDITOR`, and returns the live path unchanged. Update runtime tests so `godot_run_project` first requests status and passes that returned path to `RuntimeManager.run`.

- [ ] **Step 2: Add bridge disconnect and reconnect tests**

Use ephemeral WebSocket ports. Assert connection refusal becomes `BridgeError("NO_ACTIVE_EDITOR", ...)`, authentication rejection remains `AUTHENTICATION_FAILED`, closing editor A rejects in-flight work with `BRIDGE_CLOSED`, and a later request connects to editor B using the same `GodotBridge` instance.

- [ ] **Step 3: Run focused tests and confirm failures**

Run: `npm run build && node --test tests/active-editor.test.mjs tests/godot-bridge.test.mjs tests/runtime.test.mjs`

Expected: missing module/API failures and old `BRIDGE_CONNECTION_FAILED`/fixed-root behavior.

- [ ] **Step 4: Implement active status validation**

Use a Zod object schema for the five status fields. Convert connection absence to `NO_ACTIVE_EDITOR`. Do not cache `projectPath`; every operation that needs it gets a fresh status result.

- [ ] **Step 5: Harden bridge lifecycle**

On `close` and terminal `error`, clear `this.socket` only if the event belongs to the current socket, reject pending requests once with `BRIDGE_CLOSED`, and allow the next request to create a fresh socket. Convert `ECONNREFUSED`, `ENETUNREACH`, and connect timeout into `NO_ACTIVE_EDITOR`; preserve protocol error codes returned by the addon.

- [ ] **Step 6: Make runtime launch dynamic**

Change registration to:

```ts
registerRuntimeTools(server, bridge, runtime);
```

`godot_run_project` calls `getActiveEditorStatus(bridge)` immediately before `runtime.run(status.projectPath)`. With no editor it returns a tool error beginning `NO_ACTIVE_EDITOR:`. `godot_stop_project` remains PID-based and `godot_editor_errors` retains its local-error fallback.

- [ ] **Step 7: Run focused and full tests**

Run: `npm run build && npm run typecheck && node --test tests/active-editor.test.mjs tests/godot-bridge.test.mjs tests/runtime.test.mjs && npm test`

Expected: all tests pass and `rg "GODOT_PROJECT_ROOT|loadConfig|projectRoot, runtime" mcp-server/src` returns no matches.

- [ ] **Step 8: Commit**

```bash
git add mcp-server/src/active-editor.ts mcp-server/src/godot-bridge.ts mcp-server/src/tools/runtime.ts mcp-server/src/index.ts mcp-server/tests/active-editor.test.mjs mcp-server/tests/godot-bridge.test.mjs mcp-server/tests/runtime.test.mjs mcp-server/tests/run-tests.mjs
git commit -m "feat: follow the single active Godot editor"
```

### Task 5: Prove editor handoff and single-editor enforcement

**Files:**
- Modify: `mcp-server/tests/godot-editor-integration.test.mjs`
- Modify: `mcp-server/package.json`

- [ ] **Step 1: Extend the real-editor integration harness**

Create two temporary Godot projects A and B. Install the addon into both, share one temporary token through `GODOT_MCP_TOKEN_PATH`, and launch editors with the requested `GODOT_EXECUTABLE`.

- [ ] **Step 2: Add the editor handoff scenario**

Using one `GodotBridge` instance:

1. Start editor A and wait until `editor.status.projectPath` equals A.
2. Stop A and wait for the socket close.
3. Confirm a request returns `NO_ACTIVE_EDITOR` while no editor listens.
4. Start B and confirm the next request returns B without restarting the MCP process.

- [ ] **Step 3: Add the simultaneous-editor scenario**

Keep A running, launch B, capture B's output, and assert it contains `EDITOR_ALREADY_ACTIVE`. Confirm the bridge still reports project A. Stop A, restart B, and confirm B then owns the endpoint.

- [ ] **Step 4: Run integration tests against Godot 4.7 and 4.7.1**

```powershell
$env:GODOT_EXECUTABLE = "C:\Users\noisy\AppData\Local\Temp\codex-godot-mcp-47-audit\godot47\Godot_v4.7-stable_win64.exe"
npm run test:godot
$env:GODOT_EXECUTABLE = "C:\Users\noisy\AppData\Local\Temp\codex-godot-mcp-47-audit\godot471\Godot_v4.7.1-stable_win64.exe"
npm run test:godot
```

Expected: both runs pass, A-to-B handoff requires no MCP restart, and B cannot connect while A owns port 8765.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/tests/godot-editor-integration.test.mjs mcp-server/package.json
git commit -m "test: cover active editor handoff"
```

### Task 6: Rewrite installation and migration documentation

**Files:**
- Modify: `README.md`
- Modify: `codex-mcp.config.example.toml`
- Modify: `.gitignore`
- Delete: `.godot-mcp.example.json`

- [ ] **Step 1: Replace the README setup flow**

Document this order with copy-pasteable commands:

1. Clone once and run `npm install && npm run build` in `mcp-server`.
2. Add one global Codex MCP entry whose `args` points to `mcp-server/dist/index.js` and whose only optional environment variable is `GODOT_EXECUTABLE`.
3. Prepare each Godot project with `npm run setup-project -- --project-root <path>`.
4. Enable `Godot MCP` in Project Settings > Plugins.
5. Keep only the intended editor open and use `godot_editor_status` to verify the selected project.

- [ ] **Step 2: Document behavior and troubleshooting**

Explain fixed port 8765, shared token locations, automatic A-to-B handoff, `--force`, `--repair-token`, and the five stable diagnostics: `NO_ACTIVE_EDITOR`, `EDITOR_ALREADY_ACTIVE`, `TOKEN_NOT_FOUND`, `AUTHENTICATION_FAILED`, and `BRIDGE_CLOSED`. State that `godot_run_project` launches the project reported by the active editor and returns `NO_ACTIVE_EDITOR` otherwise.

- [ ] **Step 3: Add an explicit migration section**

Tell existing users to remove `GODOT_PROJECT_ROOT`, remove project `[mcp_servers.godot]` blocks created by the old CLI, optionally delete `.godot-mcp.json`, rebuild the global server, rerun `setup-project -- --force` per project, and restart Codex once after changing the global entry.

- [ ] **Step 4: Update tracked examples and ignores**

The TOML example must contain no project path. Delete `.godot-mcp.example.json`. Remove the redundant `.godot/godot-mcp-token` ignore while retaining the general `.godot/` ignore.

- [ ] **Step 5: Verify documentation against the CLI**

Run:

```powershell
npm run setup-project -- --help
rg -n "GODOT_PROJECT_ROOT|\.godot-mcp\.json|codex-project-root|godot-mcp-token" README.md codex-mcp.config.example.toml mcp-server/src addons/godot_mcp
```

Expected: help output matches README; remaining legacy terms appear only in the migration section and nowhere in executable source or the example config.

- [ ] **Step 6: Commit**

```bash
git add README.md codex-mcp.config.example.toml .gitignore .godot-mcp.example.json
git commit -m "docs: explain single active editor setup"
```

### Task 7: Final verification, review, and pull request

**Files:**
- Review all files changed from `origin/main`

- [ ] **Step 1: Run the complete verification matrix**

Run from `mcp-server`:

```powershell
npm ci
npm run build
npm run typecheck
npm test
```

Then run all three headless smoke scripts and `npm run test:godot` with both Godot 4.7 and 4.7.1 as specified above.

- [ ] **Step 2: Inspect the complete diff and repository state**

Run:

```powershell
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git status --short
git log --oneline origin/main..HEAD
```

Expected: no whitespace errors; only the intentional untracked diagnostic `.godot-mcp.json` may remain outside commits.

- [ ] **Step 3: Perform a requirements review**

Confirm every acceptance criterion in `docs/superpowers/specs/2026-08-15-portable-project-setup-design.md`: no project pinning, addon-only setup, one listener, shared authentication, dynamic runtime path, reconnect after handoff, stable errors, migration documentation, and both supported Godot versions.

- [ ] **Step 4: Push and create a new PR**

Push `agent/single-active-editor` and create a PR to `main` titled `feat: connect to the single active Godot editor`. The PR body must summarize architecture, migration impact, and the exact verification commands/results. Do not include memory citations in the PR body.

- [ ] **Step 5: Verify the remote PR state**

Confirm the PR base/head SHAs, URL, and check status. Report any checks still pending without claiming they passed.
