# Portable Single-Active-Editor Godot MCP

## Status

This design replaces the earlier project-scoped Codex configuration design on the same feature branch. The MCP server will be installed once and configured globally. Individual Godot projects will receive only the editor addon through `setup-project`.

## Goal

Allow one global Godot MCP server to work with any prepared Godot 4 project without a project path in Codex configuration. The currently open Godot editor is the active project. Closing that editor and opening another prepared project switches the MCP target automatically on the next tool call.

The plugin author metadata remains `2ji1`.

## Non-goals

- Supporting multiple simultaneously connected Godot editors.
- Remembering or launching the last project when no editor is open.
- Installing an editor addon silently without an explicit `setup-project` command.
- Using MCP client roots as the primary project-selection mechanism.

## Architecture

### Global MCP server

Codex starts one STDIO MCP server from the reusable godot-mcp installation. Its configuration contains the server entrypoint and `GODOT_EXECUTABLE`, but no `GODOT_PROJECT_ROOT`, project-specific working directory, or project config path.

The server does not read `.godot-mcp.json` during startup. It owns an `ActiveEditorBridge` configured with the fixed loopback endpoint `127.0.0.1:8765` and the shared user token. Editor-dependent tools resolve the project only after an authenticated bridge connection succeeds.

### Project addon

Each prepared Godot project contains `addons/godot_mcp`. When enabled, the addon listens on `127.0.0.1:8765`. The fixed port intentionally enforces the single-active-editor rule: a second enabled editor cannot become active while another editor owns the port.

The addon reads the same user-scoped token as the MCP server. It never writes a secret into the project directory.

### Shared token store

The server and setup CLI use one cross-platform token location:

- Windows: `%LOCALAPPDATA%\godot-mcp\auth-token`
- macOS: `~/Library/Application Support/godot-mcp/auth-token`
- Linux: `${XDG_STATE_HOME:-~/.local/state}/godot-mcp/auth-token`

The server and setup CLI create a cryptographically random token when missing. Creation must be exclusive so concurrent first use cannot replace an existing token. The Godot addon reads the token and reports a clear setup error if it is unavailable.

### Project setup CLI

The supported command is:

```powershell
npm run setup-project -- --project-root "D:\path\to\project"
```

The command:

1. validates that the target contains `project.godot`;
2. creates the shared user token when missing;
3. copies `addons/godot_mcp` into the target project;
4. refuses to replace an existing addon unless `--force` is supplied; and
5. prints the Godot plugin activation and restart instructions.

It does not create `.godot-mcp.json`, `.codex/config.toml`, or any project-root setting. It does not change the user's global Codex configuration.

The optional `--repair-token` flag rotates the shared token after an authentication failure. Because the token is user-scoped, rotation repairs every prepared project without copying a secret into those projects. Godot editors must be restarted after rotation.

## Connection and project resolution

1. Codex starts the global MCP server independently of Godot.
2. A tool call asks `ActiveEditorBridge` for a connection.
3. The bridge connects to `127.0.0.1:8765`, authenticates with the shared token, and requests `editor.status`.
4. `editor.status.projectPath` becomes the project path for that request.
5. Editor tools are forwarded over the authenticated bridge.
6. `godot_run_project` resolves the active editor status immediately before launching and uses that `projectPath`.
7. `godot_stop_project` stops only the process tracked by the current MCP server.
8. When the editor closes, the bridge clears its socket and active-project state. The next tool call attempts a fresh connection, allowing another prepared editor to become active.

The server must not cache a project path across a bridge disconnect.

## Error handling

- No listener on port 8765: return `NO_ACTIVE_EDITOR` with instructions to open Godot and enable the addon.
- A second editor cannot bind port 8765: log `EDITOR_ALREADY_ACTIVE` in Godot and leave the first editor connection unchanged.
- Shared token missing in the addon: log `TOKEN_NOT_FOUND` and direct the user to rerun `setup-project`.
- Token mismatch: return `AUTHENTICATION_FAILED` and direct the user to run `setup-project --repair-token`, then restart Godot.
- Connected editor has no open scene: preserve `NO_ACTIVE_SCENE` for scene mutations.
- `godot_run_project` with no active editor: return `NO_ACTIVE_EDITOR`; never fall back to a remembered project.
- Bridge closes during a request: fail that request with `BRIDGE_CLOSED`; reconnect only on the next request.

## Migration from project-scoped configuration

The README will instruct existing users to remove `GODOT_PROJECT_ROOT` and the project-specific server block generated in `.codex/config.toml`, then keep a single global MCP server entry. Legacy `.godot-mcp.json` files are no longer read and may be removed manually. The setup CLI reports legacy files but does not delete user files automatically.

## README structure

The root README will be rewritten around the final behavior:

1. architecture and safety boundaries;
2. one-time global server installation and Codex configuration;
3. per-project `setup-project` usage;
4. plugin activation;
5. single-active-editor connection and project switching;
6. migration from the old project-bound configuration;
7. troubleshooting for `NO_ACTIVE_EDITOR`, `EDITOR_ALREADY_ACTIVE`, and authentication errors;
8. update and development commands;
9. available tools; and
10. verified Godot 4.7 and 4.7.1 support.

## Testing

### Unit tests

- Resolve the user token path on Windows, macOS, and Linux inputs.
- Create and preserve a shared token without replacing it.
- Rotate the token only when `--repair-token` is explicitly supplied.
- Start the MCP server without `GODOT_PROJECT_ROOT` or `.godot-mcp.json`.
- Verify that `setup-project` copies only the addon and preserves unrelated project files.
- Verify overwrite refusal and `--force` updates.
- Map connection refusal to `NO_ACTIVE_EDITOR`.
- Clear active project state on bridge disconnect.
- Resolve `godot_run_project` from fresh `editor.status.projectPath` data.

### Integration tests

- Connect and authenticate against a Godot 4.7 editor.
- Connect and authenticate against a Godot 4.7.1 editor.
- Close project A, open project B, and verify automatic reconnection and the new project path.
- Start a second enabled editor and verify the port-conflict diagnostic while project A remains usable.
- Verify scene reads, mutations, run, stop, and editor error reporting against the active editor.

## Acceptance criteria

- Codex has one global Godot MCP server entry with no project path.
- Any project prepared by `setup-project` connects when it is the only enabled Godot editor listening on port 8765.
- Switching editors requires no Codex configuration change or MCP reinstall.
- No project-specific configuration or token file is required.
- Editor-dependent tools fail safely and clearly when no editor is active.
- Godot 4.7 and 4.7.1 verification passes.
- The README documents the implemented workflow exactly.
