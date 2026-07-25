# Godot Editor MCP

A local MCP server and Godot 4 editor plugin for safe editor automation from Codex-compatible clients.

## Repository contents

- `addons/godot_mcp`: installable Godot editor plugin
- `mcp-server`: TypeScript MCP server and local WebSocket bridge
- `mcp-server/tests`: protocol, bridge, tool, mutation, and runtime tests

The bridge binds to `127.0.0.1` only. Scene mutations are routed through Godot's editor undo system. The server does not evaluate arbitrary GDScript or shell commands.

## Install in a Godot project

1. Copy `addons/godot_mcp` into your project's `addons` directory.
2. Copy `.godot-mcp.example.json` to the project root as `.godot-mcp.json`.
3. Build the server:

```powershell
Set-Location path\to\godot-mcp\mcp-server
npm install
npm run build
```

4. Enable `Godot MCP` in Godot under `Project > Project Settings > Plugins`.
5. Copy `codex-mcp.config.example.toml` into your Codex configuration and replace the example paths.
6. Restart Godot, then restart the MCP client.

The plugin creates `.godot/godot-mcp-token` locally. Do not commit this file.

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
