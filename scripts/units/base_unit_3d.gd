## Base unit visual (3D) — loads a GLB model, drives animations from simulation state.
## Same public interface as base_unit.gd: update_visual(snapshot: Dictionary).
## Subclasses set _class_name and _attack_anim before calling super._ready().
class_name BaseUnit3D
extends Node3D

# -- Coordinate mapping (2D sim → 3D world) --
const SIM_W: float = 1080.0
const SIM_H: float = 1180.0
const ARENA_W: float = 54.0
const ARENA_H: float = 40.0  # depth stretched so troops fill top/bottom of the arena
const GROUND_Y: float = 1.0  # units stand on the flat arena ground
const MODEL_SCALE: float = 1.0  # Meshy models are authored at real-world scale

# -- Gait calibration (anti foot-slide) --
# Ground speed is measured from snapshot position deltas in world units/s.
# Below the walk threshold units stand and fight; closing on an opponent
# plays walk; long-distance travel (march to the castle, retreat) plays run.
const GAIT_WALK_MAX: float = 1.4
const GAIT_RUN_MIN: float = 1.7
# World units of ground covered per second of clip at speed_scale 1.0.
const CALIBRATED_WALK_UPS: float = 1.1
const CALIBRATED_RUN_UPS: float = 2.6
const GAIT_SPEED_MIN: float = 0.6
const GAIT_SPEED_MAX: float = 1.6
const GAIT_SMOOTHING: float = 0.35  # per-snapshot lerp factor for speed_scale

# -- Facing (characters turn toward their direction of travel) --
# Meshy/glTF characters are authored facing +Z at rotation.y = 0. If a model
# walks backwards, flip it by setting MODEL_FACING_OFFSET = PI.
const MODEL_FACING_OFFSET: float = 0.0
const FACING_TURN_RATE: float = 10.0  # radians/s toward target bearing
const FACING_MIN_MOVE: float = 0.01   # world units per snapshot to count as moving
const GLIDE_FIX_MIN: float = 0.12     # ground speed above which a moving unit must play a leg clip
const GAIT_ATTACK_MOVE_MIN: float = 0.5  # attacking units above this speed keep stepping instead of planting

# -- Faction identity (strongly colorize armor/clothes so sides read at a glance) --
# Saturated hues chosen so blue can never read reddish and vice versa, even
# under warm/cool lighting. The boss gets a dark neutral so it never reads white.
const FACTION_BLUE: Color = Color(0.12, 0.38, 1.0)
const FACTION_RED: Color = Color(1.0, 0.2, 0.12)
const FACTION_NEUTRAL: Color = Color(0.28, 0.24, 0.36)
const FACTION_TINT_STRENGTH: float = 0.9  # blend toward faction hue (0 = original, 1 = full recolor)
# Flat faction glow baked into every tinted material so dark texture regions
# still read as the team color instead of brown/steel (two-color rule).
const FACTION_BASE_EMISSION: float = 0.25

# -- Damage glow (God-of-War style hit feedback) --
# Every character that takes a hit burns with a strong RED emissive glow for
# a full second so viewers always see who just got struck, on either team.
const HIT_GLOW_COLOR: Color = Color(1.0, 0.12, 0.08)
const HIT_GLOW_SECONDS: float = 1.0
const HIT_GLOW_BOOST: float = 2.6

# -- Health bar (Sprite3D billboard above the head) --
# Sized to stay readable at broadcast distance: ~1.25 world units wide,
# 0.13 units tall (was 0.45 x 0.03 — too thin to track damage at a glance).
const HEALTH_BAR_PIXEL_SIZE: float = 0.013
const HEALTH_BAR_TEX_W: int = 96
const HEALTH_BAR_TEX_H: int = 10
const HEALTH_BAR_HEIGHT: float = 2.9

