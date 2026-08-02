## Boss visual — Spike Core.
## A menacing circle with 6 rotating spikes, dark energy field, and glowing eyes.
extends "res://scripts/units/base_unit.gd"

const SPIKE_ROTATE_SPEED: float = 2.5

var _core_radius: float = 35.0


func _ready() -> void:
	body_size = 70.0
	_core_radius = body_size * 0.5
	super._ready()


func _draw_unit_shape(c: Vector2) -> void:
	var spike_angle: float = _unit_time * SPIKE_ROTATE_SPEED
	# Dark energy field (large semi-transparent circle)
	var field_r: float = _core_radius * 1.8 + sin(_unit_time * 1.5) * 5.0
	_draw_filled_circle(c, field_r, Color(0.15, 0.1, 0.2, 0.12))
	_draw_filled_circle(c, field_r * 0.85, Color(0.2, 0.12, 0.25, 0.08))
	# 6 rotating spikes
	for i in 6:
		var base_angle: float = spike_angle + TAU * float(i) / 6.0
		var spike_len: float = _core_radius * 1.1
		var base_w: float = 8.0
		var tip_pos: Vector2 = c + Vector2(cos(base_angle), sin(base_angle)) * (_core_radius + spike_len)
		var left_pos: Vector2 = c + Vector2(cos(base_angle - 0.25), sin(base_angle - 0.25)) * _core_radius
		var right_pos: Vector2 = c + Vector2(cos(base_angle + 0.25), sin(base_angle + 0.25)) * _core_radius
		# Spike outline
		var spike := PackedVector2Array([
			tip_pos,
			left_pos + Vector2(cos(base_angle - 0.25), sin(base_angle - 0.25)) * 3.0,
			right_pos + Vector2(cos(base_angle + 0.25), sin(base_angle + 0.25)) * 3.0,
		])
		draw_colored_polygon(spike, Color(0.4, 0.3, 0.5, 0.8))
		# Spike inner
		var spike_inner := PackedVector2Array([
			tip_pos,
			left_pos * 0.5 + c * 0.5,
			right_pos * 0.5 + c * 0.5,
		])
		draw_colored_polygon(spike_inner, Color(0.55, 0.4, 0.65, 0.6))
	# Core outline
	_draw_filled_circle(c, _core_radius + 3.0, Color(0.3, 0.2, 0.4, 0.9))
	# Core body
	_draw_filled_circle(c, _core_radius, Color(0.45, 0.35, 0.55, 1.0))
	# Inner ring detail
	_draw_ring(c, _core_radius * 0.65, Color(0.6, 0.45, 0.7, 0.4), 2.0)
	# Glowing eyes
	var eye_offset: float = _core_radius * 0.28
	var eye_y: float = -_core_radius * 0.1
	var eye_pulse: float = 0.7 + 0.3 * sin(_unit_time * 4.0)
	_draw_filled_circle(c + Vector2(-eye_offset, eye_y), 4.0,
		Color(1.0, 0.2, 0.2, eye_pulse))
	_draw_filled_circle(c + Vector2(eye_offset, eye_y), 4.0,
		Color(1.0, 0.2, 0.2, eye_pulse))
	# Eye glow
	_draw_filled_circle(c + Vector2(-eye_offset, eye_y), 7.0,
		Color(1.0, 0.1, 0.1, eye_pulse * 0.25))
	_draw_filled_circle(c + Vector2(eye_offset, eye_y), 7.0,
		Color(1.0, 0.1, 0.1, eye_pulse * 0.25))
	# Damage cracks when low HP
	if _health_fraction < 0.5:
		var crack_alpha: float = (1.0 - _health_fraction) * 0.6
		var crack_color := Color(1.0, 0.4, 0.1, crack_alpha)
		draw_line(c + Vector2(-5, -8), c + Vector2(-15, -20), crack_color, 1.5)
		draw_line(c + Vector2(8, 5), c + Vector2(18, 15), crack_color, 1.5)
		draw_line(c + Vector2(-3, 10), c + Vector2(-12, 22), crack_color, 1.5)
	# Hit flash
	if _hit_flash > 0.0:
		_draw_filled_circle(c, _core_radius + 3.0, Color(1, 1, 1, _hit_flash * 0.4))
