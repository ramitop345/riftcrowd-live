## ReadabilityOverlay (Phase 15) — Godot-side safe-zone overlay.
##
## Reads readability config via HTTP on startup.
## Draws safe-zone bounds (optional, toggleable via debug key).
class_name ReadabilityOverlay
extends CanvasLayer

## Whether to show the safe-zone overlay (toggle with F9 debug key).
@export var show_overlay: bool = false

## Safe zone bounds in pixels (loaded from gateway config).
var safe_zone_top: int = 80
var safe_zone_bottom: int = 120
var safe_zone_left: int = 20
var safe_zone_right: int = 20

## Readability settings.
var color_blind_mode: bool = false
var motion_reduction: bool = false
var font_size: String = "medium"
var contrast_boost: bool = false

## Internal drawing node.
var _draw_node: Control


func _ready() -> void:
	layer = 128  ## Above everything
	_draw_node = Control.new()
	_draw_node.set_anchors_preset(Control.PRESET_FULL_RECT)
	_draw_node.draw.connect(_on_draw)
	add_child(_draw_node)
	_draw_node.visible = show_overlay


func _input(event: InputEvent) -> void:
	## Toggle overlay with F9
	if event is InputEventKey and event.pressed and event.keycode == KEY_F9:
		show_overlay = not show_overlay
		_draw_node.visible = show_overlay


func _on_draw() -> void:
	if not show_overlay:
		return

	var viewport_size: Vector2 = _draw_node.get_viewport_rect().size

	# Draw safe-zone rectangle
	var rect := Rect2(
		Vector2(safe_zone_left, safe_zone_top),
		Vector2(
			viewport_size.x - safe_zone_left - safe_zone_right,
			viewport_size.y - safe_zone_top - safe_zone_bottom
		)
	)
	var color := Color(1.0, 1.0, 0.0, 0.3) if not contrast_boost else Color(1.0, 1.0, 0.0, 0.6)
	_draw_node.draw_rect(rect, color, false, 2.0)

	# Draw corner markers
	var marker_size: float = 20.0
	var corners := [
		rect.position,
		Vector2(rect.end.x, rect.position.y),
		Vector2(rect.position.x, rect.end.y),
		rect.end,
	]
	for corner in corners:
		_draw_node.draw_circle(corner, marker_size, Color(1.0, 0.5, 0.0, 0.5))


## Load config from gateway HTTP endpoint.
func load_config_from_gateway(url: String = "http://127.0.0.1:8787/readability/config") -> void:
	var http := HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(func(result: int, code: int, headers: PackedStringArray, body: PackedByteArray) -> void:
		if result == HTTPRequest.RESULT_SUCCESS and code == 200:
			var json := JSON.new()
			var err := json.parse(body.get_string_from_utf8())
			if err == OK:
				var data: Dictionary = json.data
				color_blind_mode = bool(data.get("colorBlindMode", false))
				motion_reduction = bool(data.get("motionReduction", false))
				font_size = str(data.get("fontSize", "medium"))
				contrast_boost = bool(data.get("contrastBoost", false))
				if data.has("safeZone"):
					var sz: Dictionary = data["safeZone"]
					safe_zone_top = int(sz.get("topPx", 80))
					safe_zone_bottom = int(sz.get("bottomPx", 120))
					safe_zone_left = int(sz.get("leftPx", 20))
					safe_zone_right = int(sz.get("rightPx", 20))
				_draw_node.queue_redraw()
		http.queue_free()
	)
	http.request(url)
