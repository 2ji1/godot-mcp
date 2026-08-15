# Godot 4.7 Runtime Defects Design

## Goal

Make a clean Godot MCP installation authenticate on its first MCP tool call and ensure `godot_create_node` returns the real path of a node created with the requested name.

## Scope

This change fixes only the two reproduced runtime defects:

- the first bridge authentication attempt fails when the token file does not yet exist;
- a created node keeps Godot's generated name instead of the requested name.

README development-command ordering and dependency audit findings are excluded.

## Authentication Design

The Godot plugin owns token creation. `RpcDispatcher` will expose an initialization method that loads or creates the project-local token and returns whether a non-empty token is available. `BridgeServer.start()` will call this method before opening the WebSocket listener. If token initialization fails, startup will stop and report an editor error instead of accepting connections that cannot authenticate.

The Node MCP server will continue reading the token file for each connection. No empty-token authentication, retry workaround, or weaker authentication path will be added.

## Node Creation Design

`SceneOperations.create_node()` will assign the requested name to the newly instantiated `Node` before the undo action adds it to the parent. The node keeps that name across undo and redo because the same instance is removed and re-added. The returned `nodePath` will therefore resolve to the created node and can be passed directly to property and deletion tools.

## Error Handling

- Token file creation failure prevents the bridge from listening and emits a clear Godot editor error.
- Existing authentication failures remain unchanged for genuinely incorrect tokens.
- Existing duplicate-name, invalid-class, missing-node, and confirmation errors remain unchanged.

## Testing

Add an opt-in Godot editor integration test driven by Node.js and `GODOT_EXECUTABLE`. The test will create an isolated temporary Godot project containing the addon, start Godot 4.7 headlessly, and verify:

1. the token file exists before the first client authentication attempt;
2. the first bridge connection and status request succeed;
3. a requested node name matches the returned and observed scene-tree path;
4. setting a property through that path succeeds;
5. deleting through that path succeeds.

Existing TypeScript tests and GDScript smoke tests must remain green on Godot 4.7 and 4.7.1.