# -- Logical animation keys (resolved to actual GLB clip names at load) --
const ANIM_IDLE: String = "idle"
const ANIM_WALK: String = "walk"
const ANIM_RUN: String = "run"
const ANIM_RETREAT: String = "retreat"
const ANIM_MELEE: String = "melee"
const ANIM_CANNON: String = "cannon"
const ANIM_CROSSBOW: String = "ranged"
const ANIM_SHIELD: String = "block"
const ANIM_HIT: String = "hit"
const ANIM_DEATH: String = "death"
const ANIM_SPAWN: String = "spawn"
const ANIM_CELEBRATE: String = "celebrate"
# Gift-tier techniques (minor/average/major) and extra celebration moves.
const ANIM_TECH1: String = "tech1"
const ANIM_TECH2: String = "tech2"
const ANIM_TECH3: String = "tech3"
const ANIM_CELEBRATE_2: String = "celebrate_2"
const ANIM_CELEBRATE_3: String = "celebrate_3"
const ANIM_CELEBRATE_4: String = "celebrate_4"
const ANIM_CELEBRATE_5: String = "celebrate_5"

# -- GLB paths (set by subclass or exported) --
# Single model per class; faction is applied via a tint. Legacy blue/red kept as fallback.
@export var _glb_path: String = ""
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
var _faction_index: int = -2  # sentinel: any first snapshot (incl. boss -1) triggers _swap_model
var _faction_color: Color = FACTION_NEUTRAL
var _health_bar: Sprite3D = null
var _dead: bool = false
var _spawned: bool = false
var _ground_circle: MeshInstance3D = null
var _anim_map: Dictionary = {}
var _prev_world_pos: Vector3 = Vector3.ZERO
var _has_prev_pos: bool = false
var _prev_snapshot_usec: int = 0
var _ground_speed: float = 0.0
var _last_move_usec: int = 0
# Sliding-window speed measurement: sim ticks (20 Hz) don't align with render
# frames, so per-frame displacement/time ratios swing wildly (a single sim
# tick's move divided by one render frame reads ~3x too fast, pinning
# speed_scale at max). Accumulating distance + time over a short window
# yields the true average ground speed.
const SPEED_WINDOW_SEC: float = 0.25
var _speed_win_dist: float = 0.0
var _speed_win_time: float = 0.0
var _target_yaw: float = 0.0

## Grayscale versions of baked albedo textures (shared across all units).
## Meshy GLBs bake armor hues into the TEXTURE while albedo_color stays
## white, so multiplying a tint over the original texture let baked blue/red
## hues bleed through. Converting the texture to grayscale first guarantees
## the final color is exactly the faction hue (texture only adds shading).
static var _gray_tex_cache: Dictionary = {}


func _ready() -> void:
	_create_ground_circle()
	_create_health_bar()


func _process(delta: float) -> void:
	if _hit_flash > 0.0:
		_hit_flash = maxf(_hit_flash - delta / HIT_GLOW_SECONDS, 0.0)
		_update_flash_tint()
	_update_facing(delta)


## Smoothly turn the character mesh toward its direction of travel so it never
## walks one way while looking another. Framerate-independent turn speed.
func _update_facing(delta: float) -> void:
	if _dead:
		return
	if _model == null or not is_instance_valid(_model):
		return
	var t: float = minf(FACING_TURN_RATE * delta, 1.0)
	_model.rotation.y = lerp_angle(_model.rotation.y, _target_yaw, t)


