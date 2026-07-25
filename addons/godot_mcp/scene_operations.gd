@tool
extends RefCounted

func current_scene(editor_plugin: EditorPlugin) -> Dictionary:
    var root = editor_plugin.get_editor_interface().get_edited_scene_root()
    if root == null:
        return {"scenePath": "", "rootName": "", "rootType": "", "editable": false}
    return {
        "scenePath": root.scene_file_path,
        "rootName": root.name,
        "rootType": root.get_class(),
        "editable": true
    }

func get_tree(editor_plugin: EditorPlugin, max_depth: int) -> Dictionary:
    var root = editor_plugin.get_editor_interface().get_edited_scene_root()
    if root == null:
        return {"scenePath": "", "nodes": []}
    var nodes: Array[Dictionary] = []
    _append_node(root, ".", 0, max_depth, nodes)
    return {"scenePath": root.scene_file_path, "nodes": nodes}

func create_node(editor_plugin: EditorPlugin, parent_path: String, type_name: String, node_name: String) -> Dictionary:
    var root = editor_plugin.get_editor_interface().get_edited_scene_root()
    if root == null:
        return _error("NO_ACTIVE_SCENE", "Open a scene before creating a node")
    var parent = _resolve_node(root, parent_path)
    if parent == null:
        return _error("NODE_NOT_FOUND", "Parent node path does not exist")
    if parent.has_node(NodePath(node_name)):
        return _error("NODE_ALREADY_EXISTS", "A child with that name already exists")
    if not ClassDB.can_instantiate(type_name):
        return _error("INVALID_CLASS", "Godot cannot instantiate the requested class")
    var created = ClassDB.instantiate(type_name)
    if created == null or not created is Node:
        return _error("INVALID_CLASS", "Requested class is not a Node")

    var undo = editor_plugin.get_undo_redo()
    undo.create_action("Godot MCP: Create " + node_name)
    undo.add_do_method(parent, "add_child", created)
    undo.add_do_method(created, "set_owner", root)
    undo.add_undo_method(parent, "remove_child", created)
    undo.add_undo_reference(created)
    undo.commit_action()
    return {"nodePath": _join_path(parent_path, node_name), "type": type_name, "name": node_name}

func set_property(editor_plugin: EditorPlugin, node_path: String, property: String, value: Variant) -> Dictionary:
    var root = editor_plugin.get_editor_interface().get_edited_scene_root()
    if root == null:
        return _error("NO_ACTIVE_SCENE", "Open a scene before changing a property")
    var node = _resolve_node(root, node_path)
    if node == null:
        return _error("NODE_NOT_FOUND", "Node path does not exist")
    if not _has_property(node, property):
        return _error("PROPERTY_NOT_FOUND", "Node does not expose the requested property")
    var previous = node.get(property)
    var undo = editor_plugin.get_undo_redo()
    undo.create_action("Godot MCP: Set " + property)
    undo.add_do_property(node, property, value)
    undo.add_undo_property(node, property, previous)
    undo.commit_action()
    return {"nodePath": node_path, "property": property, "value": value}

func delete_node(editor_plugin: EditorPlugin, node_path: String) -> Dictionary:
    var root = editor_plugin.get_editor_interface().get_edited_scene_root()
    if root == null:
        return _error("NO_ACTIVE_SCENE", "Open a scene before deleting a node")
    var node = _resolve_node(root, node_path)
    if node == null:
        return _error("NODE_NOT_FOUND", "Node path does not exist")
    if node == root:
        return _error("INVALID_ARGUMENT", "The edited scene root cannot be deleted")
    var parent = node.get_parent()
    var index = node.get_index()
    var undo = editor_plugin.get_undo_redo()
    undo.create_action("Godot MCP: Delete " + node.name)
    undo.add_do_method(parent, "remove_child", node)
    undo.add_undo_method(parent, "add_child", node)
    undo.add_undo_method(parent, "move_child", node, index)
    undo.add_undo_reference(node)
    undo.commit_action()
    return {"nodePath": node_path, "deleted": true}

func _append_node(node: Node, node_path: String, depth: int, max_depth: int, nodes: Array[Dictionary]) -> void:
    nodes.append({
        "path": node_path,
        "name": node.name,
        "type": node.get_class(),
        "childCount": node.get_child_count()
    })
    if depth >= max_depth:
        return
    for child in node.get_children():
        var child_path = child.name if node_path == "." else node_path + "/" + child.name
        _append_node(child, child_path, depth + 1, max_depth, nodes)

func _resolve_node(root: Node, node_path: String) -> Node:
    if node_path.is_empty() or node_path == ".":
        return root
    return root.get_node_or_null(NodePath(node_path))

func _join_path(parent_path: String, child_name: String) -> String:
    return child_name if parent_path.is_empty() or parent_path == "." else parent_path + "/" + child_name

func _has_property(node: Node, property_name: String) -> bool:
    for property_info in node.get_property_list():
        if str(property_info.get("name", "")) == property_name:
            return true
    return false

func _error(code: String, message: String) -> Dictionary:
    return {"_error": {"code": code, "message": message}}
