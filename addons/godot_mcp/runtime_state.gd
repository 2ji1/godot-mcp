@tool
extends RefCounted

var recent_errors: Array[Dictionary] = []

func record(severity: String, source: String, message: String) -> void:
    recent_errors.append({
        "severity": severity,
        "source": source,
        "message": message,
        "timestamp": Time.get_datetime_string_from_system(true)
    })
    if recent_errors.size() > 200:
        recent_errors.pop_front()

func snapshot() -> Dictionary:
    return {"errors": recent_errors.duplicate(true)}