## Main public interface — same as 2D base_unit.gd.
func update_visual(unit_snapshot: Dictionary) -> void:
	# Position: sim 2D → 3D world
	var sx: float = float(unit_snapshot.get("x", 0.0))
	var sy: float = float(unit_snapshot.get("y", 0.0))
	var new_pos := Vector3(
		(sx / SIM_W) * ARENA_W - ARENA_W * 0.5,
		GROUND_Y,
		-((sy / SIM_H) * ARENA_H - ARENA_H * 0.5)
	)
	# Ground speed from snapshot deltas (presentation-side gait detection),
	# averaged over a short sliding window. Sim ticks (20 Hz) don't line up
	# with render frames, so instantaneous displacement/time ratios spike when
	# several frames' worth of movement lands in one call — the window evens
	# that out and never reads a moving unit as faster than it really is.
	var now_usec: int = Time.get_ticks_usec()
	if _has_prev_pos:
		var dt_snapshot: float = clampf(float(now_usec - _prev_snapshot_usec) / 1000000.0, 0.001, 0.5)
		var move_delta := Vector2(new_pos.x, new_pos.z) - Vector2(_prev_world_pos.x, _prev_world_pos.z)
		_speed_win_time += dt_snapshot
		_speed_win_dist += move_delta.length()
		if _speed_win_time > SPEED_WINDOW_SEC:
			_ground_speed = _speed_win_dist / _speed_win_time
			_speed_win_dist = 0.0
			_speed_win_time = 0.0
			if _ground_speed > GLIDE_FIX_MIN:
				_last_move_usec = now_usec
		if move_delta.length() < 0.0005 and float(now_usec - _last_move_usec) / 1000000.0 > SPEED_WINDOW_SEC:
			# No displacement for a full window: the unit genuinely stopped
			# (hold the last reading briefly first, since sim ticks repeat
			# positions across several render frames).
			_ground_speed = 0.0
		# Re-aim only while actually travelling so idle/attacking units keep
		# their last bearing instead of snapping to a stale direction.
		if move_delta.length() > FACING_MIN_MOVE:
			_target_yaw = atan2(move_delta.x, move_delta.y) + MODEL_FACING_OFFSET
	else:
		_has_prev_pos = true
	_prev_snapshot_usec = now_usec
	_prev_world_pos = new_pos
	position = new_pos
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
			_ground_speed = 0.0
			_play_anim(ANIM_DEATH)
	elif state == "spawning":
		if not _spawned:
			_spawned = true
			_play_anim(ANIM_SPAWN)
	elif state == "advance":
		# Walk while travelling; stand at ease when parked (the sim gives
		# parked units casual wander targets, so parking is brief).
		if _ground_speed > GLIDE_FIX_MIN:
			_play_gait(ANIM_WALK)
		else:
			_play_anim(ANIM_IDLE)
	elif state == "attack":
		# Closing on an opponent = keep stepping (walk); only plant and swing
		# when actually standing in range.
		if _ground_speed > GAIT_ATTACK_MOVE_MIN:
			_play_gait(ANIM_WALK)
		else:
			_play_anim(_attack_anim)
	elif state == "retreat":
		_play_gait(ANIM_RETREAT)
	elif state == "defend":
		if _ground_speed > GLIDE_FIX_MIN:
			_play_gait(ANIM_WALK)
		else:
			_play_anim(ANIM_SHIELD if _class_name == "guardian" else ANIM_IDLE)
	else:
		_play_anim(ANIM_IDLE)
	# Anti-levitation: whatever the sim state, a unit that is clearly travelling
	# must play a locomotion track so its legs move instead of gliding. There is
	# no fly engine anymore — every character crosses the bridges on foot.
	_ensure_locomotion()


## If a unit is moving but currently playing a stationary clip (idle/spawn/etc.),
## fall back to walk/run so it never slides across the ground without stepping.
## Deliberately aggressive: any visible ground movement forces a leg clip.
func _ensure_locomotion() -> void:
	if _dead:
		return
	if _ground_speed < GLIDE_FIX_MIN:
		return
	if _current_anim == ANIM_RUN or _current_anim == ANIM_WALK or _current_anim == ANIM_RETREAT:
		return
	_play_gait(ANIM_WALK)


# ---------------------------------------------------------------------------
# Model swapping
# ---------------------------------------------------------------------------

func _swap_model(faction: int) -> void:
	var path: String = _glb_path
	var use_tint: bool = not _glb_path.is_empty()
	if path.is_empty():
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
	_model.rotation.y = _target_yaw
	add_child(_model)
	if use_tint:
		_apply_faction_tint(faction)
	# Find the AnimationPlayer inside the GLB scene tree
	_anim_player = _find_animation_player(_model)
	_build_anim_map()
	_current_anim = ""
	if _anim_player != null:
		_anim_player.speed_scale = 1.0
		_play_anim(ANIM_IDLE)
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

