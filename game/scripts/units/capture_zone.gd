## Capture zone ring placeholder — tint intensity reflects pressure.
extends Node2D

const RADIUS: float = 170.0

var _ring: ColorRect


func update_visual(pressure: Variant) -> void:
	var total: float = 0.0
	if typeof(pressure) == TYPE_ARRAY:
		for v: Variant in (pressure as Array):
			total += float(v)
	var intensity: float = clampf(total / 10.0, 0.0, 1.0)
	_ring.color = Color(1.0, 1.0, 1.0, 0.08 + 0.25 * intensity)


func setup(config: Dictionary) -> void:
	pass
