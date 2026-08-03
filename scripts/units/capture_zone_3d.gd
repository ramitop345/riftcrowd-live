## Capture zone 3D visual — circular ground effect around the crown.
## Accepts capture_pressure [blue, red] for faction tinting.
extends Node3D

const MeshyLod := preload("res://scripts/units/meshy_lod.gd")

const ZONE_GLB: String = "res://assets/models/vfx/env_capture_zone_v1.glb"
# Meshy zone is ~1.9 m wide but 1.8 m tall; stretch flat + wide to ring size.
const ZONE_SCALE: Vector3 = Vector3(8.5, 0.25, 8.5)
const LOD_TIER: int = 1  # heavy mesh: default to ~50% tier (tunable 0..2)

var _model: Node3D = null


func _ready() -> void:
	var packed: PackedScene = load(ZONE_GLB) as PackedScene
	if packed != null:
		_model = packed.instantiate()
		_model.name = "Model"
		_model.scale = ZONE_SCALE
		add_child(_model)
		# Show only the chosen LOD tier (Meshy GLBs bake LOD0/1/2 as siblings).
		MeshyLod.apply(_model, LOD_TIER)


## Update capture zone: capture_pressure is [blue, red].
func update_visual(capture_pressure: Variant) -> void:
	pass  # Visual tinting handled by material override in future iteration.
