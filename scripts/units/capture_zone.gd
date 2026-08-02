## Capture zone visual — animated energy ring with faction tint.
extends Node2D

const RADIUS: float = 170.0

var _ring: ColorRect
var _time: float = 0.0
var _pressure_a: float = 0.0
var _pressure_b: float = 0.0


func _ready() -> void:
	_ring = $Ring
	_ring.visible = false


func _process(delta: float) -> void:
	_time += delta
	queue_redraw()


func update_visual(pressure: Variant) -> void:
	_pressure_a = 0.0
	_pressure_b = 0.0
	if typeof(pressure) == TYPE_ARRAY:
		var p: Array = pressure
		if p.size() >= 1:
			_pressure_a = float(p[0])
		if p.size() >= 2:
			_pressure_b = float(p[1])


func _draw() -> void:
	var center := Vector2.ZERO
	var total: float = _pressure_a + _pressure_b
	var intensity: float = clampf(total / 10.0, 0.0, 1.0)
	# Faction color balance
	var faction_tint: Color
	if total > 0.01:
		var t: float = _pressure_a / total
		faction_tint = Color(1.0, 0.25, 0.3).lerp(Color(0.2, 0.6, 1.0), t)
	else:
		faction_tint = Color(0.5, 0.5, 0.5)
	# Inner field (very subtle)
	if intensity > 0.01:
		var field_alpha: float = intensity * 0.06
		_draw_circle_at(center, RADIUS * 0.95, Color(faction_tint.r, faction_tint.g, faction_tint.b, field_alpha))
	# Dashed ring (rotating)
	var dash_count: int = 24
	var dash_arc: float = (TAU / float(dash_count)) * 0.6
	var rot_offset: float = _time * 0.3
	var ring_alpha: float = 0.15 + intensity * 0.35
	for i in dash_count:
		var start: float = rot_offset + TAU * float(i) / float(dash_count)
		var end: float = start + dash_arc
		_draw_arc_at(center, RADIUS, start, end,
			Color(faction_tint.r, faction_tint.g, faction_tint.b, ring_alpha), 2.0)
	# Second ring (inner, counter-rotating, fainter)
	var inner_r: float = RADIUS * 0.85
	var inner_count: int = 16
	var inner_dash: float = (TAU / float(inner_count)) * 0.4
	var inner_rot: float = -_time * 0.2
	var inner_alpha: float = intensity * 0.15
	for i in inner_count:
		var start: float = inner_rot + TAU * float(i) / float(inner_count)
		var end: float = start + inner_dash
		_draw_arc_at(center, inner_r, start, end,
			Color(faction_tint.r, faction_tint.g, faction_tint.b, inner_alpha), 1.5)
	# Bright pulse when pressure is high
	if intensity > 0.5:
		var pulse: float = 0.05 + 0.05 * sin(_time * 4.0)
		_draw_ring_at(center, RADIUS, Color(faction_tint.r, faction_tint.g, faction_tint.b, pulse), 3.0)


func _draw_circle_at(center: Vector2, radius: float, color: Color) -> void:
	var pts := PackedVector2Array()
	var segs: int = maxi(int(radius * 0.3), 24)
	for i in range(segs + 1):
		var angle: float = (float(i) / float(segs)) * TAU
		pts.append(center + Vector2(cos(angle), sin(angle)) * radius)
	if pts.size() >= 3:
		draw_colored_polygon(pts, color)


func _draw_arc_at(center: Vector2, radius: float, start_angle: float,
		end_angle: float, color: Color, width: float) -> void:
	var total: float = end_angle - start_angle
	var segs: int = maxi(int(absf(total) * radius / 8.0), 3)
	var pts := PackedVector2Array()
	for i in range(segs + 1):
		var t: float = float(i) / float(segs)
		var angle: float = start_angle + total * t
		pts.append(center + Vector2(cos(angle), sin(angle)) * radius)
	if pts.size() >= 2:
		draw_polyline(pts, color, width)


func _draw_ring_at(center: Vector2, radius: float, color: Color, width: float) -> void:
	var pts := PackedVector2Array()
	var segs: int = maxi(int(radius * 0.5), 24)
	for i in range(segs + 1):
		var angle: float = (float(i) / float(segs)) * TAU
		pts.append(center + Vector2(cos(angle), sin(angle)) * radius)
	if pts.size() >= 2:
		draw_polyline(pts, color, width)


func setup(config: Dictionary) -> void:
	pass
