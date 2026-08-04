## Fortress 3D visual — loads Blue or Red fortress GLB with health bar.
extends Node3D

const MeshyLod := preload("res://scripts/units/meshy_lod.gd")

# Meshy fortresses: blue = castle, red = dungeon keep (versioned _v1; legacy kept).
const BLUE_GLB: String = "res://assets/models/environment/env_castle_blue_v1.glb"
const RED_GLB: String = "res://assets/models/environment/env_dungeon_keep_v1.glb"
# Fortresses authored ~1.9 m tall; scaled up and widened along the arena axis so
# they read as imposing strongholds that could garrison a whole squad.
const FORT_SCALE: Vector3 = Vector3(8.5, 7.0, 7.5)
const LOD_TIER: int = 1  # heavy meshes: default to ~50% tier (tunable 0..2)

var _model: Node3D = null
var _health_bar: Sprite3D = null
var _faction_index: int = -1
var _destroyed: bool = false


func _ready() -> void:
	_create_health_bar()


## Update fortress visual: health_fraction (0..1), faction (0 or 1).
func update_visual(health_fraction: float, faction: int) -> void:
	if faction != _faction_index:
		_faction_index = faction
		_swap_model(faction)
	_update_health_bar(health_fraction)
	if health_fraction <= 0.0 and not _destroyed:
		_play_destruction()


## Castle destruction visual: the keep tilts, sinks and chars while rubble
## chunks burst outward and a smoke plume rises from the ruins.
func _play_destruction() -> void:
	_destroyed = true
	if _model != null and is_instance_valid(_model):
		var tw := create_tween()
		var tilt_dir: float = -1.0 if _faction_index == 0 else 1.0
		tw.set_parallel(true)
		tw.tween_property(_model, "rotation_degrees:z", tilt_dir * 9.0, 1.6).set_ease(Tween.EASE_IN)
		tw.tween_property(_model, "position:y", -2.6, 2.0).set_ease(Tween.EASE_IN)
		tw.tween_callback(_char_model).set_delay(0.4)
	_spawn_rubble()
	_spawn_smoke()


## Darken every mesh surface so the keep reads as burnt-out.
func _char_model() -> void:
	if _model == null or not is_instance_valid(_model):
		return
	_char_meshes(_model)


func _char_meshes(node: Node) -> void:
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node as MeshInstance3D
		var mesh: Mesh = mi.mesh
		if mesh != null:
			for surface in mesh.get_surface_count():
				var mat: Material = mi.get_surface_override_material(surface)
				if mat == null:
					var base: Material = mesh.surface_get_material(surface)
					if base is BaseMaterial3D:
						mat = (base as BaseMaterial3D).duplicate()
						mi.set_surface_override_material(surface, mat)
				if mat is BaseMaterial3D:
					var bm: BaseMaterial3D = mat as BaseMaterial3D
					bm.albedo_color = Color(
						bm.albedo_color.r * 0.25,
						bm.albedo_color.g * 0.22,
						bm.albedo_color.b * 0.2,
						bm.albedo_color.a
					)
	for child in node.get_children():
		_char_meshes(child)


## A handful of primitive rock chunks scatter around the ruined gate.
func _spawn_rubble() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(_faction_index) & 0x7FFFFFFF
	var rock_mat := StandardMaterial3D.new()
	rock_mat.albedo_color = Color(0.35, 0.32, 0.3)
	for i in 10:
		var chunk := MeshInstance3D.new()
		chunk.name = "Rubble%d" % i
		var box := BoxMesh.new()
		var s: float = rng.randf_range(0.3, 0.9)
		box.size = Vector3(s, s * rng.randf_range(0.5, 1.0), s)
		chunk.mesh = box
		chunk.material_override = rock_mat
		var angle: float = rng.randf() * TAU
		var dist: float = rng.randf_range(1.5, 4.5)
		chunk.position = Vector3(cos(angle) * dist, rng.randf_range(0.1, 0.5), sin(angle) * dist)
		chunk.rotation_degrees = Vector3(rng.randf_range(-30, 30), rng.randf_range(0, 360), rng.randf_range(-30, 30))
		add_child(chunk)
		# Simple burst: fly out and settle.
		var tw := create_tween()
		var landing: Vector3 = chunk.position + Vector3(cos(angle), 0.0, sin(angle)) * rng.randf_range(1.0, 2.5)
		landing.y = 0.15
		tw.tween_property(chunk, "position", landing, 0.7).set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)