func _play_anim(logical: String) -> void:
	if _anim_player == null or logical == _current_anim:
		return
	var clip: String = str(_anim_map.get(logical, ""))
	if clip.is_empty():
		clip = logical  # fallback: treat as a raw clip name (legacy RC_ACT_* models)
	if _anim_player.has_animation(clip):
		_anim_player.play(clip)
		_current_anim = logical


## Gait playback: walk-only locomotion (the run clip is retired — it read as
## sliding at broadcast speed). Falls back walk → run → idle only for models
## missing a walk track, then calibrates playback speed to the measured ground
## speed so feet never slide.
func _play_gait(logical: String) -> void:
	var want: String = logical
	if want == ANIM_RUN:
		want = ANIM_WALK
	if not _anim_map.has(want):
		if want == ANIM_WALK and _anim_map.has(ANIM_RUN):
			want = ANIM_RUN
	_play_anim(want)
	_apply_gait_speed(want)


## speed_scale ∝ ground speed / calibrated clip coverage, clamped to a
## readable range and smoothed so gait transitions don't pop.
func _apply_gait_speed(logical: String) -> void:
	if _anim_player == null:
		return
	var calibrated: float = CALIBRATED_RUN_UPS
	if logical == ANIM_WALK:
		calibrated = CALIBRATED_WALK_UPS
	var target: float = clampf(_ground_speed / calibrated, GAIT_SPEED_MIN, GAIT_SPEED_MAX)
	_anim_player.speed_scale = lerpf(_anim_player.speed_scale, target, GAIT_SMOOTHING)


## Forces a unit fully into its faction hue — armor, cape and cloth alike.
## Baked albedo textures are converted to grayscale (cached) and the faction
## color is applied as the albedo, so shading survives but NO surface can
## ever render white or another camp's color again.
func _apply_faction_tint(faction: int) -> void:
	if _model == null:
		return
	var faction_color: Color
	if faction == 0:
		faction_color = FACTION_BLUE
	elif faction == 1:
		faction_color = FACTION_RED
	else:
		# Neutral units (boss): darkened so they never show up white either.
		faction_color = FACTION_NEUTRAL
	_faction_color = faction_color
	_colorize_meshes(_model, faction_color)


## Converts a texture to grayscale, cached per source texture instance.
## Returns null when the texture cannot be grayscaled — callers must then drop
## the texture entirely so the faction color owns the surface.
static func _grayscale_texture(tex: Texture2D) -> Texture2D:
	if _gray_tex_cache.has(tex):
		return _gray_tex_cache[tex]
	var gray_tex: Texture2D = null
	var img: Image = tex.get_image()
	if img != null:
		img = img.duplicate()
		# Meshy albedo maps import VRAM-compressed (DXT/ETC); convert() is a
		# silent no-op on compressed images, which let baked red hues survive
		# on the blue side. Decompress first so the conversion actually runs.
		if img.is_compressed():
			img.decompress()
		if not img.is_compressed():
			img.convert(Image.FORMAT_L8)
			# L8 uploads to the GPU as a single-channel RED format and samples
			# as (lum, 0, 0, 1) — multiplying that over the BLUE faction hue
			# turned textured armor/cape surfaces dark red on the blue side.
			# Expanding to RGBA8 on the CPU replicates luminance into every
			# channel so the texture reads as true grayscale in the shader.
			img.convert(Image.FORMAT_RGBA8)
			gray_tex = ImageTexture.create_from_image(img)
	_gray_tex_cache[tex] = gray_tex
	return gray_tex


