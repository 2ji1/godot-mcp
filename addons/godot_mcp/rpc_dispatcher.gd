@tool
extends RefCounted

var editor_plugin: EditorPlugin
var authenticated := false
var token := ""
var editor_state: RefCounted
var scene_operations: RefCounted
var runtime_state: RefCounted

func _init() -> void:
    editor_state = preload("res://addons/godot_mcp/editor_state.gd").new()
    scene_operations = preload("res://addons/godot_mcp/scene_operations.gd").new()
    runtime_state = preload("res://addons/godot_mcp/runtime_state.gd").new()

func handle_json(raw: String) -> Dictionary:
    var parsed = JSON.parse_string(raw)
    if not parsed is Dictionary:
        return _failure("", "INVALID_REQUEST", "Request must be a JSON object")
    return handle_request(parsed)

func handle_request(request: Dictionary) -> Dictionary:
    var request_id = str(request.get("id", ""))
    var method = str(request.get("method", ""))
    var params = request.get("params", {})
    if request_id.is_empty() or method.is_empty() or not params is Dictionary:
        return _failure(request_id, "INVALID_REQUEST", "Request requires id, method, and object params")

    if method == "bridge.authenticate":
        var supplied = str(params.get("token", ""))
        if supplied != _get_token():
            return _failure(request_id, "AUTHENTICATION_FAILED", "Invalid bridge token")
        authenticated = true
        return _success(request_id, {"authenticated": true})

    if not authenticated:
        return _failure(request_id, "AUTHENTICATION_REQUIRED", "Authenticate before calling editor tools")

    match method:
        "editor.status":
            return _success(request_id, editor_state.status(editor_plugin))
        "editor.current_scene":
            return _success(request_id, scene_operations.current_scene(editor_plugin))
        "scene.get_tree":
            var max_depth = int(params.get("maxDepth", 8))
            if max_depth < 0:
                return _failure(request_id, "INVALID_ARGUMENT", "maxDepth cannot be negative")
            return _success(request_id, scene_operations.get_tree(editor_plugin, min(max_depth, 32)))
        "scene.create_node":
            return _operation_response(request_id, scene_operations.create_node(editor_plugin, str(params.get("parentPath", ".")), str(params.get("type", "")), str(params.get("name", ""))))
        "scene.set_property":
            return _operation_response(request_id, scene_operations.set_property(editor_plugin, str(params.get("nodePath", "")), str(params.get("property", "")), params.get("value")))
        "scene.delete_node":
            if params.get("confirm", false) != true:
                return _failure(request_id, "INVALID_ARGUMENT", "Deletion requires confirm=true")
            return _operation_response(request_id, scene_operations.delete_node(editor_plugin, str(params.get("nodePath", ""))))
        "runtime.errors":
            return _success(request_id, runtime_state.snapshot())
        _:
            return _failure(request_id, "METHOD_NOT_FOUND", "Unknown method: " + method)

func _get_token() -> String:
    if not token.is_empty():
        return token
    var path = ProjectSettings.globalize_path("res://.godot/godot-mcp-token")
    if FileAccess.file_exists(path):
        token = FileAccess.get_file_as_string(path).strip_edges()
    else:
        token = str(Time.get_ticks_usec()) + "-" + str(randi())
        var file = FileAccess.open(path, FileAccess.WRITE)
        if file != null:
            file.store_string(token)
    return token

func _operation_response(request_id: String, result: Dictionary) -> Dictionary:
    if result.has("_error"):
        var error = result["_error"]
        return _failure(request_id, str(error.get("code", "MUTATION_FAILED")), str(error.get("message", "Mutation failed")))
    return _success(request_id, result)

func _success(request_id: String, result: Dictionary) -> Dictionary:
    return {"id": request_id, "ok": true, "result": result}

func _failure(request_id: String, code: String, message: String) -> Dictionary:
    return {"id": request_id, "ok": false, "error": {"code": code, "message": message}}
