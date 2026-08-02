## PreflightScreen (Phase 16) — Godot-side preflight UI.
##
## Shows a checklist of stream readiness checks (gateway, dashboard, provider,
## config, audio, VFX). Green checkmark for pass, red X for fail.
## "Start Stream" button enabled only when all checks pass.
##
## Polls the gateway HTTP endpoint for preflight status.
##
## Hand-authored — desk-check only, no Godot runtime verification.
class_name PreflightScreen
extends PanelContainer

const GATEWAY_URL := "http://127.0.0.1:8787"
const POLL_INTERVAL := 2.0  # seconds between preflight polls

const COLOR_PASS := Color(0.2, 0.85, 0.2, 1.0)
const COLOR_FAIL := Color(0.9, 0.2, 0.2, 1.0)

var _check_list: VBoxContainer
var _start_button: Button
var _poll_timer: float = 0.0
var _http: HTTPRequest = null
var _all_pass: bool = false


func _ready() -> void:
	# Build UI programmatically.
	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 12)
	add_child(vbox)

	# Title
	var title := Label.new()
	title.text = "Stream Preflight Checks"
	title.add_theme_font_size_override("font_size", 28)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vbox.add_child(title)

	# Checklist container.
	_check_list = VBoxContainer.new()
	_check_list.add_theme_constant_override("separation", 8)
	vbox.add_child(_check_list)

	# Start Stream button.
	_start_button = Button.new()
	_start_button.text = "Start Stream"
	_start_button.disabled = true
	_start_button.custom_minimum_size = Vector2(300, 60)
	_start_button.add_theme_font_size_override("font_size", 24)
	_start_button.pressed.connect(_on_start_pressed)
	vbox.add_child(_start_button)

	# Initial poll.
	_request_preflight()


func _exit_tree() -> void:
	if _http != null:
		_http.cancel_request()
		_http.queue_free()
		_http = null


func _process(delta: float) -> void:
	_poll_timer += delta
	if _poll_timer >= POLL_INTERVAL:
		_poll_timer = 0.0
		_request_preflight()


func _request_preflight() -> void:
	if _http != null:
		return  # Already polling.

	_http = HTTPRequest.new()
	add_child(_http)
	_http.request_completed.connect(_on_preflight_received.bind(_http))

	var url := GATEWAY_URL + "/preflight/check"
	# TODO: In production, source the token from a config file or secure storage.
	var token := OS.get_environment("RIFTCROWD_TOKEN")
	if token == "":
		token = "change-me"  # fallback for dev
	var headers := ["Authorization: Bearer " + token]
	var err := _http.request(url, headers, HTTPClient.METHOD_GET)
	if err != OK:
		push_warning("PreflightScreen: failed to request preflight status")
		_http.queue_free()
		_http = null


func _on_preflight_received(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray, http_node: HTTPRequest) -> void:
	http_node.queue_free()
	_http = null

	if result != HTTPRequest.RESULT_SUCCESS or response_code != 200:
		_update_checklist([])
		return

	var json := JSON.new()
	var parse_err := json.parse(body.get_string_from_utf8())
	if parse_err != OK:
		_update_checklist([])
		return

	var data: Dictionary = json.data
	if data.has("checks") and data["checks"] is Array:
		_update_checklist(data["checks"])


func _update_checklist(checks: Array) -> void:
	# Clear existing children.
	for child in _check_list.get_children():
		child.queue_free()

	_all_pass = true
	if checks.is_empty():
		var label := Label.new()
		label.text = "No checks run yet. Run POST /preflight/run."
		label.add_theme_color_override("font_color", COLOR_FAIL)
		_check_list.add_child(label)
		_all_pass = false
	else:
		for check in checks:
			if not check is Dictionary:
				continue
			var name: String = check.get("name", "unknown")
			var ok: bool = check.get("ok", false)
			var message: String = check.get("message", "")

			var row := HBoxContainer.new()
			row.add_theme_constant_override("separation", 8)

			# Status icon (checkmark or X)
			var icon := Label.new()
			if ok:
				icon.text = "✓"
				icon.add_theme_color_override("font_color", COLOR_PASS)
			else:
				icon.text = "✗"
				icon.add_theme_color_override("font_color", COLOR_FAIL)
				_all_pass = false
			icon.add_theme_font_size_override("font_size", 24)
			row.add_child(icon)

			# Check name and message
			var info := Label.new()
			info.text = "%s — %s" % [name, message]
			info.add_theme_font_size_override("font_size", 18)
			row.add_child(info)

			_check_list.add_child(row)

	_start_button.disabled = not _all_pass


func _on_start_pressed() -> void:
	if not _all_pass:
		return
	print("[PreflightScreen] All checks passed — starting stream")
	# Emit signal or change scene to start the game.
	# In production, this would transition to the Battle scene.
