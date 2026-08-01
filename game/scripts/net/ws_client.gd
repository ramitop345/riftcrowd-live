## WSClient (Phase 10) — WebSocket client for the gateway ↔ Godot real-time bridge.
##
## Connects to ws://127.0.0.1:<port>/ws/game?token=<TOKEN>, performs handshake,
## handles heartbeat, receives commands with idempotent dedup, and reconnects
## with exponential backoff on disconnect.
##
## Signals:
##   handshake_completed(server_id: String)
##   command_received(command_dict: Dictionary)
##   snapshot_received(commands_array: Array)
##   disconnected(reason: String)
##   error_received(code: String, message: String)
##
## Godot 4.3 WebSocketPeer API:
##   WebSocketPeer.new()
##   peer.connect_to_url(url)
##   peer.poll()
##   peer.get_packet()
##   peer.put_packet(packet)
##   peer.get_ready_state()  →  0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
##   peer.get_close_code()
##   peer.get_close_reason()
class_name WSClient
extends Node

signal handshake_completed(server_id: String)
signal command_received(command_dict: Dictionary)
signal snapshot_received(commands_array: Array)
signal disconnected(reason: String)
signal error_received(code: String, message: String)

## WS protocol version — must match the gateway WS_PROTOCOL_VERSION.
const PROTOCOL_VERSION: int = 1

## Reconnect backoff: 1s, 2s, 4s, 8s, max 30s.
const BACKOFF_BASE_MS: float = 1000.0
const BACKOFF_MAX_MS: float = 30000.0

## State enum for connection tracking.
enum State { IDLE, CONNECTING, CONNECTED, DISCONNECTED, RECONNECTING }

var _peer: WebSocketPeer = null
var _state: int = State.IDLE
var _url: String = ""
var _token: String = ""
var _client_id: String = ""
var _server_id: String = ""
var _last_applied_sequence: int = 0
var _heartbeat_interval_ms: int = 5000
var _reconnect_attempt: int = 0
var _reconnect_timer: float = 0.0
var _auto_reconnect: bool = true
var _handshake_received: bool = false


func _ready() -> void:
	# Generate a unique client ID based on time.
	_client_id = "godot_%d" % (Time.get_unix_time_from_system() * 1000)


func _process(delta: float) -> void:
	if _peer == null:
		return

	_peer.poll()
	var ready_state: int = _peer.get_ready_state()

	match ready_state:
		0:  # CONNECTING
			pass
		1:  # OPEN
			if _state == State.CONNECTING or _state == State.RECONNECTING:
				_state = State.CONNECTED
				_reconnect_attempt = 0
				_reconnect_timer = 0.0
			_process_packets()
		2:  # CLOSING
			pass
		3:  # CLOSED
			if _state == State.CONNECTED or _state == State.CONNECTING:
				var reason: String = ""
				var close_code: int = _peer.get_close_code()
				var close_reason: String = _peer.get_close_reason()
				if close_code >= 0:
					reason = "code=%d: %s" % [close_code, close_reason]
				else:
					reason = "connection lost"
				_state = State.DISCONNECTED
				_handshake_received = false
				disconnected.emit(reason)
				if _auto_reconnect:
					_start_reconnect()
			elif _state == State.RECONNECTING:
				# Connection attempt failed; try again with backoff
				_schedule_reconnect()

	# Handle reconnect timer
	if _state == State.RECONNECTING and _reconnect_timer > 0.0:
		_reconnect_timer -= delta * 1000.0
		if _reconnect_timer <= 0.0:
			_do_connect()


## Connects to the gateway WebSocket server.
## url: "ws://127.0.0.1:8787/ws/game"
## token: LOCAL_SESSION_TOKEN value.
func connect_to_server(url: String, token: String) -> void:
	_url = url
	_token = token
	_auto_reconnect = true
	_do_connect()


## Disconnects from the server (no auto-reconnect).
func disconnect_from_server() -> void:
	_auto_reconnect = false
	if _peer != null and _peer.get_ready_state() == 1:
		_peer.close()


## Returns true if the WebSocket is connected and handshake is complete.
func is_ws_connected() -> bool:
	return _state == State.CONNECTED and _handshake_received


## Returns true if auto-reconnect is enabled.
func auto_reconnect_enabled() -> bool:
	return _auto_reconnect


## Returns the last applied sequence number (for reconnect recovery).
func get_last_applied_sequence() -> int:
	return _last_applied_sequence


## Returns the current connection state.
func get_state() -> int:
	return _state


# ---------------------------------------------------------------------------
# Internal: connection
# ---------------------------------------------------------------------------

func _do_connect() -> void:
	if _peer != null:
		_peer.close()
	_peer = WebSocketPeer.new()
	var full_url: String = "%s?token=%s" % [_url, _token]
	var err: int = _peer.connect_to_url(full_url)
	if err != OK:
		push_error("WSClient: connect_to_url failed: %d" % err)
		_state = State.DISCONNECTED
		error_received.emit("CONNECT_FAILED", "Failed to connect (error %d)" % err)
		if _auto_reconnect:
			_start_reconnect()
	else:
		if _reconnect_attempt > 0:
			_state = State.RECONNECTING
		else:
			_state = State.CONNECTING


func _start_reconnect() -> void:
	_reconnect_attempt += 1
	_schedule_reconnect()


func _schedule_reconnect() -> void:
	_state = State.RECONNECTING
	var backoff_ms: float = minf(
		BACKOFF_BASE_MS * pow(2.0, float(_reconnect_attempt - 1)),
		BACKOFF_MAX_MS,
	)
	_reconnect_timer = backoff_ms


# ---------------------------------------------------------------------------
# Internal: packet processing
# ---------------------------------------------------------------------------