## One-shot grey smoke plume rising from the ruins.
func _spawn_smoke() -> void:
	var gpul := GPUParticles3D.new()
	gpul.name = "SmokePlume"
	gpul.position = Vector3(0, 2.0, 0)
	gpul.amount = 24
	gpul.lifetime = 2.5
	gpul.one_shot = true
	gpul.explosiveness = 0.6
	var mat := ParticleProcessMaterial.new()
	mat.direction = Vector3(0, 1, 0)
	mat.initial_velocity_min = 1.0
	mat.initial_velocity_max = 2.5
	mat.spread = 15.0
	mat.gravity = Vector3(0, 0.5, 0)
	mat.scale_min = 1.5
	mat.scale_max = 3.5
	mat.color = Color(0.25, 0.23, 0.22, 0.55)
	gpul.process_material = mat
	var quad := QuadMesh.new()
	quad.size = Vector2(1.2, 1.2)
	gpul.draw_pass_1 = quad
	add_child(gpul)
	gpul.emitting = true
	# Clean up after the plume dissipates.
	var tw := create_tween()
	tw.tween_interval(6.0)
	tw.tween_callback(gpul.queue_free)


func _swap_model(faction: int) -> void:
	var path: String = BLUE_GLB if faction == 0 else RED_GLB
	if _model != null and is_instance_valid(_model):
		_model.queue_free()
	var packed: PackedScene = load(path) as PackedScene
	if packed == null:
		push_warning("Fortress3D: failed to load " + path)
		return
	_model = packed.instantiate()
	_model.name = "Model"
	_model.scale = FORT_SCALE
	add_child(_model)
	# Show only the chosen LOD tier (Meshy GLBs bake LOD0/1/2 as siblings).
	MeshyLod.apply(_model, LOD_TIER)


func _create_health_bar() -> void:
	_health_bar = Sprite3D.new()
	_health_bar.name = "HealthBar"
	_health_bar.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_health_bar.pixel_size = 0.012
	_health_bar.no_depth_test = true
	_health_bar.transparent = true
	_health_bar.position = Vector3(0, 12.0, 0)
	var img: Image = Image.create(128, 8, false, Image.FORMAT_RGBA8)
	img.fill(Color.WHITE)
	_health_bar.texture = ImageTexture.create_from_image(img)
	_health_bar.modulate = Color(0.2, 0.8, 0.2, 0.9)
	_health_bar.scale = Vector3(1.0, 1.0, 1.0)
	add_child(_health_bar)
	# Background
	var bg := Sprite3D.new()
	bg.name = "HealthBarBg"
	bg.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	bg.pixel_size = 0.012
	bg.no_depth_test = true
	bg.transparent = true
	bg.position = Vector3(0, 12.0, -0.01)
	var bg_img: Image = Image.create(128, 8, false, Image.FORMAT_RGBA8)
	bg_img.fill(Color(0.15, 0.15, 0.15, 0.7))
	bg.texture = ImageTexture.create_from_image(bg_img)
	add_child(bg)


func _update_health_bar(fraction: float) -> void:
	if _health_bar == null:
		return
	_health_bar.scale.x = maxf(fraction, 0.01)
	if fraction > 0.5:
		_health_bar.modulate = Color(0.2, 0.8, 0.2, 0.9)
	elif fraction > 0.25:
		_health_bar.modulate = Color(0.9, 0.7, 0.1, 0.9)
	else:
		_health_bar.modulate = Color(0.9, 0.2, 0.1, 0.9)
