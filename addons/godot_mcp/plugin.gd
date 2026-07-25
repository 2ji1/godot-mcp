@tool
extends EditorPlugin

var bridge_server: Node

func _enter_tree() -> void:
    bridge_server = preload("res://addons/godot_mcp/bridge_server.gd").new()
    bridge_server.editor_plugin = self
    add_child(bridge_server)
    bridge_server.start()

func _exit_tree() -> void:
    if is_instance_valid(bridge_server):
        bridge_server.stop()
        remove_child(bridge_server)
        bridge_server.queue_free()
