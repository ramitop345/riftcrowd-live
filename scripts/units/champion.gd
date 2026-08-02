## Champion visual — Diamond Knight.
## A rotating diamond/rhombus with a pulsing inner core.
extends "res://scripts/units/base_unit.gd"

const ROTATE_SPEED: float = 0.8

var _diamond_half: float = 20.0


func _ready() -> void:
	body_size = 40.0
	_diamond_half = body_size * 0.5
	super._ready()


func _draw_unit_shape(c: Vector2) -> void:
	var angle: float = _unit_time * ROTATE_SPEED
	# Outer diamond
	var outer := PackedVector2Array([
		c + Vector2(0, -_diamond_half),
		c + Vector2(_diamond_half, 0),
		c + Vector2(0, _diamond_half),
		c + Vector2(-_diamond_half, 0),
	])
	outer = _rotate_points(outer, c, angle)
	draw_colored_polygon(outer, _outline_color)
	# Inner diamond (faction fill)
	var inner := PackedVector2Array([
		c + Vector2(0, -_diamond_half * 0.72),
		c + Vector2(_diamond_half * 0.72, 0),
		c + Vector2(0, _diamond_half * 0.72),
		c + Vector2(-_diamond_half * 0.72, 0),
	])
	inner = _rotate_points(inner, c, angle)
	draw_colored_polygon(inner, _faction_color)
	# Core diamond (pulses when attacking)
	var core_size: float = _diamond_half * 0.32
	if _is_attacking():
		core_size *= 1.0 + _attack_glow()
	var core := PackedVector2Array([
		c + Vector2(0, -core_size),
		c + Vector2(core_size, 0),
		c + Vector2(0, core_size),
		c + Vector2(-core_size, 0),
	])
	core = _rotate_points(core, c, angle)
	draw_colored_polygon(core, Color(1, 1, 1, 0.55))
	# Retreat tint
	if _is_retreating():
		draw_colored_polygon(outer, _retreat_tint())
	# Hit flash
	if _hit_flash > 0.0:
		draw_colored_polygon(outer, Color(1, 1, 1, _hit_flash * 0.6))
	# Low HP warning
	if _is_low_hp():
		var warn: float = 0.15 + 0.15 * sin(_unit_time * 6.0)
		_draw_ring(c, _diamond_half * 1.1, Color(1, 0.3, 0.1, warn), 1.5)
