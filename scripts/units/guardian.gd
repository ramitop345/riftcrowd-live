## Guardian visual — Hexagonal Tank.
## A hexagon with inner armor plate and a shield arc.
extends "res://scripts/units/base_unit.gd"

const PULSE_SPEED: float = 1.5
const PULSE_AMOUNT: float = 0.03

var _hex_radius: float = 25.0


func _ready() -> void:
	body_size = 50.0
	_hex_radius = body_size * 0.5
	super._ready()


func _draw_unit_shape(c: Vector2) -> void:
	var pulse: float = 1.0 + sin(_unit_time * PULSE_SPEED) * PULSE_AMOUNT
	var r: float = _hex_radius * pulse
	# Outer hexagon (dark outline)
	var outer := _make_hex(c, r)
	draw_colored_polygon(outer, _outline_color)
	# Inner hexagon (faction fill)
	var inner := _make_hex(c, r * 0.75)
	draw_colored_polygon(inner, _faction_color)
	# Core hexagon (armor plate)
	var core := _make_hex(c, r * 0.4)
	draw_colored_polygon(core, Color(
		_faction_color.r * 0.6,
		_faction_color.g * 0.6,
		_faction_color.b * 0.6, 0.7))
	# Shield arc (120 degrees on the left side — facing enemy)
	var arc_start: float = PI * 0.65 + sin(_unit_time * 0.5) * 0.1
	var arc_end: float = PI * 1.35 + sin(_unit_time * 0.5) * 0.1
	_draw_arc_segments(c, r * 1.15, arc_start, arc_end,
		Color(_faction_color.r, _faction_color.g, _faction_color.b, 0.6), 3.0)
	# Defending glow
	if _current_state.to_lower() == "defend":
		_draw_ring(c, r * 1.2, Color(_faction_color.r, _faction_color.g, _faction_color.b, 0.4), 2.5)
	# Retreat tint
	if _is_retreating():
		draw_colored_polygon(outer, _retreat_tint())
	# Hit flash
	if _hit_flash > 0.0:
		draw_colored_polygon(outer, Color(1, 1, 1, _hit_flash * 0.6))
	# Low HP warning
	if _is_low_hp():
		var warn: float = 0.15 + 0.15 * sin(_unit_time * 6.0)
		_draw_ring(c, r * 1.1, Color(1, 0.3, 0.1, warn), 1.5)


func _make_hex(center: Vector2, radius: float) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for i in 6:
		var angle: float = TAU * float(i) / 6.0 - PI / 2.0
		pts.append(center + Vector2(cos(angle), sin(angle)) * radius)
	return pts
