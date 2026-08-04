## Capture zone visual — futuristic command platform (v2, Blender-built).
## Multi-material set piece: dark hull rim, steel trim, cyan holo rings and
## spokes, amber chevrons and pylons — designed as one block with the bridges.
## Accepts capture_pressure [blue, red] for faction tinting.
extends Node3D

const ZONE_GLB: String = "res://assets/models/vfx/env_capture_zone_v2.glb"
# Authored at true size (radius 9.5 on X); squash Z to the sim-mapped ellipse
# (capture radius 190 sim units -> world x ±9.5, z ±6.44).
const ZONE_SCALE: Vector3 = Vector3(1.0, 1.0, 0.678)

var _model: Node3D = null


func _ready() -> void:
	var packed: PackedScene = load(ZONE_GLB) as PackedScene
	if packed != null:
		_model = packed.instantiate()
		_model.name = "Model"
		_model.scale = ZONE_SCALE
		add_child(_model)
		# The v2 asset carries its own multi-material emissive design; no LOD
		# siblings and no single-color dimming (MeshyLod would hide all but one
		# mesh on a non-Meshy model).


## Update capture zone: capture_pressure is [blue, red].
func update_visual(capture_pressure: Variant) -> void:
	pass  # Visual tinting handled by material override in future iteration.