func _process_packets() -> void:
	while _peer.get_available_packet_count() > 0:
		var packet: PackedByteArray = _peer.get_packet()
		if packet.is_empty():
			continue
		var text: String = packet.get_string_from_utf8()
		if text.is_empty():
			continue
		var json := JSON.new()
		var parse_err: int = json.parse(text)
		if parse_err != OK:
			push_warning("WSClient: malformed JSON: %s" % text.left(200))
			continue
		var data: Variant = json.data
		if typeof(data) != TYPE_DICTIONARY:
			push_warning("WSClient: expected dictionary, got %s" % type_string(typeof(data)))
			continue
		_handle_message(data as Dictionary)


func _handle_message(msg: Dictionary) -> void:
	var msg_type: String = str(msg.get("type", ""))
	var pv: Variant = msg.get("protocolVersion")
	if pv == null or int(pv) != PROTOCOL_VERSION:
		push_warning("WSClient: protocol version missing or mismatch (got %s, expected %d)" % [str(pv), PROTOCOL_VERSION])
		error_received.emit("UNSUPPORTED_VERSION", "Protocol version missing or mismatch")
		return

	match msg_type:
		"handshake":
			_on_handshake(msg)
		"heartbeat_ping":
			_on_heartbeat_ping(msg)
		"command":
			_on_command(msg)
		"snapshot":
			_on_snapshot(msg)
		"error":
			_on_error(msg)
		"disconnect":
			_on_server_disconnect(msg)
		_:
			push_warning("WSClient: unknown message type: %s" % msg_type)


# ---------------------------------------------------------------------------
# Message handlers
# ---------------------------------------------------------------------------

func _on_handshake(msg: Dictionary) -> void:
	_server_id = str(msg.get("serverId", ""))
	_heartbeat_interval_ms = int(msg.get("heartbeatIntervalMs", 5000))
	_handshake_received = true

	# Send handshake_ack with our last applied sequence.
	var ack: Dictionary = {
		"type": "handshake_ack",
		"protocolVersion": PROTOCOL_VERSION,
		"clientId": _client_id,
		"lastReceivedSequenceNumber": _last_applied_sequence,
	}
	_send_json(ack)
	handshake_completed.emit(_server_id)


func _on_heartbeat_ping(msg: Dictionary) -> void:
	var pong: Dictionary = {
		"type": "heartbeat_pong",
		"protocolVersion": PROTOCOL_VERSION,
		"timestamp": int(msg.get("timestamp", 0)),
	}
	_send_json(pong)


func _on_command(msg: Dictionary) -> void:
	var seq: int = int(msg.get("sequenceNumber", 0))
	var message_id: String = str(msg.get("messageId", ""))
	var command_data: Variant = msg.get("command")
	var requires_ack: bool = bool(msg.get("requiresAck", true))

	if typeof(command_data) != TYPE_DICTIONARY:
		push_warning("WSClient: command payload is not a dictionary")
		return

	# Idempotency check: skip if already applied.
	if seq <= _last_applied_sequence:
		# Duplicate — send ack with status 'duplicate'.
		if requires_ack:
			var dup_ack: Dictionary = {
				"type": "command_ack",
				"protocolVersion": PROTOCOL_VERSION,
				"messageId": message_id,
				"sequenceNumber": seq,
				"status": "duplicate",
			}
			_send_json(dup_ack)
		return

	# Apply the command.
	_last_applied_sequence = seq
	command_received.emit(command_data as Dictionary)

	# Send ack.
	if requires_ack:
		var ack: Dictionary = {
			"type": "command_ack",
			"protocolVersion": PROTOCOL_VERSION,
			"messageId": message_id,
			"sequenceNumber": seq,
			"status": "accepted",
		}
		_send_json(ack)


func _on_snapshot(msg: Dictionary) -> void:
	var commands_var: Variant = msg.get("commands")
	if typeof(commands_var) != TYPE_ARRAY:
		push_warning("WSClient: snapshot commands is not an array")
		return

	var commands_arr: Array = commands_var as Array
	var applied_commands: Array = []

	for cmd_var: Variant in commands_arr:
		if typeof(cmd_var) != TYPE_DICTIONARY:
			continue
		var cmd_dict: Dictionary = cmd_var as Dictionary
		# Snapshots don't have sequence numbers individually;
		# the server already filtered by lastReceivedSequenceNumber.
		# Apply all commands in the snapshot.
		applied_commands.append(cmd_dict)
		command_received.emit(cmd_dict)

	if not applied_commands.is_empty():
		# Update last applied sequence from snapshot's sequenceNumber.
		var snap_seq: int = int(msg.get("sequenceNumber", _last_applied_sequence))
		if snap_seq > _last_applied_sequence:
			_last_applied_sequence = snap_seq

	snapshot_received.emit(applied_commands)


func _on_error(msg: Dictionary) -> void:
	var code: String = str(msg.get("code", "UNKNOWN"))
	var message: String = str(msg.get("message", ""))
	push_warning("WSClient error from server: [%s] %s" % [code, message])
	error_received.emit(code, message)


func _on_server_disconnect(msg: Dictionary) -> void:
	var reason: String = str(msg.get("reason", "server disconnect"))
	_auto_reconnect = false
	if _peer != null and _peer.get_ready_state() == 1:
		_peer.close()
	disconnected.emit(reason)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

## Public API: send a JSON dictionary to the gateway (Tier 4: FRAME_REPORT, etc.).
func send_json(data: Dictionary) -> void:
	_send_json(data)


func _send_json(data: Dictionary) -> void:
	if _peer == null or _peer.get_ready_state() != 1:
		return
	var text: String = JSON.stringify(data)
	_peer.send_text(text)
