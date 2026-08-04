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
const MODEL_SCALE: float = 1.0  # Meshy models are authored at real-world scale

# -- Flying-engine transport --
# Units ride a hover engine whenever they are outside the center arena (spawn
# entrance, siege march to the castle, retreat). The deck sits exactly at foot
# level so characters stand on it instead of floating above it.
const CROWN_SIM: Vector2 = Vector2(540.0, 590.0)

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
const GLIDE_FIX_MIN: float = 1.0      # ground speed above which a moving unit must play a leg clip

# -- Faction identity (strongly colorize armor/clothes so sides read at a glance) --
const FACTION_BLUE: Color = Color(0.3, 0.52, 1.0)
const FACTION_RED: Color = Color(1.0, 0.36, 0.28)
const FACTION_TINT_STRENGTH: float = 0.82  # blend toward faction hue (0 = original, 1 = full recolor)

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
var _faction_index: int = -1
var _health_bar: Sprite3D = null
var _dead: bool = false
var _spawned: bool = false
var _ground_circle: MeshInstance3D = null
var _anim_map: Dictionary = {}
var _prev_world_pos: Vector3 = Vector3.ZERO
var _has_prev_pos: bool = false
var _prev_snapshot_usec: int = 0
var _ground_speed: float = 0.0
var _target_yaw: float = 0.0
var _transport: Node3D = null
var _transport_engine_mat: StandardMaterial3D = null
var _center_radius_sim: float = 170.0  # arena capture zone radius in sim units


func _ready() -> void:
	_create_ground_circle()
	_create_health_bar()
	_build_transport()


## Capture-zone radius in sim units (arena_3d passes the configured value).
func set_center_radius(radius_sim: float) -> void:
	_center_radius_sim = maxf(radius_sim, 1.0)


func _process(delta: float) -> void:
	if _hit_flash > 0.0:
		_hit_flash = maxf(_hit_flash - delta * 4.0, 0.0)
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
	# Ground speed from snapshot deltas (presentation-side gait detection).
	# Measured against real time between update_visual calls, not render delta,
	# because snapshot cadence differs from frame rate (and playback speed).
	var now_usec: int = Time.get_ticks_usec()
	if _has_prev_pos:
		var dt_snapshot: float = clampf(float(now_usec - _prev_snapshot_usec) / 1000000.0, 0.001, 0.25)
		var move_delta := Vector2(new_pos.x, new_pos.z) - Vector2(_prev_world_pos.x, _prev_world_pos.z)
		var raw_speed: float = move_delta.length() / dt_snapshot
		_ground_speed = lerpf(_ground_speed, raw_speed, 0.5)
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
		_paint_transport_engine(new_faction)
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
		# Long-distance travel (march on the castle, repositioning): run.
		_play_gait(ANIM_RUN)
	elif state == "attack":
		# Closing on an opponent = walk; planted in range = attack clip.
		if _ground_speed > GAIT_WALK_MAX:
			_play_gait(ANIM_WALK)
		else:
			_play_anim(_attack_anim)
	elif state == "retreat":
		_play_gait(ANIM_RETREAT)
	elif state == "defend":
		_play_anim(ANIM_SHIELD if _class_name == "guardian" else ANIM_IDLE)
	else:
		_play_anim(ANIM_IDLE)
	# Anti-levitation: whatever the sim state, a unit that is clearly travelling
	# must play a locomotion track so its legs move instead of gliding.
	_ensure_locomotion()
	# Flying engine: ridden whenever the unit is outside the center arena.
	if _transport != null:
		_transport.visible = _wants_transport(sx, sy)


## If a unit is moving but currently playing a stationary clip (idle/spawn/etc.),
## fall back to walk/run so it never slides across the ground without stepping.
func _ensure_locomotion() -> void:
	if _dead:
		return
	if _ground_speed < GLIDE_FIX_MIN:
		return
	if _current_anim == ANIM_RUN or _current_anim == ANIM_WALK or _current_anim == ANIM_RETREAT:
		return
	_play_gait(ANIM_RUN if _ground_speed > GAIT_WALK_MAX else ANIM_WALK)


# ---------------------------------------------------------------------------
# Flying-engine transport (hover platform ridden outside the center arena)
# ---------------------------------------------------------------------------

## Primitive hover engine built in code (Meshy-swappable later). Deck top sits
## exactly at local y = 0 (foot level) so the character stands on it, not above.
func _build_transport() -> void:
	if _class_name == "boss":
		return  # the boss is a creature — it walks everywhere on its own
	_transport = Node3D.new()
	_transport.name = "FlyEngine"
	var hull_mat := StandardMaterial3D.new()
	hull_mat.albedo_color = Color(0.28, 0.3, 0.36)
	hull_mat.metallic = 0.7
	hull_mat.roughness = 0.35
	var deck := MeshInstance3D.new()
	deck.name = "Deck"
	var deck_mesh := CylinderMesh.new()
	deck_mesh.top_radius = 0.95
	deck_mesh.bottom_radius = 0.7
	deck_mesh.height = 0.16
	deck.mesh = deck_mesh
	deck.material_override = hull_mat
	deck.position = Vector3(0, -0.08, 0)  # deck top flush with the feet
	_transport.add_child(deck)
	var rim := MeshInstance3D.new()
	rim.name = "Rim"
	var rim_mesh := TorusMesh.new()
	rim_mesh.inner_radius = 0.62
	rim_mesh.outer_radius = 0.8
	rim.mesh = rim_mesh
	rim.material_override = hull_mat
	rim.position = Vector3(0, -0.2, 0)
	_transport.add_child(rim)
	_transport_engine_mat = StandardMaterial3D.new()
	_transport_engine_mat.albedo_color = Color(0.3, 0.7, 1.0)
	_transport_engine_mat.emission_enabled = true
	_transport_engine_mat.emission = Color(0.3, 0.7, 1.0)
	_transport_engine_mat.emission_energy_multiplier = 2.0
	var glow := MeshInstance3D.new()
	glow.name = "EngineGlow"
	var glow_mesh := CylinderMesh.new()
	glow_mesh.top_radius = 0.55
	glow_mesh.bottom_radius = 0.38
	glow_mesh.height = 0.1
	glow.mesh = glow_mesh
	glow.material_override = _transport_engine_mat
	glow.position = Vector3(0, -0.24, 0)
	_transport.add_child(glow)
	_transport.visible = false
	add_child(_transport)


