# Portable Godot Project Setup Implementation Plan

1. Add failing tests for portable project installation and safe Codex config updates.
2. Implement the setup CLI and expose it through the MCP server package scripts.
3. Update the plugin author metadata and installation documentation.
4. Make editor integration verification wait for both bridge startup and active-scene readiness, then run Node and Godot 4.7/4.7.1 verification.
5. Commit the reviewed scope, push the feature branch, and open a draft pull request.
