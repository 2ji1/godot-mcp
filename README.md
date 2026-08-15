# Godot Editor MCP

A local MCP server and Godot 4 editor plugin for safe editor automation from Codex-compatible clients.

## Repository contents

- `addons/godot_mcp`: installable Godot editor plugin
- `mcp-server`: TypeScript MCP server and local WebSocket bridge
- `mcp-server/tests`: protocol, bridge, tool, mutation, and runtime tests

The bridge binds to `127.0.0.1` only. Scene mutations are routed through Godot's editor undo system. The server does not evaluate arbitrary GDScript or shell commands.

## Install for one or more Godot projects

Keep this repository in a reusable tools directory rather than inside one Godot project. Install its dependencies once:

```powershell
Set-Location path\to\godot-mcp\mcp-server
npm install
```

Then configure each target project:

```powershell
npm run setup-project -- `
  --project-root "D:\path\to\your-godot-project" `
  --godot-executable "C:\path\to\Godot.exe"
```

If the Godot project is nested below the Codex workspace, add `--codex-project-root` so `.codex/config.toml` is written where Codex loads project-scoped settings:

```powershell
npm run setup-project -- `
  --project-root "D:\path\to\workspace\godot-project" `
  --codex-project-root "D:\path\to\workspace" `
  --godot-executable "C:\path\to\Godot.exe"
```

The setup command builds the server, copies `addons/godot_mcp`, creates `.godot-mcp.json` when missing, and adds a managed Godot MCP block to the project's `.codex/config.toml`. Existing unrelated Codex settings and existing `.godot-mcp.json` files are preserved. It refuses to replace an existing addon unless you pass `--force`.

Project-scoped Codex configuration prevents one global `GODOT_PROJECT_ROOT` value from binding every Codex task to the same Godot project. If you previously configured Godot MCP globally in `~/.codex/config.toml`, remove or disable that global `[mcp_servers.godot]` entry after setting up your projects.

Enable `Godot MCP` in Godot under `Project > Project Settings > Plugins`, then restart Godot and Codex. The editor plugin opens `127.0.0.1:8765` only while the configured Godot editor and plugin are running, so `ECONNREFUSED` is expected while they are stopped.

The plugin creates `.godot/godot-mcp-token` locally. Do not commit this file.

The generated `.codex/config.toml` contains machine-specific absolute paths. Review it before deciding whether it belongs in your project repository.

## Development

```powershell
Set-Location mcp-server
npm install
npm run typecheck
npm test
npm run build
```

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
