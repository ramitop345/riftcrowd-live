## Base unit visual (3D) — loads a GLB model, drives animations from simulation state.
## Same public interface as base_unit.gd: update_visual(snapshot: Dictionary).
## Subclasses set _class_name and _attack_anim before calling super._ready().
class_name BaseUnit3D
extends Node3D

# -- Coordinate mapping (2D sim → 3D world) --
const SIM_W: float = 1080.0
const SIM_H: float = 1180.0
const ARENA_W: float = 54.0
const ARENA_H: float = 26.0
const GROUND_Y: float = 1.0  # units stand on the flat arena ground
const MODEL_SCALE: float = 3.0  # Blender export scale correction

# -- Animation names (from Blender GLB exports) --
const ANIM_IDLE: String = "RC_ACT_Idle"
const ANIM_WALK: String = "RC_ACT_Walk"
const ANIM_RUN: String = "RC_ACT_Run"
const ANIM_RETREAT: String = "RC_ACT_RetreatRun"
const ANIM_MELEE: String = "RC_ACT_MeleeAttack"
const ANIM_CANNON: String = "RC_ACT_CannonFire"
const ANIM_CROSSBOW: String = "RC_ACT_CrossbowFire"
const ANIM_SHIELD: String = "RC_ACT_ShieldBlock"
const ANIM_HIT: String = "RC_ACT_HitReact"
const ANIM_DEATH: String = "RC_ACT_Death"
const ANIM_SPAWN: String = "RC_ACT_Spawn"
const ANIM_CELEBRATE: String = "RC_ACT_Celebrate"

# -- GLB paths (set by subclass or exported) --
@export var _blue_glb_path: String = ""
@export var _red_glb_path: String = ""

# -- Subclass config --
var _class_name: String = "captain"
var _attack_anim: String = ANIM_MELEE

# -- Internal state --
var _model: Node3D = null
var _anim_player: AnimationPlayer = null
var _current_anim: String = ""
var _health_fraction: float = 1.0
var _prev_health: float = 1.0
var _hit_flash: float = 0.0
var _faction_index: int = -1
var _health_bar: Sprite3D = null
var _dead: bool = false
var _spawned: bool = false
var _ground_circle: MeshInstance3D = null


func _ready() -> void:
	_create_ground_circle()
	_create_health_bar()


func _process(delta: float) -> void:
	if _hit_flash > 0.0:
		_hit_flash = maxf(_hit_flash - delta * 4.0, 0.0)
		_update_flash_tint()


## Main public interface — same as 2D base_unit.gd.
func update_visual(unit_snapshot: Dictionary) -> void:
	# Position: sim 2D → 3D world
	var sx: float = float(unit_snapshot.get("x", 0.0))
	var sy: float = float(unit_snapshot.get("y", 0.0))
	position = Vector3(
		(sx / SIM_W) * ARENA_W - ARENA_W * 0.5,
		GROUND_Y,
		-((sy / SIM_H) * ARENA_H - ARENA_H * 0.5)
	)
	# Faction → GLB variant
	var new_faction: int = int(unit_snapshot.get("faction", -1))
	if new_faction != _faction_index:
		_faction_index = new_faction
		_swap_model(new_faction)
	# Health
	var new_health: float = clampf(float(unit_snapshot.get("health_fraction", 1.0)), 0.0, 1.0)
	if new_health < _prev_health - 0.01:
		_hit_flash = 1.0
		if _anim_player != null and not _dead:
			_play_anim(ANIM_HIT)
	_prev_health = new_health
	_health_fraction = new_health
	_update_health_bar()
	# State → animation
	var state: String = str(unit_snapshot.get("state", "")).to_lower()
	if state == "dead":
		if not _dead:
			_dead = true
			_play_anim(ANIM_DEATH)
	elif state == "spawning":
		if not _spawned:
			_spawned = true
			_play_anim(ANIM_SPAWN)
	elif state == "advance":
		_play_anim(ANIM_RUN)
	elif state == "attack":
		_play_anim(_attack_anim)
	elif state == "retreat":
		_play_anim(ANIM_RETREAT)
	elif state == "defend":
		_play_anim(ANIM_SHIELD if _class_name == "guardian" else ANIM_IDLE)
	else:
		_play_anim(ANIM_IDLE)


# ---------------------------------------------------------------------------
# Model swapping
# ---------------------------------------------------------------------------

func _swap_model(faction: int) -> void:
	var path: String = ""
	if faction == 0:
		path = _blue_glb_path
	elif faction == 1:
		path = _red_glb_path
	if path.is_empty():
		return
	# Remove old model
	if _model != null and is_instance_valid(_model):
		_model.queue_free()
		_model = null
		_anim_player = null
	# Instantiate new model from GLB
	var packed: PackedScene = load(path) as PackedScene
	if packed == null:
		push_warning("BaseUnit3D: failed to load GLB: " + path)
		return
	_model = packed.instantiate()
	_model.name = "Model"
	_model.scale = Vector3(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE)
	add_child(_model)
	# Find the AnimationPlayer inside the GLB scene tree
	_anim_player = _find_animation_player(_model)
	_current_anim = ""
	if _anim_player != null:
		_anim_player.play(ANIM_IDLE)
		_current_anim = ANIM_IDLE
	# Update ground circle color to match faction.
	if _ground_circle != null and _ground_circle.material_override != null:
		var mat: StandardMaterial3D = _ground_circle.material_override
		if faction == 0:
			mat.albedo_color = Color(0.3, 0.5, 1.0, 0.7)
		elif faction == 1:
			mat.albedo_color = Color(1.0, 0.3, 0.3, 0.7)
		else:
			mat.albedo_color = Color(0.5, 0.5, 0.5, 0.7)


