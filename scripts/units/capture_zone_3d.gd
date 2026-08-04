## Capture zone 3D visual — circular ground effect around the crown.
## Accepts capture_pressure [blue, red] for faction tinting.
extends Node3D

const MeshyLod := preload("res://scripts/units/meshy_lod.gd")

const ZONE_GLB: String = "res://assets/models/vfx/env_capture_zone_v1.glb"
# Meshy zone is ~1.9 m wide but 1.8 m tall; stretch flat + wide to ring size.
# Sized for capture radius 170 sim units: world x ±8.5 (8.5/0.95) and z ±5.76.
const ZONE_SCALE: Vector3 = Vector3(8.95, 0.25, 6.07)
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
		# The zone is stage dressing, not the star: darken it so the saturated
		# blue/red characters stay the visual focus.
		_dim_meshes(_model)


## Dark, desaturated surface override so characters pop against the zone.
func _dim_meshes(node: Node) -> void:
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node as MeshInstance3D
		var mesh: Mesh = mi.mesh
		if mesh != null:
			for surface in mesh.get_surface_count():
				var dim := StandardMaterial3D.new()
				dim.albedo_color = Color(0.15, 0.12, 0.22, 1.0)
				dim.roughness = 0.95
				dim.metallic = 0.0
				mi.set_surface_override_material(surface, dim)
	for child in node.get_children():
		_dim_meshes(child)


## Update capture zone: capture_pressure is [blue, red].
func update_visual(capture_pressure: Variant) -> void:
	pass  # Visual tinting handled by material override in future iteration.
