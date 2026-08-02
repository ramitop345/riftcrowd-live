## Striker visual — Arrow Wedge.
## A sharp chevron pointing toward movement, with speed lines and a glowing tip.
extends "res://scripts/units/base_unit.gd"

const JITTER_AMOUNT: float = 1.5

var _half: float = 15.0


func _ready() -> void:
	body_size = 30.0
	_half = body_size * 0.5
	super._ready()


func _draw_unit_shape(c: Vector2) -> void:
	# Forward jitter when advancing
	var jx: float = 0.0
	if _current_state.to_lower() == "advance":
		jx = sin(_unit_time * 15.0) * JITTER_AMOUNT
	var tip := c + Vector2(_half + jx, 0)
	var top := c + Vector2(-_half * 0.6, -_half * 0.8)
	var mid := c + Vector2(-_half * 0.2, 0)
	var bot := c + Vector2(-_half * 0.6, _half * 0.8)
	# Outer chevron (outline)
	var outer := PackedVector2Array([
		tip + Vector2(3, 0),
		top + Vector2(-2, -2),
		mid + Vector2(-2, 0),
		bot + Vector2(-2, 2),
	])
	draw_colored_polygon(outer, _outline_color)
	# Inner chevron (faction fill)
	var inner := PackedVector2Array([tip, top, mid, bot])
	draw_colored_polygon(inner, _faction_color)
	# Glowing tip
	var tip_glow: float = 0.5 + 0.3 * sin(_unit_time * 6.0)
	if _is_attacking():
		tip_glow = 0.8 + 0.2 * sin(_unit_time * 12.0)
	_draw_filled_circle(tip + Vector2(2, 0), 4.0,
		Color(1, 1, 1, tip_glow))
	# Speed lines when advancing
	if _current_state.to_lower() == "advance":
		var line_alpha: float = 0.3 + 0.2 * sin(_unit_time * 10.0)
		var line_color := Color(_faction_color.r, _faction_color.g, _faction_color.b, line_alpha)
		for i in 3:
			var y_off: float = (float(i) - 1.0) * 5.0
			var x_start: float = -_half * 0.8 - float(i) * 4.0
			var x_end: float = x_start - 8.0
			draw_line(
				c + Vector2(x_start, y_off),
				c + Vector2(x_end, y_off),
				line_color, 1.5)
	# Retreat tint
	if _is_retreating():
		draw_colored_polygon(outer, _retreat_tint())
	# Hit flash
	if _hit_flash > 0.0:
		draw_colored_polygon(outer, Color(1, 1, 1, _hit_flash * 0.6))
	# Low HP warning
	if _is_low_hp():
		var warn: float = 0.15 + 0.15 * sin(_unit_time * 6.0)
		_draw_ring(c, _half * 1.2, Color(1, 0.3, 0.1, warn), 1.5)
