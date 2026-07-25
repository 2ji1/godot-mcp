@tool
extends RefCounted

func decode(value: Variant) -> Dictionary:
    return _decode(value)

func _decode(value: Variant) -> Dictionary:
    if value is Array:
        var converted: Array = []
        for item in value:
            var item_result = _decode(item)
            if not item_result.get("ok", false):
                return item_result
            converted.append(item_result["value"])
        return _success(converted)

    if value is Dictionary:
        if value.has("$godotType"):
            return _decode_tagged(value)
        var converted: Dictionary = {}
        for key in value:
            var item_result = _decode(value[key])
            if not item_result.get("ok", false):
                return item_result
            converted[key] = item_result["value"]
        return _success(converted)

    return _success(value)

func _decode_tagged(value: Dictionary) -> Dictionary:
    match str(value.get("$godotType", "")):
        "Vector3":
            return _decode_vector3(value)
        "Color":
            return _decode_color(value)
        "StandardMaterial3D":
            return _decode_material(value)
        _:
            return _failure("Unknown Godot value type")

func _decode_vector3(value: Dictionary) -> Dictionary:
    if not _has_exact_keys(value, ["$godotType", "x", "y", "z"]):
        return _failure("Vector3 requires x, y, and z")
    var x_result = _number(value["x"], "Vector3.x")
    var y_result = _number(value["y"], "Vector3.y")
    var z_result = _number(value["z"], "Vector3.z")
    if not x_result.get("ok", false):
        return x_result
    if not y_result.get("ok", false):
        return y_result
    if not z_result.get("ok", false):
        return z_result
    return _success(Vector3(x_result["value"], y_result["value"], z_result["value"]))

func _decode_color(value: Dictionary) -> Dictionary:
    if not _has_exact_keys(value, ["$godotType", "r", "g", "b", "a"]):
        return _failure("Color requires r, g, b, and a")
    var r_result = _number(value["r"], "Color.r")
    var g_result = _number(value["g"], "Color.g")
    var b_result = _number(value["b"], "Color.b")
    var a_result = _number(value["a"], "Color.a")
    if not r_result.get("ok", false):
        return r_result
    if not g_result.get("ok", false):
        return g_result
    if not b_result.get("ok", false):
        return b_result
    if not a_result.get("ok", false):
        return a_result
    return _success(Color(r_result["value"], g_result["value"], b_result["value"], a_result["value"]))

func _decode_material(value: Dictionary) -> Dictionary:
    if not _has_exact_keys(value, ["$godotType", "properties"]):
        return _failure("StandardMaterial3D requires properties")
    var properties = value["properties"]
    if not properties is Dictionary or properties.is_empty():
        return _failure("StandardMaterial3D requires a supported property")

    var material := StandardMaterial3D.new()
    for property_name in properties:
        match str(property_name):
            "albedo_color":
                var color_result = _decode_color(properties[property_name]) if properties[property_name] is Dictionary else _failure("albedo_color must be a Color")
                if not color_result.get("ok", false):
                    return color_result
                material.albedo_color = color_result["value"]
            "metallic":
                var metallic_result = _number(properties[property_name], "StandardMaterial3D.metallic")
                if not metallic_result.get("ok", false):
                    return metallic_result
                material.metallic = metallic_result["value"]
            _:
                return _failure("Unsupported StandardMaterial3D property: " + str(property_name))
    return _success(material)

func _number(value: Variant, field_name: String) -> Dictionary:
    if typeof(value) != TYPE_INT and typeof(value) != TYPE_FLOAT:
        return _failure(field_name + " must be a finite number")
    var number := float(value)
    if not is_finite(number):
        return _failure(field_name + " must be a finite number")
    return _success(number)

func _has_exact_keys(value: Dictionary, required: Array) -> bool:
    if value.size() != required.size():
        return false
    for key in required:
        if not value.has(key):
            return false
    return true

func _success(value: Variant) -> Dictionary:
    return {"ok": true, "value": value}

func _failure(message: String) -> Dictionary:
    return {"ok": false, "error": {"code": "INVALID_ARGUMENT", "message": message}}
