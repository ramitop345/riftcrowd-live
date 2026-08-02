## Captain visual — Energy Star.
## A 5-pointed star with crown dots, energy aura ring, and slow rotation.
extends "res://scripts/units/base_unit.gd"

const ROTATE_SPEED: float = 0.5

var _star_radius: float = 25.0


func _ready() -> void:
	body_size = 50.0
	_star_radius = body_size * 0.5
	super._ready()


func _draw_unit_shape(c: Vector2) -> void:
	var angle: float = _unit_time * ROTATE_SPEED
	# Star points
	var star_pts := PackedVector2Array()
	for i in 10:
		var a: float = TAU * float(i) / 10.0 - PI / 2.0 + angle
		var r: float = _star_radius if i % 2 == 0 else _star_radius * 0.42
		star_pts.append(c + Vector2(cos(a), sin(a)) * r)
	# Outline star (slightly larger)
	var outline_pts := PackedVector2Array()
	for i in 10:
		var a: float = TAU * float(i) / 10.0 - PI / 2.0 + angle
		var r: float = (_star_radius + 3.0) if i % 2 == 0 else (_star_radius * 0.42 + 2.0)
		outline_pts.append(c + Vector2(cos(a), sin(a)) * r)
	draw_colored_polygon(outline_pts, _outline_color)
	draw_colored_polygon(star_pts, _faction_color)
	# Inner core
	_draw_filled_circle(c, _star_radius * 0.22, Color(1, 1, 1, 0.5))
	# Crown dots (3 dots above the star)
	for i in 3:
		var dx: float = (float(i) - 1.0) * 8.0
		var dot_y: float = -_star_radius - 8.0 + sin(_unit_time * 3.0 + float(i)) * 1.5
		_draw_filled_circle(c + Vector2(dx, dot_y), 2.5,
			Color(1.0, 0.9, 0.3, 0.85))
	# Aura ring (pulsing)
	var aura_r: float = _star_radius * 1.35 + sin(_unit_time * 2.0) * 4.0
	var aura_alpha: float = 0.15 + 0.1 * sin(_unit_time * 2.5)
	if _is_attacking():
		aura_alpha = 0.35 + 0.15 * sin(_unit_time * 6.0)
	_draw_ring(c, aura_r, Color(_faction_color.r, _faction_color.g, _faction_color.b, aura_alpha), 2.0)
	# Retreat tint
	if _is_retreating():
		draw_colored_polygon(outline_pts, _retreat_tint())
	# Hit flash
	if _hit_flash > 0.0:
		draw_colored_polygon(outline_pts, Color(1, 1, 1, _hit_flash * 0.5))
	# Low HP warning
	if _is_low_hp():
		var warn: float = 0.15 + 0.15 * sin(_unit_time * 6.0)
		_draw_ring(c, _star_radius * 1.2, Color(1, 0.3, 0.1, warn), 1.5)
