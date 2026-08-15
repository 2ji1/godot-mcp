@tool
extends SceneTree

func _init() -> void:
    var scripts = [
        "res://addons/godot_mcp/plugin.gd",
        "res://addons/godot_mcp/bridge_server.gd",
        "res://addons/godot_mcp/rpc_dispatcher.gd",
        "res://addons/godot_mcp/editor_state.gd",
        "res://addons/godot_mcp/scene_operations.gd",
        "res://addons/godot_mcp/runtime_state.gd",
        "res://addons/godot_mcp/value_codec.gd",
        "res://addons/godot_mcp/user_token.gd"
    ]
    for script_path in scripts:
        if load(script_path) == null:
            push_error("Godot MCP script must load: " + script_path)
            quit(1)
            return
    print("godot_plugin_smoke.gd passed")
    quit(0)
