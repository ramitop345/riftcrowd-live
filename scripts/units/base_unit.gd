## Base unit visual — neon cyberpunk style.
## All unit shapes are drawn via _draw(); subclasses override _draw_unit_shape().
## Keeps $BarBg and $HealthBar for health display; hides $Body.
extends Node2D

# -- Faction palette --
const FACTION_COLORS: Array = [
	Color(0.2, 0.6, 1.0),
	Color(1.0, 0.25, 0.3),
]
const FACTION_OUTLINES: Array = [
	Color(0.1, 0.3, 0.6),
	Color(0.6, 0.1, 0.15),
]
const NEUTRAL_COLOR: Color = Color(0.6, 0.5, 0.7)
const NEUTRAL_OUTLINE: Color = Color(0.35, 0.3, 0.4)

var body_size: float = 40.0
var display_name: String = ""

var _body: ColorRect
var _bar_bg: ColorRect
var _health_bar: TextureProgressBar

var _unit_time: float = 0.0
var _faction_color: Color = FACTION_COLORS[0]
var _outline_color: Color = FACTION_OUTLINES[0]
var _health_fraction: float = 1.0
var _current_state: String = ""
var _hit_flash: float = 0.0
var _prev_health: float = 1.0


func _ready() -> void:
	_body = $Body
	_bar_bg = $BarBg
	_health_bar = $HealthBar
	_body.visible = false
	_center_visuals()
	_create_fallback_textures()


func _center_visuals() -> void:
	_bar_bg.position = Vector2(-body_size * 0.5, -body_size * 0.5 - 10.0)
	_bar_bg.size = Vector2(body_size, 5.0)
	_health_bar.position = _bar_bg.position
	_health_bar.size = Vector2(body_size, 5.0)


func _create_fallback_textures() -> void:
	var img_bg := Image.create(1, 1, false, Image.FORMAT_RGBA8)
	img_bg.fill(Color(0.15, 0.15, 0.15, 0.6))
	_health_bar.texture_under = ImageTexture.create_from_image(img_bg)
	var img_fill := Image.create(1, 1, false, Image.FORMAT_RGBA8)
	img_fill.fill(Color(0.1, 0.9, 0.1, 1.0))
	_health_bar.texture_progress = ImageTexture.create_from_image(img_fill)


func _process(delta: float) -> void:
	_unit_time += delta
	if _hit_flash > 0.0:
		_hit_flash = maxf(_hit_flash - delta * 4.0, 0.0)
	queue_redraw()


func update_visual(unit_snapshot: Dictionary) -> void:
	position = Vector2(
		float(unit_snapshot.get("x", 0.0)),
		float(unit_snapshot.get("y", 0.0))
	)
	var faction: int = int(unit_snapshot.get("faction", -1))
	if faction >= 0 and faction < FACTION_COLORS.size():
		_faction_color = FACTION_COLORS[faction]
		_outline_color = FACTION_OUTLINES[faction]
	else:
		_faction_color = NEUTRAL_COLOR
		_outline_color = NEUTRAL_OUTLINE
	var new_health: float = clampf(float(unit_snapshot.get("health_fraction", 1.0)), 0.0, 1.0)
	if new_health < _prev_health - 0.01:
		_hit_flash = 1.0
	_prev_health = new_health
	_health_fraction = new_health
	_health_bar.value = _health_fraction * 100.0
	_current_state = str(unit_snapshot.get("state", ""))
	if _current_state == "DEAD" or _current_state == "dead":
		visible = false
	else:
		visible = true


# ---------------------------------------------------------------------------
# Drawing
# ---------------------------------------------------------------------------

func _draw() -> void:
	if not visible:
		return
	var bob: float = sin(_unit_time * 2.5) * 2.0
	var center := Vector2(0.0, bob)
	# Outer glow
	_draw_glow(center, body_size * 0.6, _faction_color, 0.12)
	# Subclass shape
	_draw_unit_shape(center)
	# Health ring
	_draw_health_arc(center, _health_fraction, _faction_color)


