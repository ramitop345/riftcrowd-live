## Crown visual — animated 6-pointed star with sparkles and glow.
extends Node2D

var _body: ColorRect
var _time: float = 0.0
var _dominion_intensity: float = 0.0
var _gold: Color = Color(1.0, 0.85, 0.2)


func _ready() -> void:
	_body = $Body
	_body.visible = false


func _process(delta: float) -> void:
	_time += delta
	queue_redraw()


func update_visual(dominion_values: Variant) -> void:
	if typeof(dominion_values) != TYPE_ARRAY:
		return
	var dom: Array = dominion_values
	var max_dom: float = 0.0
	for v: Variant in dom:
		max_dom = maxf(max_dom, float(v))
	_dominion_intensity = clampf(max_dom / 100.0, 0.0, 1.0)


func _draw() -> void:
	var center := Vector2.ZERO
	var angle: float = _time * 3.5  # ~20 deg/sec
	var star_r: float = 20.0 + _dominion_intensity * 5.0
	var pulse: float = 1.0 + sin(_time * 3.0) * 0.05
	star_r *= pulse
	# Outer glow
	for i in 5:
		var t: float = float(i) / 5.0
		var r: float = star_r * (1.5 + t * 1.0)
		var a: float = (0.04 + _dominion_intensity * 0.08) * (1.0 - t)
		_draw_circle_at(center, r, Color(1.0, 0.85, 0.2, a))
	# 6-pointed star (two overlapping triangles)
	var gold_fill := Color(_gold.r, _gold.g, _gold.b, 0.4 + _dominion_intensity * 0.5)
	# Triangle 1 (pointing up)
	var tri1 := PackedVector2Array()
	for i in 3:
		var a: float = angle + TAU * float(i) / 3.0 - PI / 2.0
		tri1.append(center + Vector2(cos(a), sin(a)) * star_r)
	draw_colored_polygon(tri1, gold_fill)
	# Triangle 2 (pointing down)
	var tri2 := PackedVector2Array()
	for i in 3:
		var a: float = angle + PI / 3.0 + TAU * float(i) / 3.0 - PI / 2.0
		tri2.append(center + Vector2(cos(a), sin(a)) * star_r)
	draw_colored_polygon(tri2, gold_fill)
	# Outline rings
	var ring_alpha: float = 0.2 + _dominion_intensity * 0.3
	_draw_ring_at(center, star_r * 1.1, Color(1.0, 0.9, 0.3, ring_alpha), 1.5)
	_draw_ring_at(center, star_r * 1.3, Color(1.0, 0.85, 0.2, ring_alpha * 0.5), 1.0)
	# Inner bright core
	_draw_circle_at(center, 5.0, Color(1, 1, 0.8, 0.6 + _dominion_intensity * 0.3))
	# Orbiting sparkles
	for i in 6:
		var spark_angle: float = _time * 2.0 + TAU * float(i) / 6.0
		var spark_r: float = star_r * 1.4
		var spark_pos: Vector2 = center + Vector2(cos(spark_angle), sin(spark_angle)) * spark_r
		var spark_alpha: float = 0.3 + 0.3 * sin(_time * 4.0 + float(i) * 1.5)
		spark_alpha *= (0.3 + _dominion_intensity * 0.7)
		_draw_circle_at(spark_pos, 2.0, Color(1, 0.95, 0.5, spark_alpha))


func _draw_circle_at(center: Vector2, radius: float, color: Color) -> void:
	var pts := PackedVector2Array()
	var segs: int = maxi(int(radius * 0.8), 8)
	for i in range(segs + 1):
		var angle: float = (float(i) / float(segs)) * TAU
		pts.append(center + Vector2(cos(angle), sin(angle)) * radius)
	if pts.size() >= 3:
		draw_colored_polygon(pts, color)


func _draw_ring_at(center: Vector2, radius: float, color: Color, width: float) -> void:
	var pts := PackedVector2Array()
	var segs: int = maxi(int(radius * 0.8), 12)
	for i in range(segs + 1):
		var angle: float = (float(i) / float(segs)) * TAU
		pts.append(center + Vector2(cos(angle), sin(angle)) * radius)
	if pts.size() >= 2:
		draw_polyline(pts, color, width)


func setup(config: Dictionary) -> void:
	pass
