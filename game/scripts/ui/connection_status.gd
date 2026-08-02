## ConnectionStatus (Phase 10) — non-intrusive HUD element showing WebSocket
## connection state. Displays a small color-coded icon (32×32) in the top-right
## corner of the screen.
##
## States:
##   CONNECTING (yellow) — establishing connection
##   CONNECTED (green) — handshake complete, receiving commands
##   DISCONNECTED (red) — connection lost
##   RECONNECTING (orange) — attempting to reconnect
##
## Subscribe to WSClient signals to update the visual state automatically.
class_name ConnectionStatus
extends HBoxContainer

enum ConnState { CONNECTING, CONNECTED, DISCONNECTED, RECONNECTING }

const COLOR_CONNECTING := Color(1.0, 0.85, 0.0, 1.0)   ## yellow
const COLOR_CONNECTED := Color(0.2, 0.85, 0.2, 1.0)    ## green
const COLOR_DISCONNECTED := Color(0.9, 0.2, 0.2, 1.0)  ## red
const COLOR_RECONNECTING := Color(1.0, 0.55, 0.0, 1.0) ## orange

const LABEL_CONNECTING := "Connecting..."
const LABEL_CONNECTED := "Connected"
const LABEL_DISCONNECTED := "Disconnected"
const LABEL_RECONNECTING := "Reconnecting..."

var _icon: ColorRect
var _label: Label
var _current_state: int = ConnState.DISCONNECTED
var _ws_client: WSClient = null


func _ready() -> void:
	# Build the HUD programmatically (no external assets required).
	# Mouse filter: ignore so it doesn't block UI interaction.
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	# Icon: 32×32 ColorRect.
	_icon = ColorRect.new()
	_icon.custom_minimum_size = Vector2(32, 32)
	_icon.color = COLOR_DISCONNECTED
	_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_icon)

	# Label.
	_label = Label.new()
	_label.text = LABEL_DISCONNECTED
	#_label.theme_override_font_sizes = {} # use theme default
	_label.add_theme_font_size_override("font_size", 20)
	_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_label)

	# Position: top-right corner with safe margin.
	# The parent (Battle screen) should position this node via anchors.


## Updates the visual state. Call directly or connect to WSClient signals.
func set_state(new_state: int) -> void:
	if new_state == _current_state:
		return
	_current_state = new_state
	match new_state:
		ConnState.CONNECTING:
			_icon.color = COLOR_CONNECTING
			_label.text = LABEL_CONNECTING
		ConnState.CONNECTED:
			_icon.color = COLOR_CONNECTED
			_label.text = LABEL_CONNECTED
		ConnState.DISCONNECTED:
			_icon.color = COLOR_DISCONNECTED
			_label.text = LABEL_DISCONNECTED
		ConnState.RECONNECTING:
			_icon.color = COLOR_RECONNECTING
			_label.text = LABEL_RECONNECTING


## Returns the current connection state.
func get_state() -> int:
	return _current_state


## Convenience: connect to a WSClient node's signals for automatic updates.
func bind_to_ws_client(ws: WSClient) -> void:
	if ws == null:
		return
	_ws_client = ws
	ws.handshake_completed.connect(_on_handshake_completed)
	ws.disconnected.connect(_on_ws_disconnected)
	ws.error_received.connect(_on_ws_error)
	# Initial state based on WSClient state.
	match ws.get_state():
		WSClient.State.CONNECTING:
			set_state(ConnState.CONNECTING)
		WSClient.State.CONNECTED:
			if ws.is_ws_connected():
				set_state(ConnState.CONNECTED)
			else:
				set_state(ConnState.CONNECTING)
		WSClient.State.RECONNECTING:
			set_state(ConnState.RECONNECTING)
		_:
			set_state(ConnState.DISCONNECTED)


func _on_handshake_completed(_server_id: String) -> void:
	set_state(ConnState.CONNECTED)


func _on_ws_disconnected(_reason: String) -> void:
	# If auto-reconnect is enabled, show RECONNECTING; otherwise DISCONNECTED.
	if _ws_client != null and _ws_client.auto_reconnect_enabled():
		set_state(ConnState.RECONNECTING)
	else:
		set_state(ConnState.DISCONNECTED)


func _on_ws_error(_code: String, _message: String) -> void:
	# Flash disconnected state on error.
	set_state(ConnState.DISCONNECTED)
