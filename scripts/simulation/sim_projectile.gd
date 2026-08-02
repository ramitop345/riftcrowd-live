## Pooled projectile. Flies toward target's current position each tick.
## Hit within 12px, released to pool on hit/expiry (3s lifetime) or target death.
class_name SimProjectile
extends RefCounted

var id: int = -1
var faction_index: int = -1
var position: Vector2 = Vector2.ZERO
var velocity: Vector2 = Vector2.ZERO
var damage: float = 0.0
var target_id: int = -1
var active: bool = false
var lifetime: float = 0.0


func reset() -> void:
	id = -1
	faction_index = -1
	position = Vector2.ZERO
	velocity = Vector2.ZERO
	damage = 0.0
	target_id = -1
	active = false
	lifetime = 0.0
