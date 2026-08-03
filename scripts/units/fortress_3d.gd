## Fortress 3D visual — loads Blue or Red fortress GLB with health bar.
extends Node3D

const MeshyLod := preload("res://scripts/units/meshy_lod.gd")

# Meshy fortresses: blue = castle, red = dungeon keep (versioned _v1; legacy kept).
const BLUE_GLB: String = "res://assets/models/environment/env_castle_blue_v1.glb"
const RED_GLB: String = "res://assets/models/environment/env_dungeon_keep_v1.glb"
const MODEL_SCALE: float = 4.5  # Meshy fortresses authored ~1.9 m tall; scale to landmark size
const LOD_TIER: int = 1  # heavy meshes: default to ~50% tier (tunable 0..2)

var _model: Node3D = null
var _health_bar: Sprite3D = null
var _faction_index: int = -1


func _ready() -> void:
	_create_health_bar()


## Update fortress visual: health_fraction (0..1), faction (0 or 1).
func update_visual(health_fraction: float, faction: int) -> void:
	if faction != _faction_index:
		_faction_index = faction
		_swap_model(faction)
	_update_health_bar(health_fraction)


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
	_model.scale = Vector3(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE)
	add_child(_model)
	# Show only the chosen LOD tier (Meshy GLBs bake LOD0/1/2 as siblings).
	MeshyLod.apply(_model, LOD_TIER)


func _create_health_bar() -> void:
	_health_bar = Sprite3D.new()
	_health_bar.name = "HealthBar"
	_health_bar.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_health_bar.pixel_size = 0.008
	_health_bar.no_depth_test = true
	_health_bar.transparent = true
	_health_bar.position = Vector3(0, 6.5, 0)
	var img: Image = Image.create(96, 6, false, Image.FORMAT_RGBA8)
	img.fill(Color.WHITE)
	_health_bar.texture = ImageTexture.create_from_image(img)
	_health_bar.modulate = Color(0.2, 0.8, 0.2, 0.9)
	_health_bar.scale = Vector3(1.0, 1.0, 1.0)
	add_child(_health_bar)
	# Background
	var bg := Sprite3D.new()
	bg.name = "HealthBarBg"
	bg.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	bg.pixel_size = 0.008
	bg.no_depth_test = true
	bg.transparent = true
	bg.position = Vector3(0, 6.5, -0.01)
	var bg_img: Image = Image.create(96, 6, false, Image.FORMAT_RGBA8)
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
