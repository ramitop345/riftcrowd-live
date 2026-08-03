## Capture zone 3D visual — circular ground effect around the crown.
## Accepts capture_pressure [blue, red] for faction tinting.
extends Node3D

const ZONE_GLB: String = "res://assets/models/vfx/RC_VFX_CaptureZone.glb"
const MODEL_SCALE: float = 8.0  # Blender export scale correction

var _model: Node3D = null


func _ready() -> void:
	var packed: PackedScene = load(ZONE_GLB) as PackedScene
	if packed != null:
		_model = packed.instantiate()
		_model.name = "Model"
		_model.scale = Vector3(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE)
		add_child(_model)


## Update capture zone: capture_pressure is [blue, red].
func update_visual(capture_pressure: Variant) -> void:
	pass  # Visual tinting handled by material override in future iteration.