func _colorize_meshes(node: Node, faction_color: Color) -> void:
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node as MeshInstance3D
		var mesh: Mesh = mi.mesh
		if mesh != null:
			for surface in mesh.get_surface_count():
				var mat: Material = mesh.surface_get_material(surface)
				var base_mat: BaseMaterial3D = mat if mat is BaseMaterial3D else null
				if base_mat != null:
					var tinted: BaseMaterial3D = base_mat.duplicate() as BaseMaterial3D
					# Constant faction glow so shadowed armor keeps the team hue.
					tinted.emission_enabled = true
					tinted.emission = faction_color
					tinted.emission_energy_multiplier = FACTION_BASE_EMISSION
					if tinted.albedo_texture != null:
						# Grayscale the baked texture; the faction color now owns
						# the hue entirely and the texture only supplies shading.
						var gray: Texture2D = _grayscale_texture(tinted.albedo_texture)
						if gray != null:
							tinted.albedo_texture = gray
						else:
							# Un-grayscalable texture: drop it so no baked hue can leak through.
							tinted.albedo_texture = null
						tinted.albedo_color = Color(faction_color.r, faction_color.g, faction_color.b, base_mat.albedo_color.a)
					else:
						# No texture: keep the surface's own luminance as a shade
						# factor so dark straps stay darker than bright armor.
						var base: Color = base_mat.albedo_color
						var lum: float = clampf(0.299 * base.r + 0.587 * base.g + 0.114 * base.b, 0.25, 1.0)
						tinted.albedo_color = Color(
							faction_color.r * lum,
							faction_color.g * lum,
							faction_color.b * lum,
							base.a
						)
					mi.set_surface_override_material(surface, tinted)
				else:
					# No material (or a non-standard one): solid faction color.
					var solid := StandardMaterial3D.new()
					solid.albedo_color = faction_color
					solid.emission_enabled = true
					solid.emission = faction_color
					solid.emission_energy_multiplier = FACTION_BASE_EMISSION
					mi.set_surface_override_material(surface, solid)
	for child in node.get_children():
		_colorize_meshes(child, faction_color)


## Faction index of the model currently shown (0 = left/blue, 1 = right/red, -1 = neutral).
func get_faction_index() -> int:
	return _faction_index


## Debug report (Revision 11): faction + per-surface override/base albedo so a
## live game can be audited for tint leaks without node surgery.
func debug_tint_report() -> String:
	var rep: String = str(_class_name) + " f" + str(_faction_index)
	if _model == null:
		return rep + " model=null"
	var meshes: Array = []
	_collect_meshes(_model, meshes)
	if meshes.is_empty():
		return rep + " mesh=null"
	rep += " meshes=" + str(meshes.size())
	var idx: int = 0
	for m in meshes:
		var mi: MeshInstance3D = m as MeshInstance3D
		if mi.mesh == null:
			rep += " |m" + str(idx) + "=nomesh"
			idx += 1
			continue
		var n: int = mi.mesh.get_surface_count()
		for s in n:
			var om: Material = mi.get_surface_override_material(s)
			var bmat: Material = mi.mesh.surface_get_material(s)
			var ov_str: String = str((om as BaseMaterial3D).albedo_color) if om is BaseMaterial3D else "null"
			var base_str: String = str((bmat as BaseMaterial3D).albedo_color) if bmat is BaseMaterial3D else "null"
			rep += " |m" + str(idx) + "s" + str(s) + " ov=" + ov_str + " base=" + base_str
		idx += 1
	return rep


func _collect_meshes(node: Node, out: Array) -> void:
	if node is MeshInstance3D:
		out.append(node)
	for child in node.get_children():
		_collect_meshes(child, out)


## Whether this visual is currently dead (celebrations skip fallen units).
func is_dead() -> bool:
	return _dead


## Play the death animation and become a corpse. The arena keeps the body lying
## on the battlefield for a while before sweeping it, instead of vanishing.
func die() -> void:
	if _dead:
		return
	_dead = true
	_ground_speed = 0.0
	_play_anim(ANIM_DEATH)
	if _health_bar != null:
		_health_bar.visible = false
	var bg: Node = get_node_or_null("HealthBarBg")
	if bg != null:
		bg.visible = false


