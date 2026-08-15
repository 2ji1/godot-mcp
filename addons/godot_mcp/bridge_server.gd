@tool
extends Node

const PORT := 8765
const HOST := "127.0.0.1"

var editor_plugin: EditorPlugin
var bridge_server := WebSocketMultiplayerPeer.new()
var dispatcher: RefCounted
var running := false

func start() -> void:
    dispatcher = preload("res://addons/godot_mcp/rpc_dispatcher.gd").new()
    dispatcher.editor_plugin = editor_plugin
    if not dispatcher.initialize_token():
        var token_error = dispatcher.token_error
        var code = str(token_error.get("code", "TOKEN_NOT_FOUND"))
        var message = str(token_error.get("message", "Godot MCP shared authentication token is unavailable"))
        push_error(code + ": " + message)
        return
    var error = bridge_server.create_server(PORT, HOST)
    if error != OK:
        push_error("EDITOR_ALREADY_ACTIVE: Another Godot editor already owns " + HOST + ":" + str(PORT) + " (" + error_string(error) + ")")
        return
    running = true
    set_process(true)
    print("Godot MCP bridge listening on ws://" + HOST + ":" + str(PORT))

func stop() -> void:
    running = false
    set_process(false)
    bridge_server.close()

func _process(_delta: float) -> void:
    if not running:
        return
    bridge_server.poll()
    while bridge_server.get_available_packet_count() > 0:
        var peer_id = bridge_server.get_packet_peer()
        var packet = bridge_server.get_packet()
        var raw = packet.get_string_from_utf8()
        var response = dispatcher.handle_json(raw)
        var peer = bridge_server.get_peer(peer_id)
        if peer != null:
            peer.send_text(JSON.stringify(response))
