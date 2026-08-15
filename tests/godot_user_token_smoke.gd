@tool
extends SceneTree

var failures := 0

func _init() -> void:
    var token_path = ProjectSettings.globalize_path("user://godot-mcp-shared-token-test")
    OS.set_environment("GODOT_MCP_TOKEN_PATH", token_path)
    if FileAccess.file_exists(token_path):
        DirAccess.remove_absolute(token_path)

    var token_script = load("res://addons/godot_mcp/user_token.gd")
    if token_script == null:
        _fail("Godot shared token helper must load")
        quit(1)
        return

    _assert(token_script.resolve_path() == token_path, "Token path override must be used")
    var missing_result = token_script.read_token()
    _assert(missing_result.get("error", {}).get("code", "") == "TOKEN_NOT_FOUND", "Missing token must return TOKEN_NOT_FOUND")
    _assert(not FileAccess.file_exists(token_path), "Addon must not create a missing token")

    var token = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    var file = FileAccess.open(token_path, FileAccess.WRITE)
    file.store_string(token + "\n")
    file.close()
    var token_result = token_script.read_token()
    _assert(token_result.get("token", "") == token, "Shared token must be read and trimmed")

    DirAccess.remove_absolute(token_path)
    OS.set_environment("GODOT_MCP_TOKEN_PATH", "")
    if failures == 0:
        print("godot_user_token_smoke.gd passed")
    quit(1 if failures > 0 else 0)

func _assert(condition: bool, message: String) -> void:
    if not condition:
        _fail(message)

func _fail(message: String) -> void:
    failures += 1
    push_error(message)