## Plays a gift-tier technique animation (tier 1 = minor, 2 = average, 3 = major).
## Returns true if a technique clip was found and started. Models without a
## dedicated tech clip fall back to the celebrate clip (hands-in-air pose),
## so the "team raises their hands" beat still reads on screen.
func play_technique(tier: int) -> bool:
	var key: String
	match tier:
		1: key = ANIM_TECH1
		2: key = ANIM_TECH2
		3: key = ANIM_TECH3
		_: key = ANIM_TECH1
	if _anim_map.has(key):
		_current_anim = ""  # force replay even if the same clip is current
		_play_anim(key)
		return true
	if tier >= 2 and _anim_map.has(ANIM_CELEBRATE):
		print("[Technique] %s: no tech%d clip — falling back to celebrate" % [_class_name, tier])
		_current_anim = ""
		_play_anim(ANIM_CELEBRATE)
		return true
	print("[Technique] %s: no tech%d or celebrate clip available" % [_class_name, tier])
	return false


## Plays one of the celebration clips, selected deterministically by seed.
func play_celebration(seed_index: int) -> void:
	var options: Array = []
	for key in [ANIM_CELEBRATE, ANIM_CELEBRATE_2, ANIM_CELEBRATE_3, ANIM_CELEBRATE_4, ANIM_CELEBRATE_5]:
		if _anim_map.has(key):
			options.append(key)
	if options.is_empty():
		return
	var key: String = str(options[absi(seed_index) % options.size()])
	_current_anim = ""
	_play_anim(key)


## Victory return march: plays the walk clip at a fixed calibrated pace;
## the arena tweens the node back to the center.
func play_return_march() -> void:
	if _dead:
		return
	_ground_speed = CALIBRATED_WALK_UPS  # gait speed_scale settles at ~1.0
	_play_gait(ANIM_WALK)


## Instantly face a world position (used by the victory return march, since
## update_visual is no longer driving this node once the battle is over).
func face_toward(target: Vector3) -> void:
	var delta_v := target - global_position
	if delta_v.length() < 0.05:
		return
	_target_yaw = atan2(delta_v.x, delta_v.z) + MODEL_FACING_OFFSET
	if _model != null and is_instance_valid(_model):
		_model.rotation.y = _target_yaw


## Basic attack presentation: turn toward the victim and play the strike
## clip (sword swing / shot pose) from the very first frame, regardless of
## whatever the unit was doing. Called per "strike:" sim event, so any
## number of characters can swing at the same time.
func play_strike(toward: Vector3) -> void:
	if _dead:
		return
	face_toward(toward)
	_current_anim = ""  # force replay even if the attack clip is current
	_play_anim(_attack_anim)


## God-of-War style damage feedback: the whole character burns with a red
## emissive glow for HIT_GLOW_SECONDS (driven by _process/_update_flash_tint).
## Called when a strike lands; the health-drop detector in update_visual
## re-arms the same glow, so the two paths simply refresh each other.
func play_hit_glow() -> void:
	if _dead:
		return
	_hit_flash = 1.0
	_update_flash_tint()


## Maps logical animation keys to whichever clips the loaded GLB actually contains.
func _build_anim_map() -> void:
	_anim_map.clear()
	if _anim_player == null:
		return
	var clips: Array = _anim_player.get_animation_list()
	var keywords: Dictionary = {
		ANIM_IDLE: ["idle"],
		ANIM_WALK: ["walk"],
		ANIM_RUN: ["run", "charge", "sprint"],
		ANIM_RETREAT: ["backward", "retreat"],
		ANIM_MELEE: ["combo", "slash", "swing", "attack"],
		ANIM_CANNON: ["cast", "shoot", "charge"],
		ANIM_CROSSBOW: ["archery", "shoot", "bow"],
		ANIM_SHIELD: ["parry", "block", "guard"],
		ANIM_HIT: ["hit", "behit", "reaction"],
		ANIM_DEATH: ["dead", "death", "die", "fall", "knock"],
		ANIM_SPAWN: ["arise", "stand_up", "spawn", "rise"],
		ANIM_CELEBRATE: ["victory", "cheer", "celebrate"],
		# Technique / extra-celebration tracks use exact names from the combined GLB.
		ANIM_TECH1: ["tech1"],
		ANIM_TECH2: ["tech2"],
		ANIM_TECH3: ["tech3"],
		ANIM_CELEBRATE_2: ["celebrate_2"],
		ANIM_CELEBRATE_3: ["celebrate_3"],
		ANIM_CELEBRATE_4: ["celebrate_4"],
		ANIM_CELEBRATE_5: ["celebrate_5"],
	}
	for key in keywords:
		var kws: Array = keywords[key]
		var found: String = ""
		# Prefer an exact logical-name match (Meshy-combined GLBs use these names).
		for c in clips:
			if str(c).to_lower() == key:
				found = str(c)
				break
		if found == "":
			for c in clips:
				var lower: String = str(c).to_lower()
				for kw in kws:
					if lower.find(kw) != -1:
						found = str(c)
						break
				if found != "":
					break
		if found != "":
			_anim_map[key] = found
	_force_locomotion_loops()