## Engine glow matches the faction so riders read as blue/red at a glance.
func _paint_transport_engine(faction: int) -> void:
	if _transport_engine_mat == null:
		return
	var col := Color(0.3, 0.7, 1.0)
	if faction == 0:
		col = Color(0.25, 0.5, 1.0)
	elif faction == 1:
		col = Color(1.0, 0.35, 0.25)
	_transport_engine_mat.albedo_color = col
	_transport_engine_mat.emission = col


## True while the unit stands outside the center capture zone — i.e. arriving
## from the spawn, marching on the enemy castle, or falling back to defend.
func _wants_transport(sx: float, sy: float) -> bool:
	if _dead:
		return false
	return Vector2(sx, sy).distance_to(CROWN_SIM) > _center_radius_sim


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


## Gait playback: pick the requested locomotion clip, falling back run → walk
## → idle for models missing a track, then calibrate playback speed to the
## measured ground speed so feet never slide.
func _play_gait(logical: String) -> void:
	var want: String = logical
	if not _anim_map.has(want):
		if want == ANIM_RUN and _anim_map.has(ANIM_WALK):
			want = ANIM_WALK
		elif want == ANIM_WALK and _anim_map.has(ANIM_RUN):
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


## Strongly colorize a unit's meshes toward its faction hue so blue vs red is
## unmistakable on the battlefield. Preserves texture shading by scaling the
## faction color by each surface's original luminance, then blends with the
## original albedo to keep skin/detail readable.
func _apply_faction_tint(faction: int) -> void:
	if _model == null:
		return
	var faction_color: Color
	if faction == 0:
		faction_color = FACTION_BLUE
	elif faction == 1:
		faction_color = FACTION_RED
	else:
		return
	_colorize_meshes(_model, faction_color)


func _colorize_meshes(node: Node, faction_color: Color) -> void:
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node as MeshInstance3D
		var mesh: Mesh = mi.mesh
		if mesh != null:
			for surface in mesh.get_surface_count():
				var mat: Material = mesh.surface_get_material(surface)
				if mat is BaseMaterial3D:
					var base_mat: BaseMaterial3D = mat as BaseMaterial3D
					var tinted: BaseMaterial3D = base_mat.duplicate() as BaseMaterial3D
					var base: Color = base_mat.albedo_color
					var lum: float = clampf(0.299 * base.r + 0.587 * base.g + 0.114 * base.b, 0.12, 1.0)
					var recolored := Color(
						faction_color.r * lum * 1.7,
						faction_color.g * lum * 1.7,
						faction_color.b * lum * 1.7,
						base.a
					)
					tinted.albedo_color = base.lerp(recolored, FACTION_TINT_STRENGTH)
					mi.set_surface_override_material(surface, tinted)
	for child in node.get_children():
		_colorize_meshes(child, faction_color)


## Faction index of the model currently shown (0 = left/blue, 1 = right/red, -1 = neutral).
func get_faction_index() -> int:
	return _faction_index


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
	if _transport != null:
		_transport.visible = false
	if _health_bar != null:
		_health_bar.visible = false
	var bg: Node = get_node_or_null("HealthBarBg")
	if bg != null:
		bg.visible = false


## Plays a gift-tier technique animation (tier 1 = minor, 2 = average, 3 = major).
## Returns true if a technique clip was found and started.
func play_technique(tier: int) -> bool:
	var key: String
	match tier:
		1: key = ANIM_TECH1
		2: key = ANIM_TECH2
		3: key = ANIM_TECH3
		_: key = ANIM_TECH1
	if not _anim_map.has(key):
		return false
	_current_anim = ""  # force replay even if the same clip is current
	_play_anim(key)
	return true


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
		ANIM_RETREAT: ["backward", "retreat", "run"],
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
	_health_bar.pixel_size = 0.007
	_health_bar.no_depth_test = true
	_health_bar.transparent = true
	_health_bar.position = Vector3(0, 2.6, 0)
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
	bg.pixel_size = 0.007
	bg.no_depth_test = true
	bg.transparent = true
	bg.position = Vector3(0, 2.6, -0.01)
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
						if flash > 0.01:
							bm.emission_enabled = true
							bm.emission = Color(1.0, 0.3, 0.2, 1.0)
							bm.emission_energy_multiplier = flash * 5.0
						else:
							bm.emission_energy_multiplier = 0.0
		elif child is Node3D:
			_apply_mesh_flash(child, flash)