func _find_animation_player(node: Node) -> AnimationPlayer:
	for child in node.get_children():
		if child is AnimationPlayer:
			return child
		var found: AnimationPlayer = _find_animation_player(child)
		if found != null:
			return found
	return null


# ---------------------------------------------------------------------------
# Animation
# ---------------------------------------------------------------------------

func _play_anim(anim_name: String) -> void:
	if _anim_player == null or anim_name == _current_anim:
		return
	if _anim_player.has_animation(anim_name):
		_anim_player.play(anim_name)
		_current_anim = anim_name


# ---------------------------------------------------------------------------
# Health bar (Sprite3D billboard)
# ---------------------------------------------------------------------------

func _create_ground_circle() -> void:
	_ground_circle = MeshInstance3D.new()
	_ground_circle.name = "GroundCircle"
	var cyl := CylinderMesh.new()
	cyl.top_radius = 1.2
	cyl.bottom_radius = 1.2
	cyl.height = 0.1
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.3, 0.5, 1.0, 0.7)  # blue by default; updated in _swap_model
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_ground_circle.mesh = cyl
	_ground_circle.material_override = mat
	_ground_circle.position = Vector3(0, -GROUND_Y + 0.15, 0)
	add_child(_ground_circle)


func _create_health_bar() -> void:
	_health_bar = Sprite3D.new()
	_health_bar.name = "HealthBar"
	_health_bar.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_health_bar.pixel_size = 0.005
	_health_bar.no_depth_test = true
	_health_bar.transparent = true
	_health_bar.position = Vector3(0, 2.2, 0)
	# Create a simple 1x1 white texture for the bar
	var img: Image = Image.create(64, 4, false, Image.FORMAT_RGBA8)
	img.fill(Color.WHITE)
	var tex: ImageTexture = ImageTexture.create_from_image(img)
	_health_bar.texture = tex
	_health_bar.modulate = Color(0.2, 0.8, 0.2, 0.9)
	_health_bar.scale = Vector3(_health_fraction, 1.0, 1.0)
	add_child(_health_bar)
	# Background bar
	var bg := Sprite3D.new()
	bg.name = "HealthBarBg"
	bg.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	bg.pixel_size = 0.005
	bg.no_depth_test = true
	bg.transparent = true
	bg.position = Vector3(0, 2.2, -0.01)
	var bg_img: Image = Image.create(64, 4, false, Image.FORMAT_RGBA8)
	bg_img.fill(Color(0.15, 0.15, 0.15, 0.7))
	bg.texture = ImageTexture.create_from_image(bg_img)
	bg.scale = Vector3(1.0, 1.0, 1.0)
	add_child(bg)


func _update_health_bar() -> void:
	if _health_bar != null:
		_health_bar.scale.x = maxf(_health_fraction, 0.01)
		if _health_fraction > 0.5:
			_health_bar.modulate = Color(0.2, 0.8, 0.2, 0.9)
		elif _health_fraction > 0.25:
			_health_bar.modulate = Color(0.9, 0.7, 0.1, 0.9)
		else:
			_health_bar.modulate = Color(0.9, 0.2, 0.1, 0.9)


# ---------------------------------------------------------------------------
# Hit flash
# ---------------------------------------------------------------------------

func _update_flash_tint() -> void:
	if _model == null or not is_instance_valid(_model):
		return
	var flash_amount: float = _hit_flash * 0.4
	# Apply emissive boost to all MeshInstance3D children as flash effect.
	_apply_mesh_flash(_model, flash_amount)


func _apply_mesh_flash(node: Node, flash: float) -> void:
	for child in node.get_children():
		if child is MeshInstance3D:
			var mi: MeshInstance3D = child as MeshInstance3D
			if flash > 0.01:
				# Create or update material overlay for flash.
				var mat: StandardMaterial3D = mi.get_surface_override_material(0)
				if mat == null:
					mat = StandardMaterial3D.new()
					mat.albedo_color = Color(1.0 + flash, 1.0 + flash, 1.0 + flash, 1.0)
					mat.emission_enabled = true
					mat.emission = Color(1.0, 0.3, 0.2, 1.0)
					mat.emission_energy_multiplier = flash * 5.0
					mi.set_surface_override_material(0, mat)
			else:
				# Remove the flash overlay.
				mi.set_surface_override_material(0, null)
		elif child is Node3D:
			_apply_mesh_flash(child, flash)
