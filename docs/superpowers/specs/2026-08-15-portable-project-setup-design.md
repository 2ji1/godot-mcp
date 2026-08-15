# Portable Godot Project Setup

## Goal

Remove the accidental dependency on the original `D:\godot\p-h` project while keeping the Godot editor plugin explicitly installed per project. Also replace the legacy plugin author metadata with the repository owner's identifier.

## Architecture

The MCP server checkout is a reusable tool installation. A target Godot project contains only the editor addon, `.godot-mcp.json`, and a project-scoped `.codex/config.toml`. The generated Codex configuration points to the reusable server checkout and sets `GODOT_PROJECT_ROOT` to the target project.

Godot editor addons remain project-local by design. This change removes the accidental server/config coupling to one project; it does not attempt to make Godot load an editor addon globally.

## Setup command

Add a TypeScript CLI under `mcp-server` with these inputs:

- `--project-root`: required directory containing `project.godot`.
- `--codex-project-root`: optional Codex workspace root when it differs from the directory containing `project.godot`.
- `--godot-executable`: required Godot executable path.
- `--server-root`: optional reusable godot-mcp checkout; defaults to this repository.
- `--force`: permits replacing an existing `addons/godot_mcp` installation.

The command copies the addon, creates `.godot-mcp.json` only when missing, and inserts a marked managed block into `.codex/config.toml`. Existing unrelated Codex settings are preserved. An existing unmanaged `[mcp_servers.godot]` section is treated as a conflict instead of being overwritten.

## Metadata

Change `addons/godot_mcp/plugin.cfg` from `author="P_H"` to `author="2ji1"`. This is descriptive metadata and has no runtime effect.

## Validation

- Unit-test first-time setup, managed-block updates, conflict handling, and overwrite protection.
- Run TypeScript type checking, the full Node test suite, and the production build.
- Run the Godot plugin smoke test on Godot 4.7 and 4.7.1.
- Confirm local `.godot-mcp.json` is never committed.
