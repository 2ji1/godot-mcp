# Godot Editor MCP

A local MCP server and Godot 4 editor plugin for safe editor automation from Codex-compatible clients. It is tested with Godot 4.7 and 4.7.1.

The server is configured once. Any Godot project prepared with the addon can become the target simply by being the single active editor.

## How project selection works

- Every prepared project contains only `addons/godot_mcp`.
- One global MCP server connects to `127.0.0.1:8765`.
- The editor that owns that loopback port is the active project.
- A second editor cannot take over while the first one is active; it reports `EDITOR_ALREADY_ACTIVE`.
- After closing editor A and opening or restarting editor B, the same MCP server reconnects to B automatically on its next tool call.
- `godot_run_project` launches the project path freshly reported by the active editor. It does not use a configured project directory.

There is no project `.godot-mcp.json`, no generated project `.codex/config.toml`, and no `GODOT_PROJECT_ROOT` selection.

## Install the global server once

Keep this repository in a reusable tools directory and install its dependencies:

```powershell
git clone https://github.com/2ji1/godot-mcp.git
Set-Location godot-mcp\mcp-server
npm install
npm run build
```

Add one global entry to your Codex config. On Windows this is normally `%USERPROFILE%\.codex\config.toml`; on macOS and Linux it is normally `~/.codex/config.toml`.

```toml
[mcp_servers.godot]
command = "node"
args = ["C:\\path\\to\\godot-mcp\\mcp-server\\dist\\index.js"]
env = { GODOT_EXECUTABLE = "C:\\path\\to\\Godot.exe" }
startup_timeout_sec = 10
tool_timeout_sec = 60
```

`GODOT_EXECUTABLE` is optional when `godot` is already on `PATH`. It is used only by `godot_run_project` and does not select an editor. Restart Codex after adding or changing the global MCP entry.

## Prepare each Godot project

From the reusable checkout's `mcp-server` directory, run:

```powershell
npm run setup-project -- --project-root "D:\path\to\your-godot-project"
```

The command:

- builds the MCP server;
- copies `addons/godot_mcp` into the target project;
- creates or reuses one user-scoped shared authentication token;
- does not write `.godot-mcp.json` or `.codex/config.toml` into the project.

If old project configuration files are present, the command reports their paths but does not modify or delete them.

If the addon already exists, update it explicitly:

```powershell
npm run setup-project -- --project-root "D:\path\to\your-godot-project" --force
```

If the shared token is missing or malformed and you intentionally want to replace it, use `--repair-token`. Close all prepared Godot editors first because token rotation invalidates their current bridge authentication.

```powershell
npm run setup-project -- --project-root "D:\path\to\your-godot-project" --force --repair-token
```

Then open the project in Godot and enable `Godot MCP` under `Project > Project Settings > Plugins`. Use `godot_editor_status` to verify the selected project and scene.

## Shared authentication token

The MCP server or `setup-project` creates a cryptographically random token. The addon only reads it; it never creates project secrets.

Default locations:

- Windows: `%LOCALAPPDATA%\godot-mcp\auth-token`
- macOS: `~/Library/Application Support/godot-mcp/auth-token`
- Linux: `${XDG_STATE_HOME:-~/.local/state}/godot-mcp/auth-token`

`GODOT_MCP_TOKEN_PATH` can override the location for advanced installations and isolated tests. If used, the same environment value must be visible to both the MCP server and Godot editor. It does not select a project.

## Switching projects

1. Close the currently active Godot editor.
2. Open the next prepared project, or restart it if it was already open and reported `EDITOR_ALREADY_ACTIVE`.
3. Call `godot_editor_status` again.

Codex and the MCP server do not need to restart. Keeping a single prepared editor open makes selection deterministic.

## Troubleshooting

- `NO_ACTIVE_EDITOR`: no prepared editor currently owns `127.0.0.1:8765`. Open Godot, enable the plugin, and retry.
- `EDITOR_ALREADY_ACTIVE`: another prepared editor already owns port 8765. Close it, then restart the editor you want to use.
- `TOKEN_NOT_FOUND`: the shared token does not exist. Run `setup-project`, or use `--repair-token` when recovery is intentional.
- `TOKEN_INVALID`: the shared token is malformed. Close editors and run `setup-project -- --project-root <path> --force --repair-token`.
- `AUTHENTICATION_FAILED`: Godot and the MCP server read different tokens. Make their environments consistent, then restart the editor.
- `NO_ACTIVE_SCENE`: the editor is connected but no scene is open for a scene-specific operation.
- `BRIDGE_CLOSED`: the editor closed during a request. Open the intended editor and retry; the next call reconnects.

An ordinary connection refusal while Godot is closed is surfaced as `NO_ACTIVE_EDITOR`, not as a server startup failure.

## Migrating from the project-scoped setup

Older versions wrote project-specific configuration and pinned the global server to one directory. To migrate:

1. Rebuild this checkout with `npm install` and `npm run build` in `mcp-server`.
2. Replace old global or project MCP entries with the single global example above.
3. Remove `GODOT_PROJECT_ROOT`, `--codex-project-root`, and any generated project `[mcp_servers.godot]` block.
4. Optionally delete obsolete project `.godot-mcp.json` files; they are no longer read.
5. Update each project's addon with `npm run setup-project -- --project-root <path> --force`.
6. Restart Codex once after changing its global configuration, then enable or restart the plugin in the intended editor.

The old project-local `.godot/godot-mcp-token` is no longer used.

## Security model

The bridge binds to loopback only. Scene mutations go through Godot's editor undo system. The server does not evaluate arbitrary GDScript or shell commands. The shared token authenticates local bridge requests and should not be committed or copied into projects.

## Available tools

- `godot_editor_status`
- `godot_current_scene`
- `godot_scene_tree`
- `godot_create_node`
- `godot_set_property`
- `godot_delete_node`
- `godot_run_project`
- `godot_stop_project`
- `godot_editor_errors`

## Development

```powershell
Set-Location mcp-server
npm install
npm run build
npm run typecheck
npm test
```

For the real-editor test, set `GODOT_EXECUTABLE` to Godot 4.7 or 4.7.1 and run `npm run test:godot`.
