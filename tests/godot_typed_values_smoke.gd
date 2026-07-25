@tool
extends SceneTree

var failures := 0

func _init() -> void:
    var codec_script = load("res://addons/godot_mcp/value_codec.gd")
    if codec_script == null:
        _fail("Godot typed value codec must load")
        quit(1)
        return

    var codec = codec_script.new()
    var vector_result = codec.decode({"$godotType": "Vector3", "x": 1.0, "y": 1.0, "z": 1.0})
    _assert(vector_result.get("ok", false), "Vector3 must decode")
    _assert(vector_result.get("value") == Vector3.ONE, "Vector3 value must match")

    var color_result = codec.decode({"$godotType": "Color", "r": 1.0, "g": 0.0, "b": 0.0, "a": 1.0})
    _assert(color_result.get("ok", false), "Color must decode")
    _assert(color_result.get("value") == Color(1, 0, 0, 1), "Color value must match")

    var material_result = codec.decode({
        "$godotType": "StandardMaterial3D",
        "properties": {
            "albedo_color": {"$godotType": "Color", "r": 1.0, "g": 0.0, "b": 0.0, "a": 1.0},
            "metallic": 1.0
        }
    })
    _assert(material_result.get("ok", false), "StandardMaterial3D must decode")
    var material = material_result.get("value") as StandardMaterial3D
    _assert(material != null, "Decoded material must be StandardMaterial3D")
    if material != null:
        _assert(material.albedo_color == Color(1, 0, 0, 1), "Material albedo_color must match")
        _assert(is_equal_approx(material.metallic, 1.0), "Material metallic must match")

    var unknown_result = codec.decode({"$godotType": "Quaternion", "x": 0, "y": 0, "z": 0, "w": 1})
    _assert(not unknown_result.get("ok", false), "Unknown tags must fail")
    var unsupported_result = codec.decode({"$godotType": "StandardMaterial3D", "properties": {"roughness": 0.5}})
    _assert(not unsupported_result.get("ok", false), "Unsupported material properties must fail")

    if failures == 0:
        print("godot_typed_values_smoke.gd passed")
    quit(1 if failures > 0 else 0)

func _assert(condition: bool, message: String) -> void:
    if not condition:
        _fail(message)

func _fail(message: String) -> void:
    failures += 1
    push_error(message)
