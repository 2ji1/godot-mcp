@tool
extends RefCounted

const TOKEN_PATTERN := "^[a-f0-9]{64}$"

static func resolve_path() -> String:
    var override_path = OS.get_environment("GODOT_MCP_TOKEN_PATH")
    if not override_path.is_empty():
        return override_path

    var home = OS.get_environment("HOME")
    match OS.get_name():
        "Windows":
            var local_app_data = OS.get_environment("LOCALAPPDATA")
            if local_app_data.is_empty():
                local_app_data = OS.get_environment("USERPROFILE").path_join("AppData").path_join("Local")
            return local_app_data.path_join("godot-mcp").path_join("auth-token")
        "macOS":
            return home.path_join("Library").path_join("Application Support").path_join("godot-mcp").path_join("auth-token")
        _:
            var state_home = OS.get_environment("XDG_STATE_HOME")
            if state_home.is_empty():
                state_home = home.path_join(".local").path_join("state")
            return state_home.path_join("godot-mcp").path_join("auth-token")

static func read_token() -> Dictionary:
    var path = resolve_path()
    if not FileAccess.file_exists(path):
        return _failure("TOKEN_NOT_FOUND", "Shared Godot MCP token does not exist: " + path)
    var token = FileAccess.get_file_as_string(path).strip_edges()
    var regex = RegEx.new()
    regex.compile(TOKEN_PATTERN)
    if regex.search(token) == null:
        return _failure("TOKEN_INVALID", "Shared Godot MCP token is malformed: " + path)
    return {"token": token}

static func _failure(code: String, message: String) -> Dictionary:
    return {"error": {"code": code, "message": message}}
