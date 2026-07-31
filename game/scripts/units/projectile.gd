## Projectile visual — small fast-moving dot.
extends Node2D

var _dot: ColorRect

const FACTION_COLORS: Array = [
	Color(0.4, 0.7, 1.0),
	Color(1.0, 0.5, 0.3),
]
const NEUTRAL_COLOR: Color = Color(0.7, 0.7, 0.7)


func update_visual(proj_snapshot: Dictionary) -> void:
	position = Vector2(float(proj_snapshot.get("x", 0.0)), float(proj_snapshot.get("y", 0.0)))
	var faction: int = int(proj_snapshot.get("faction", -1))
	if faction >= 0 and faction < FACTION_COLORS.size():
		_dot.color = FACTION_COLORS[faction]
	else:
		_dot.color = NEUTRAL_COLOR


func setup(config: Dictionary) -> void:
	pass
