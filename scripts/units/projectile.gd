## Projectile visual — glowing energy bolt with fading trail.
extends Node2D

const FACTION_COLORS: Array = [
	Color(0.4, 0.75, 1.0),
	Color(1.0, 0.5, 0.3),
]
const NEUTRAL_COLOR: Color = Color(0.8, 0.8, 0.5)
const TRAIL_LENGTH: int = 5

var _dot: ColorRect
var _time: float = 0.0
var _color: Color = FACTION_COLORS[0]
var _trail: Array = []


func _ready() -> void:
	_dot = $Dot
	_dot.visible = false


func _process(delta: float) -> void:
	_time += delta
	queue_redraw()


func update_visual(proj_snapshot: Dictionary) -> void:
	var new_pos := Vector2(
		float(proj_snapshot.get("x", 0.0)),
		float(proj_snapshot.get("y", 0.0))
	)
	# Record trail
	if _trail.size() > 0:
		var last_pos: Vector2 = _trail[0]
		if last_pos.distance_to(new_pos) > 1.0:
			_trail.push_front(new_pos)
	else:
		_trail.push_front(new_pos)
	while _trail.size() > TRAIL_LENGTH:
		_trail.pop_back()
	position = new_pos
	var faction: int = int(proj_snapshot.get("faction", -1))
	if faction >= 0 and faction < FACTION_COLORS.size():
		_color = FACTION_COLORS[faction]
	else:
		_color = NEUTRAL_COLOR


func _draw() -> void:
	if _trail.is_empty():
		return
	var center := Vector2.ZERO
	# Trail (drawn behind)
	for i in range(1, _trail.size()):
		var t: float = 1.0 - float(i) / float(_trail.size())
		var trail_pos: Vector2 = _trail[i] - position
		var r: float = 3.0 * t + 1.0
		var alpha: float = 0.4 * t
		_draw_circle_at(trail_pos, r,
			Color(_color.r, _color.g, _color.b, alpha))
	# Outer glow
	var glow_pulse: float = 0.2 + 0.1 * sin(_time * 10.0)
	_draw_circle_at(center, 8.0, Color(_color.r, _color.g, _color.b, glow_pulse))
	# Core
	var core_pulse: float = 0.7 + 0.3 * sin(_time * 12.0)
	_draw_circle_at(center, 4.0, Color(_color.r, _color.g, _color.b, core_pulse))
	# Bright center
	_draw_circle_at(center, 2.0, Color(1, 1, 1, 0.8))


func _draw_circle_at(center: Vector2, radius: float, color: Color) -> void:
	var pts := PackedVector2Array()
	var segs: int = maxi(int(radius * 1.0), 6)
	for i in range(segs + 1):
		var angle: float = (float(i) / float(segs)) * TAU
		pts.append(center + Vector2(cos(angle), sin(angle)) * radius)
	if pts.size() >= 3:
		draw_colored_polygon(pts, color)


func setup(config: Dictionary) -> void:
	pass