## Sustained-pose clips must loop: Meshy GLBs import their animations as
## one-shot, so a run/idle clip finishing froze the legs while the unit kept
## travelling (the classic "soldier sliding without stepping" bug — _play_anim
## never restarts the clip it believes is already current). Force looping on
## every locomotion/sustained track so it can never run out mid-move. One-shot
## clips (attack, hit, death, spawn) are left untouched on purpose.
func _force_locomotion_loops() -> void:
	if _anim_player == null:
		return
	var lib: AnimationLibrary = _anim_player.get_animation_library("")
	if lib == null:
		return
	var loop_keys: Array = [
		ANIM_IDLE, ANIM_WALK, ANIM_RUN, ANIM_RETREAT, ANIM_SHIELD,
		ANIM_CELEBRATE, ANIM_CELEBRATE_2, ANIM_CELEBRATE_3, ANIM_CELEBRATE_4,
		ANIM_CELEBRATE_5,
	]
	for key in loop_keys:
		var clip_name: String = str(_anim_map.get(key, ""))
		if clip_name.is_empty() or not lib.has_animation(clip_name):
			continue
		lib.get_animation(clip_name).loop_mode = Animation.LOOP_LINEAR


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
	_health_bar.pixel_size = HEALTH_BAR_PIXEL_SIZE
	_health_bar.no_depth_test = true
	_health_bar.transparent = true
	_health_bar.position = Vector3(0, HEALTH_BAR_HEIGHT, 0)
	# Create a simple 1x1 white texture for the bar
	var img: Image = Image.create(HEALTH_BAR_TEX_W, HEALTH_BAR_TEX_H, false, Image.FORMAT_RGBA8)
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
	bg.pixel_size = HEALTH_BAR_PIXEL_SIZE
	bg.no_depth_test = true
	bg.transparent = true
	bg.position = Vector3(0, HEALTH_BAR_HEIGHT, -0.01)
	var bg_img: Image = Image.create(HEALTH_BAR_TEX_W, HEALTH_BAR_TEX_H, false, Image.FORMAT_RGBA8)
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
	# Apply emissive boost to all MeshInstance3D children as flash effect.
	_apply_mesh_flash(_model, _hit_flash)


func _apply_mesh_flash(node: Node, flash: float) -> void:
	for child in node.get_children():
		if child is MeshInstance3D:
			var mi: MeshInstance3D = child as MeshInstance3D
			var mesh: Mesh = mi.mesh
			if mesh != null:
				for surface in mesh.get_surface_count():
					# Reuse the per-instance override (keeps any faction tint).
					var mat: Material = mi.get_surface_override_material(surface)
					if mat == null:
						var base: Material = mesh.surface_get_material(surface)
						if base is BaseMaterial3D:
							mat = (base as BaseMaterial3D).duplicate()
							mi.set_surface_override_material(surface, mat)
					if mat is BaseMaterial3D:
						var bm: BaseMaterial3D = mat as BaseMaterial3D
						# Damage glow: strong RED emission for a full second on
						# whichever character just took a hit (explicit user
						# request, God-of-War style), on both teams. The energy
						# spike keeps red-faction units readable while glowing.
						bm.emission_enabled = true
						bm.emission = HIT_GLOW_COLOR if flash > 0.01 else _faction_color
						bm.emission_energy_multiplier = FACTION_BASE_EMISSION + flash * HIT_GLOW_BOOST
		elif child is Node3D:
			_apply_mesh_flash(child, flash)
