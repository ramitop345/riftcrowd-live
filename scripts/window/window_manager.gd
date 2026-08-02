## WindowManager (Phase 16) — Godot-side window mode toggling.
##
## Supports windowed, borderless, and fullscreen modes with portrait orientation.
## Connects to CommandDispatcher signal (set_window_mode) and loads config from
## the gateway HTTP endpoint on startup.
##
## Hand-authored — desk-check only, no Godot runtime verification.
class_name WindowManager
extends Node

const GATEWAY_URL := "http://127.0.0.1:8787"

var _current_mode: String = "windowed"
var _portrait: bool = true
var _width: int = 1080
var _height: int = 1920
var _vsync: bool = true
var _fps: int = 60


func _ready() -> void:
	# Load initial config from gateway HTTP endpoint.
	_load_config_from_gateway()


## Apply a window mode configuration.
## mode: "windowed", "borderless", or "fullscreen"
## portrait: if true, swap width/height if needed for portrait orientation
## width: desired window width in pixels
## height: desired window height in pixels
func set_mode(mode: String, portrait: bool, width: int, height: int) -> void:
	_current_mode = mode
	_portrait = portrait

	# Ensure portrait orientation: width should be less than height.
	if portrait and width > height:
		_width = height
		_height = width
	else:
		_width = width
		_height = height

	_apply_display_settings()


## Apply the current settings to the DisplayServer.
func _apply_display_settings() -> void:
	match _current_mode:
		"fullscreen":
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
		"borderless":
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
			DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_BORDERLESS, true)
			DisplayServer.window_set_size(Vector2i(_width, _height))
		"windowed":
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
			DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_BORDERLESS, false)
			DisplayServer.window_set_size(Vector2i(_width, _height))
		_:
			push_warning("WindowManager: unknown mode '%s', falling back to windowed" % _current_mode)
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
			DisplayServer.window_set_size(Vector2i(_width, _height))

	# VSync
	if _vsync:
		DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_ENABLED)
	else:
		DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)

	# FPS cap
	Engine.max_fps = _fps

	print("[WindowManager] Applied mode=%s portrait=%s %dx%d vsync=%s fps=%d" % [
		_current_mode, str(_portrait), _width, _height, str(_vsync), _fps
	])


## Load window config from the gateway HTTP endpoint.
## Falls back to defaults if the gateway is unreachable.
func _load_config_from_gateway() -> void:
	var http := HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_config_received.bind(http))

	var url := GATEWAY_URL + "/window/config"
	# TODO: In production, source the token from a config file or secure storage.
	var token := OS.get_environment("RIFTCROWD_TOKEN")
	if token == "":
		token = "change-me"  # fallback for dev
	var headers := ["Authorization: Bearer " + token]
	var err := http.request(url, headers, HTTPClient.METHOD_GET)
	if err != OK:
		push_warning("WindowManager: failed to request window config from gateway")
		_apply_display_settings()  # Apply defaults


func _on_config_received(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray, http_node: HTTPRequest) -> void:
	http_node.queue_free()

	if result != HTTPRequest.RESULT_SUCCESS or response_code != 200:
		push_warning("WindowManager: gateway config request failed (result=%d, code=%d)" % [result, response_code])
		_apply_display_settings()  # Apply defaults
		return

	var json := JSON.new()
	var parse_err := json.parse(body.get_string_from_utf8())
	if parse_err != OK:
		push_warning("WindowManager: failed to parse window config JSON")
		_apply_display_settings()
		return

	var data: Dictionary = json.data
	if data.has("mode") and data["mode"] is String:
		_current_mode = data["mode"]
	if data.has("portrait") and data["portrait"] is bool:
		_portrait = data["portrait"]
	if data.has("width") and data["width"] is float:
		_width = int(data["width"])
	if data.has("height") and data["height"] is float:
		_height = int(data["height"])
	if data.has("vsync") and data["vsync"] is bool:
		_vsync = data["vsync"]
	if data.has("fps") and data["fps"] is float:
		_fps = int(data["fps"])

	# Apply portrait swap if needed before display settings.
	if _portrait and _width > _height:
		var tmp := _width
		_width = _height
		_height = tmp
	_apply_display_settings()


## Returns the current mode string.
func get_mode() -> String:
	return _current_mode


## Returns whether portrait orientation is active.
func is_portrait() -> bool:
	return _portrait
