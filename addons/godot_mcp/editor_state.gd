@tool
extends RefCounted

func status(editor_plugin: EditorPlugin) -> Dictionary:
    var root = editor_plugin.get_editor_interface().get_edited_scene_root()
    var scene_path = ""
    var root_name = ""
    var root_type = ""
    if root != null:
        scene_path = root.scene_file_path
        root_name = root.name
        root_type = root.get_class()
    return {
        "projectPath": ProjectSettings.globalize_path("res://"),
        "godotVersion": Engine.get_version_info().string,
        "scenePath": scene_path,
        "rootName": root_name,
        "rootType": root_type
    }
