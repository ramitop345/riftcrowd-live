## Projectile 3D visual — gold bolt with trail.
## Accepts projectile snapshot {x, y, vx, vy, faction}.
extends Node3D

const PROJ_GLB: String = "res://assets/models/vfx/RC_VFX_ProjectileGold.glb"
const MODEL_SCALE: float = 3.0  # Blender export scale correction

const SIM_W: float = 1080.0
const SIM_H: float = 1180.0
const ARENA_W: float = 54.0
const ARENA_H: float = 26.0
const GROUND_Y: float = 2.5  # projectiles fly just above the units

var _model: Node3D = null


func _ready() -> void:
	var packed: PackedScene = load(PROJ_GLB) as PackedScene
	if packed != null:
		_model = packed.instantiate()
		_model.name = "Model"
		_model.scale = Vector3(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE)
		add_child(_model)


## Update projectile position from simulation snapshot.
func update_visual(proj_snapshot: Dictionary) -> void:
	var sx: float = float(proj_snapshot.get("x", 0.0))
	var sy: float = float(proj_snapshot.get("y", 0.0))
	position = Vector3(
		(sx / SIM_W) * ARENA_W - ARENA_W * 0.5,
		GROUND_Y,
		-((sy / SIM_H) * ARENA_H - ARENA_H * 0.5)
	)
	# Orient toward velocity direction.
	var vx: float = float(proj_snapshot.get("vx", 0.0))
	var vy: float = float(proj_snapshot.get("vy", 0.0))
	if absf(vx) > 0.01 or absf(vy) > 0.01:
		var angle: float = atan2(-vx, vy)
		rotation.y = angle