## Override in subclass to draw the unique unit shape.
## 'c' is the center offset (includes idle bob).
func _draw_unit_shape(c: Vector2) -> void:
	pass


# ---------------------------------------------------------------------------
# Drawing helpers
# ---------------------------------------------------------------------------

func _draw_glow(center: Vector2, radius: float, color: Color, base_alpha: float) -> void:
	var rings: int = 4
	for i in rings:
		var t: float = float(i) / float(rings)
		var r: float = radius * (1.0 + t * 0.8)
		var a: float = base_alpha * (1.0 - t)
		_draw_filled_circle(center, r, Color(color.r, color.g, color.b, a))


func _draw_filled_circle(center: Vector2, radius: float, color: Color) -> void:
	var points: PackedVector2Array = PackedVector2Array()
	var segments: int = maxi(int(radius * 0.8), 12)
	for i in range(segments + 1):
		var angle: float = (float(i) / float(segments)) * TAU
		points.append(center + Vector2(cos(angle), sin(angle)) * radius)
	if points.size() >= 3:
		draw_colored_polygon(points, color)


func _draw_ring(center: Vector2, radius: float, color: Color, width: float = 2.0) -> void:
	var points: PackedVector2Array = PackedVector2Array()
	var segments: int = maxi(int(radius * 0.8), 16)
	for i in range(segments + 1):
		var angle: float = (float(i) / float(segments)) * TAU
		points.append(center + Vector2(cos(angle), sin(angle)) * radius)
	if points.size() >= 2:
		draw_polyline(points, color, width, true)


func _draw_health_arc(center: Vector2, fraction: float, color: Color) -> void:
	if fraction <= 0.01:
		return
	var radius: float = body_size * 0.55
	var arc_angle: float = TAU * clampf(fraction, 0.0, 1.0)
	var start: float = -PI / 2.0
	var segments: int = maxi(int(arc_angle * radius / 4.0), 8)
	var points: PackedVector2Array = PackedVector2Array()
	for i in range(segments + 1):
		var t: float = float(i) / float(segments)
		var angle: float = start + arc_angle * t
		points.append(center + Vector2(cos(angle), sin(angle)) * radius)
	if points.size() >= 2:
		draw_polyline(points, Color(color.r, color.g, color.b, 0.5), 2.5, true)


func _draw_arc_segments(center: Vector2, radius: float, start_angle: float,
		end_angle: float, color: Color, width: float = 2.0) -> void:
	var total: float = end_angle - start_angle
	var segments: int = maxi(int(absf(total) * radius / 6.0), 4)
	var points: PackedVector2Array = PackedVector2Array()
	for i in range(segments + 1):
		var t: float = float(i) / float(segments)
		var angle: float = start_angle + total * t
		points.append(center + Vector2(cos(angle), sin(angle)) * radius)
	if points.size() >= 2:
		draw_polyline(points, color, width)


func _rotate_points(points: PackedVector2Array, center: Vector2,
		angle: float) -> PackedVector2Array:
	var result := PackedVector2Array()
	var cs: float = cos(angle)
	var sn: float = sin(angle)
	for p in points:
		var d: Vector2 = p - center
		result.append(center + Vector2(d.x * cs - d.y * sn, d.x * sn + d.y * cs))
	return result


# ---------------------------------------------------------------------------
# State helpers
# ---------------------------------------------------------------------------

func _is_retreating() -> bool:
	return _current_state.to_lower() == "retreat"

func _is_attacking() -> bool:
	return _current_state.to_lower() == "attack"

func _is_low_hp() -> bool:
	return _health_fraction < 0.25

func _retreat_tint() -> Color:
	var flicker: float = 0.3 + 0.3 * sin(_unit_time * 10.0)
	return Color(1.0, 0.15, 0.15, flicker)

func _attack_glow() -> float:
	return 0.2 + 0.2 * sin(_unit_time * 8.0)
