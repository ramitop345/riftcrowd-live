## Crown visual placeholder — pulsing glow at arena center based on dominion.
extends Node2D

var _body: ColorRect
var _pulse_time: float = 0.0


func _ready() -> void:
	_body = $Body


func _process(delta: float) -> void:
	_pulse_time += delta
	var pulse: float = 1.0 + 0.1 * sin(_pulse_time * 3.0)
	scale = Vector2(pulse, pulse)


func update_visual(dominion_values: Variant) -> void:
	if typeof(dominion_values) != TYPE_ARRAY:
		return
	var dom: Array = dominion_values
	var max_dom: float = 0.0
	for v: Variant in dom:
		max_dom = maxf(max_dom, float(v))
	var intensity: float = clampf(max_dom / 100.0, 0.0, 1.0)
	_body.color = Color(1.0, 0.85, 0.2, 0.4 + 0.6 * intensity)


func setup(config: Dictionary) -> void:
	pass
