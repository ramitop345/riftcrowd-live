## Arena 3D visual manager — hosts fortress/crown/capture-zone instances and manages
## pooled unit and projectile visual nodes, syncing each frame from the simulation
## snapshot. Same public interface as arena.gd: setup(), apply_snapshot(), clear_round().
extends Node3D

const MeshyLod := preload("res://scripts/units/meshy_lod.gd")
const SpaceBackdropScript := preload("res://scripts/vfx/space_backdrop.gd")
const CinematicDirectorScript := preload("res://scripts/arena/cinematic_director.gd")

const UNIT_SCENE_PATHS: Dictionary = {
	"champion": "res://scenes/units/3d/Champion3D.tscn",
	"guardian": "res://scenes/units/3d/Guardian3D.tscn",
	"striker": "res://scenes/units/3d/Striker3D.tscn",
	"captain": "res://scenes/units/3d/Captain3D.tscn",
	"boss": "res://scenes/units/3d/Boss3D.tscn",
}
const PROJECTILE_SCENE_PATH: String = "res://scenes/units/3d/Projectile3D.tscn"
const FORTRESS_SCENE_PATH: String = "res://scenes/units/3d/Fortress3D.tscn"
const CROWN_SCENE_PATH: String = "res://scenes/units/3d/Crown3D.tscn"
const CAPTURE_ZONE_SCENE_PATH: String = "res://scenes/units/3d/CaptureZone3D.tscn"
const ARENA_GLB_PATH: String = "res://assets/models/environment/env_arena_v1.glb"
const BRIDGE_GLB_PATH: String = "res://assets/models/environment/env_bridge_v2.glb"
## Authored bridge length in meters (zone end x=0 to gate end).
const BRIDGE_AUTHORED_LENGTH: float = 11.7
# Meshy arena authored ~1.9 x 1.4 m; stretch to span the 54 x 40 battle field
# (fortresses at x = ±21 stay on solid ground).
const ARENA_SCALE: Vector3 = Vector3(26.0, 8.0, 24.0)
const ARENA_LOD_TIER: int = 1  # heavy mesh: default to ~50% tier (tunable 0..2)
const GROUND_Y: float = 1.0  # objects sit on the flat arena ground

signal round_ended(victory_type: String, winner: int)
## New characters walked out of a castle gate (drives the 5s PIP cameras).
signal arrivals_at_gate(faction: int)
## Gift technique cutscenes: battle.gd pauses the sandbox while a cinematic
## owns the camera and resumes it once the scene is over.
signal cinematic_started()
signal cinematic_finished()

## Fallen units stay on the battlefield as corpses for this long before the
## arena sweeps them, so kills are visible instead of units vanishing instantly.
const CORPSE_TTL_SECONDS: float = 60.0
## How long the director holds on a falling castle before the winners' march
## and celebration take over the presentation.
const FALL_PRESENT_SECONDS: float = 3.6

## Visual registries keyed by simulation id.
var _unit_visuals: Dictionary = {}
var _projectile_visuals: Dictionary = {}
## uid -> {"node": Node, "died_usec": int} for corpses awaiting sweep.
var _corpses: Dictionary = {}

## Child references for static elements.
var _fortress_a: Node = null
var _fortress_b: Node = null
var _crown: Node = null
var _capture_zone: Node = null
var _arena_ground: Node3D = null
var _bridges: Node3D = null

## Dynamic containers.
var _unit_container: Node3D
var _projectile_container: Node3D

## Camera reference for shake.
var _camera: Camera3D = null
var _camera_base_pos: Vector3 = Vector3.ZERO
var _shake_intensity: float = 0.0
var _shake_duration: float = 0.0
var _shake_timer: float = 0.0
## While > 0 the director may not switch shots (holds the falling castle).
var _shot_lock_timer: float = 0.0

## Camera director v3: a wide, mostly-static master shot that always frames the
## whole center arena, with a slow lateral drift + breathing so it never feels
## frozen. Heat-driven wing cuts (sieges/entrances) and technique/victory focus
## still punch in on demand. No continuous 360° orbit.
var _master_distance: float = 22.0
var _master_height: float = 16.0
var _master_fov: float = 50.0
var _focus_fov: float = 45.0
var _look_height: float = 1.5
var _drift_amplitude: float = 2.5
var _drift_speed: float = 0.07
var _breathing_amplitude: float = 0.6
var _smoothing_half_life: float = 0.9
var _look_half_life: float = 0.6
var _heat_decay_per_second: float = 0.6
var _switch_hysteresis: float = 1.5
var _min_hold_seconds: float = 6.0
var _wing_distance: float = 24.0
var _wing_height: float = 12.0
var _wing_fov: float = 52.0
var _wing_attack_z: float = -10.0
var _known_unit_ids: Dictionary = {}
var _cam_time: float = 0.0
var _heat: Array = [0.0, 0.0, 0.0]  ## [center, left wing (castle A), right wing (castle B)]
var _active_shot: int = 0
var _shot_age: float = 0.0
## While >= 0 the director is locked on a fortress wing (siege in progress).
## Only cleared when the siege is recalled (enemies respawn) or the fortress falls.
var _siege_lock_wing: int = -1
var _cam_pos: Vector3 = Vector3(0, 16, -22)
var _cam_look: Vector3 = Vector3(0, 1.5, 0)
var _cam_fov: float = 50.0
var _focus_timer: float = 0.0
var _focus_duration: float = 0.0
var _focus_pos: Vector3 = Vector3.ZERO

var _config: Dictionary = {}
var _faction_a: Dictionary = {}
var _faction_b: Dictionary = {}
var _victory_emitted: bool = false
var _space_backdrop: Node = null
## Gift technique cutscene player (galaxy meteor rain / lion supreme art).
var _cinematic: CinematicDirector = null
## While true the arena hands the camera to the cinematic director and
## freezes its own shot selection.
var _cinematic_active: bool = false
## Queue for tier 2+ gifts waiting to play: [{faction: int, tier: int}, ...]
## Priority: tier 3 (lion) > tier 2 (galaxy). When a cinematic finishes, the
## highest-priority gift in the queue plays next.
var _gift_queue: Array = []


func _ready() -> void:
	# Ensure the environment has a sky (in case .tscn cache is stale).
	var we: WorldEnvironment = null
	for child in get_children():
		if child is WorldEnvironment:
			we = child
			break
	if we != null and we.environment != null:
		var env: Environment = we.environment
		# Brighten ambient fill so faction colors stay readable in every shot.
		env.ambient_light_energy = 1.0
		if env.sky == null:
			var sky_mat := ProceduralSkyMaterial.new()
			sky_mat.sky_top_color = Color(0.15, 0.18, 0.3)
			sky_mat.sky_horizon_color = Color(0.25, 0.28, 0.35)
			sky_mat.ground_bottom_color = Color(0.12, 0.1, 0.08)
			sky_mat.ground_horizon_color = Color(0.2, 0.2, 0.18)
			var sky_res := Sky.new()
			sky_res.sky_material = sky_mat
			sky_res.radiance_size = 3
			env.sky = sky_res
			env.background_mode = Environment.BG_SKY
	# Camera-side fill light: the key light shines from behind the battlefield,
	# so character fronts facing the camera were left in shadow and faction
	# colors were hard to read. A soft shadowless fill from the camera direction
	# keeps every unit clearly identifiable.
	_add_fill_light()
	# Cache camera reference.
	_camera = _find_camera()
	if _camera != null:
		_camera_base_pos = _camera.position
		_camera.position = _cam_pos
		_camera.look_at(_cam_look, Vector3.UP)
		_camera.fov = _master_fov
	# Gift technique cutscene director shares the arena camera.
	if _cinematic == null:
		_cinematic = CinematicDirectorScript.new()
		_cinematic.name = "CinematicDirector"
		add_child(_cinematic)
		_cinematic.setup(self, _camera)
		_cinematic.finished.connect(_on_cinematic_finished)
		print("[Cinematic] director created (camera=%s)" % ("ok" if _camera != null else "NULL"))


## Shadowless directional fill shining from the camera side onto the fronts of
## the characters. Half the key light's strength; no shadows (the key light
## still owns shadow direction).
func _add_fill_light() -> void:
	var fill := DirectionalLight3D.new()
	fill.name = "FillLight"
	fill.light_energy = 0.9
	fill.light_color = Color(0.92, 0.95, 1.0)
	fill.shadow_enabled = false
	# Aim down-and-forward from the camera side (-Z) toward the arena center.
	fill.rotation_degrees = Vector3(-35.0, 180.0, 0.0)
	fill.position = Vector3(0.0, 30.0, -24.0)
	add_child(fill)


## Instantiates fortress/crown/capture-zone nodes with correct 3D positions.
func setup(config: Dictionary, faction_a: Dictionary, faction_b: Dictionary) -> void:
	_config = config
	_faction_a = faction_a
	_faction_b = faction_b
	_victory_emitted = false
	_clear_all()
	_apply_camera_config()
	# Arena ground mesh
	var arena_packed: PackedScene = load(ARENA_GLB_PATH) as PackedScene
	if arena_packed != null:
		_arena_ground = arena_packed.instantiate()
		_arena_ground.name = "ArenaGround"
		_arena_ground.scale = ARENA_SCALE
		_arena_ground.position = Vector3(0, GROUND_Y, 0)
		add_child(_arena_ground)
		# Show only the chosen LOD tier (Meshy GLBs bake LOD0/1/2 as siblings).
		MeshyLod.apply(_arena_ground, ARENA_LOD_TIER)
	# Capture zone (renders behind everything).
	var cz_packed: PackedScene = load(CAPTURE_ZONE_SCENE_PATH) as PackedScene
	if cz_packed != null:
		_capture_zone = cz_packed.instantiate()
		_capture_zone.position = Vector3(0, GROUND_Y + 0.02, 0)
		add_child(_capture_zone)
	# Crown at center.
	var crown_packed: PackedScene = load(CROWN_SCENE_PATH) as PackedScene
	if crown_packed != null:
		_crown = crown_packed.instantiate()
		_crown.position = Vector3(0, GROUND_Y, 0)
		add_child(_crown)
	# Fortresses at x = ±21m (matches the sim mapping of sim x=120/960).
	var fort_packed: PackedScene = load(FORTRESS_SCENE_PATH) as PackedScene
	if fort_packed != null:
		_fortress_a = fort_packed.instantiate()
		add_child(_fortress_a)
		_fortress_a.position = Vector3(-21, GROUND_Y, 0)
		if _fortress_a.has_method("update_visual"):
			_fortress_a.call("update_visual", 1.0, 0)
		_fortress_b = fort_packed.instantiate()
		add_child(_fortress_b)
		_fortress_b.position = Vector3(21, GROUND_Y, 0)
		if _fortress_b.has_method("update_visual"):
			_fortress_b.call("update_visual", 1.0, 1)
	# Stone bridges connecting each fortress to the capture zone. The fly engine
	# is gone: every character crosses on foot, so the sim funnels out-of-zone
	# traffic onto these corridors (see sim_world BRIDGE_HALF_SIM).
	_build_bridges()
	# Dynamic containers.
	_unit_container = Node3D.new()
	_unit_container.name = "UnitContainer"
	add_child(_unit_container)
	_projectile_container = Node3D.new()
	_projectile_container.name = "ProjectileContainer"
	add_child(_projectile_container)
	_setup_space_backdrop()


func _process(delta: float) -> void:
	_cam_time += delta
	# A gift cinematic owns the camera and the battlefield presentation:
	# no shot switching, no corpse sweeps, no camera writes underneath it.
	if _cinematic_active:
		return
	_sweep_corpses()
	_update_shot_selection(delta)
	# Shot targets: wide master framing the whole center arena, or wing shots.
	var target_pos: Vector3
	var target_look: Vector3
	var target_fov: float
	if _active_shot == 1:
		target_pos = _wing_position(0)
		target_look = Vector3(-17.0, 2.0, 0.0)
		target_fov = _wing_fov
	elif _active_shot == 2:
		target_pos = _wing_position(1)
		target_look = Vector3(17.0, 2.0, 0.0)
		target_fov = _wing_fov
	else:
		# Wide master shot: camera stays on one side of the arena, high and
		# pulled back so the entire center arena is always in frame. A slow
		# lateral drift + breathing keep it alive without rotating around.
		var drift_x: float = sin(_cam_time * _drift_speed * TAU) * _drift_amplitude
		var breathe: float = sin(_cam_time * 0.5 * TAU) * _breathing_amplitude
		target_pos = Vector3(drift_x, _master_height + breathe, -_master_distance)
		target_look = Vector3(0, _look_height, 0)
		target_fov = _master_fov
	# Focus push-in (major techniques, victory celebration) overrides framing.
	if _focus_timer > 0.0:
		_focus_timer -= delta
		var focus_t: float = clampf(_focus_timer / maxf(_focus_duration, 0.01), 0.0, 1.0)
		var eased: float = focus_t * focus_t  # ease back out at the end
		var focus_cam_pos: Vector3 = _focus_pos + Vector3(0, 6, -9)
		target_pos = focus_cam_pos.lerp(target_pos, eased)
		target_look = _focus_pos.lerp(target_look, eased)
		target_fov = lerpf(_focus_fov, target_fov, eased)
	# Framerate-independent exponential smoothing (half-life based).
	var pos_alpha: float = 1.0 - pow(0.5, delta / maxf(_smoothing_half_life, 0.01))
	var look_alpha: float = 1.0 - pow(0.5, delta / maxf(_look_half_life, 0.01))
	_cam_pos = _cam_pos.lerp(target_pos, pos_alpha)
	_cam_look = _cam_look.lerp(target_look, look_alpha)
	_cam_fov = lerpf(_cam_fov, target_fov, pos_alpha)
	if _camera == null:
		return
	# Camera shake takes priority over directed framing.
	if _shake_timer > 0.0:
		_shake_timer -= delta
		var t: float = _shake_timer / maxf(_shake_duration, 0.01)
		_camera.position = _cam_pos + Vector3(
			randf_range(-1.0, 1.0) * _shake_intensity * t,
			randf_range(-1.0, 1.0) * _shake_intensity * t * 0.5,
			randf_range(-1.0, 1.0) * _shake_intensity * t
		)
		_camera.look_at(_cam_look, Vector3.UP)
		_camera.fov = _cam_fov
		_camera_base_pos = _camera.position
		return
	_camera.position = _cam_pos
	_camera.look_at(_cam_look, Vector3.UP)
	_camera.fov = _cam_fov
	_camera_base_pos = _cam_pos


## Zone heat: wing shots are driven ONLY by siege/castle-under-attack events
## (no per-snapshot activity feed), decaying over time so the director drifts
## back to the arena once the castle stops being attacked.
## During an active siege the camera is locked on the fortress wing regardless
## of heat — it only returns to center when the siege is recalled.
func _update_shot_selection(delta: float) -> void:
	_shot_age += delta
	if _shot_lock_timer > 0.0:
		_shot_lock_timer -= delta
		return
	# Siege lock: while a siege is underway the camera stays on the fortress.
	if _siege_lock_wing >= 0:
		if _active_shot != _siege_lock_wing:
			_active_shot = _siege_lock_wing
			_shot_age = 0.0
		return
	for i in 3:
		_heat[i] = maxf(float(_heat[i]) - _heat_decay_per_second * delta, 0.0)
	var challenger: int = 0
	if float(_heat[1]) > float(_heat[2]) and float(_heat[1]) > 0.0:
		challenger = 1
	elif float(_heat[2]) > float(_heat[1]) and float(_heat[2]) > 0.0:
		challenger = 2
	if challenger == _active_shot:
		return
	var challenger_heat: float = float(_heat[challenger])
	var current_heat: float = float(_heat[_active_shot])
	if challenger_heat >= current_heat * _switch_hysteresis and _shot_age >= _min_hold_seconds:
		_active_shot = challenger
		_shot_age = 0.0


## Wing shot: low camera between the middle and the sieged castle, pulled
## back along the attack axis so both gate and attackers stay in frame.
func _wing_position(faction_being_sieged: int) -> Vector3:
	var side: float = -1.0 if faction_being_sieged == 0 else 1.0
	var castle_x: float = side * 21.0
	var inward: Vector3 = Vector3(-side, 0.0, 0.0)
	var cam_x: float = castle_x + inward.x * _wing_distance
	var cam_z: float = _wing_attack_z - side * 2.0
	return Vector3(cam_x, _wing_height, cam_z)


## Hard cut to a shot (bypasses hysteresis + hold). Used when a castle is
## actively being attacked — the director must show the castle, period.
func _force_shot(wing: int) -> void:
	if wing < 0 or wing > 2:
		return
	_active_shot = wing
	_shot_age = 0.0


## Shake the camera (called from battle.gd on boss ground slam etc).
func shake_camera(intensity: float, duration: float) -> void:
	_shake_intensity = intensity
	_shake_duration = duration
	_shake_timer = duration
	if _camera == null:
		_camera = _find_camera()
		if _camera != null:
			_camera_base_pos = _camera.position


func _find_camera() -> Camera3D:
	for child in get_children():
		if child is Camera3D:
			return child
	return null


func _find_world_environment() -> WorldEnvironment:
	for child in get_children():
		if child is WorldEnvironment:
			return child
	return null


## Space backdrop: replaces the sky with a seeded starfield panorama and
## starts periodic spaceship fly-bys. Created once; survives round restarts.
func _setup_space_backdrop() -> void:
	if _space_backdrop != null and is_instance_valid(_space_backdrop):
		return
	var space_v: Variant = _config.get("spaceBackdrop", {})
	if typeof(space_v) != TYPE_DICTIONARY:
		return
	var space_cfg: Dictionary = space_v
	if not bool(space_cfg.get("enabled", false)):
		return
	var we: WorldEnvironment = _find_world_environment()
	if we == null or we.environment == null:
		push_warning("Arena3D: spaceBackdrop enabled but no WorldEnvironment found")
		return
	_space_backdrop = SpaceBackdropScript.new()
	_space_backdrop.name = "SpaceBackdrop"
	add_child(_space_backdrop)
	_space_backdrop.call("configure", we.environment, space_cfg)


## Applies the camera section of gameplay.json (wide master anchor, drift,
## heat switching, wing siege shots and smoothing).
func _apply_camera_config() -> void:
	var cam_cfg: Dictionary = {}
	var cfg_v: Variant = _config.get("camera", {})
	if typeof(cfg_v) == TYPE_DICTIONARY:
		cam_cfg = cfg_v
	_master_distance = float(cam_cfg.get("masterDistance", 22.0))
	_master_height = float(cam_cfg.get("masterHeight", 16.0))
	_master_fov = float(cam_cfg.get("masterFov", 50.0))
	_focus_fov = float(cam_cfg.get("focusFov", 45.0))
	_look_height = float(cam_cfg.get("lookHeight", 1.5))
	_drift_amplitude = float(cam_cfg.get("driftAmplitude", 2.5))
	_drift_speed = float(cam_cfg.get("driftSpeed", 0.07))
	_breathing_amplitude = float(cam_cfg.get("breathingAmplitude", 0.6))
	_smoothing_half_life = float(cam_cfg.get("smoothingHalfLife", 0.9))
	_look_half_life = float(cam_cfg.get("lookHalfLife", 0.6))
	_heat_decay_per_second = float(cam_cfg.get("heatDecayPerSecond", 0.6))
	_switch_hysteresis = float(cam_cfg.get("switchHysteresis", 1.5))
	_min_hold_seconds = float(cam_cfg.get("minHoldSeconds", 6.0))
	_wing_distance = float(cam_cfg.get("wingDistance", 24.0))
	_wing_height = float(cam_cfg.get("wingHeight", 12.0))
	_wing_fov = float(cam_cfg.get("wingFov", 52.0))
	_wing_attack_z = float(cam_cfg.get("wingAttackZ", -10.0))
	_reset_director_state()


func _reset_director_state() -> void:
	_heat = [0.0, 0.0, 0.0]
	_active_shot = 0
	_shot_age = 0.0
	_shot_lock_timer = 0.0
	_siege_lock_wing = -1
	_cam_time = 0.0
	_cam_pos = Vector3(0, _master_height, -_master_distance)
	_cam_look = Vector3(0, _look_height, 0)
	_cam_fov = _master_fov
	_focus_timer = 0.0
	_known_unit_ids.clear()
	_gift_queue.clear()


## Cinematic push-in toward a world position (major technique, boss moments).
func focus_on(world_pos: Vector3, duration: float = 2.0) -> void:
	if _camera == null:
		_camera = _find_camera()
	if _camera == null:
		return
	_focus_pos = world_pos
	_focus_duration = maxf(duration, 0.1)
	_focus_timer = _focus_duration


## Syncs every visual node with the latest simulation snapshot.
func apply_snapshot(snapshot: Dictionary) -> void:
	# Fortress health.
	var fh: Variant = snapshot.get("fortress_health")
	if typeof(fh) == TYPE_ARRAY and (fh as Array).size() >= 2:
		var health: Array = fh
		var max_hp: float = float(_config.get("fortressHealth", 500))
		if _fortress_a != null and _fortress_a.has_method("update_visual"):
			_fortress_a.call("update_visual", float(health[0]) / maxf(max_hp, 1.0), 0)
		if _fortress_b != null and _fortress_b.has_method("update_visual"):
			_fortress_b.call("update_visual", float(health[1]) / maxf(max_hp, 1.0), 1)
	# Crown.
	if _crown != null and _crown.has_method("update_visual"):
		_crown.call("update_visual", snapshot.get("dominion", [0.0, 0.0]))
	# Capture zone.
	if _capture_zone != null and _capture_zone.has_method("update_visual"):
		_capture_zone.call("update_visual", snapshot.get("capture_pressure", [0.0, 0.0]))
	# Units.
	var active_ids: Dictionary = {}
	var gate_arrivals: Array = [false, false]
	var units: Variant = snapshot.get("units")
	if typeof(units) == TYPE_ARRAY:
		for entry: Variant in (units as Array):
			if typeof(entry) != TYPE_DICTIONARY:
				continue
			var u: Dictionary = entry
			var uid: int = int(u.get("id", -1))
			if uid < 0:
				continue
			active_ids[uid] = true
			if _unit_visuals.has(uid):
				var node: Node = _unit_visuals[uid]
				if node != null and is_instance_valid(node) and node.has_method("update_visual"):
					node.call("update_visual", u)
			else:
				var node: Node = _acquire_unit_visual(u)
				if node != null:
					_unit_visuals[uid] = node
			if not _known_unit_ids.has(uid):
				_known_unit_ids[uid] = true
				var fac: int = int(u.get("faction", -1))
				if fac >= 0 and fac <= 1:
					gate_arrivals[fac] = true
	# Fresh fighters walked out of a castle gate — battle.gd pops the matching
	# picture-in-picture camera for 5 seconds to show the entry.
	for fac in 2:
		if bool(gate_arrivals[fac]):
			arrivals_at_gate.emit(fac)
	# Remove dead/gone unit visuals — they become corpses, not instant removals.
	var to_remove: Array = []
	for uid: int in _unit_visuals.keys():
		if not active_ids.has(uid):
			to_remove.append(uid)
	for uid: int in to_remove:
		_kill_unit_visual(uid)
	# Projectiles.
	var active_proj_ids: Dictionary = {}
	var projs: Variant = snapshot.get("projectiles")
	if typeof(projs) == TYPE_ARRAY:
		for entry: Variant in (projs as Array):
			if typeof(entry) != TYPE_DICTIONARY:
				continue
			var p: Dictionary = entry
			var pid: int = int(p.get("id", -1))
			if pid < 0:
				continue
			active_proj_ids[pid] = true
			if _projectile_visuals.has(pid):
				var node: Node = _projectile_visuals[pid]
				if node != null and is_instance_valid(node) and node.has_method("update_visual"):
					node.call("update_visual", p)
			else:
				var node: Node = _acquire_projectile_visual(p)
				if node != null:
					_projectile_visuals[pid] = node
	var proj_remove: Array = []
	for pid: int in _projectile_visuals.keys():
		if not active_proj_ids.has(pid):
			proj_remove.append(pid)
	for pid: int in proj_remove:
		_release_projectile_visual(pid)
	# Sim events (technique performances, victory).
	var events: Variant = snapshot.get("events")
	if typeof(events) == TYPE_ARRAY:
		for ev: Variant in (events as Array):
			var ev_str: String = str(ev)
			if ev_str.begins_with("technique:"):
				var parts: PackedStringArray = ev_str.split(":")
				if parts.size() >= 3:
					_perform_technique_visuals(int(parts[1]), int(parts[2]))
			elif ev_str.begins_with("siege_started:"):
				# Attackers march on castle <1 - faction>: cut to that wing
				# immediately and lock the camera until the siege ends.
				var parts: PackedStringArray = ev_str.split(":")
				if parts.size() >= 2:
					var sieging_faction: int = int(parts[1])
					# The target is the ENEMY fortress: faction 0 sieges faction 1's fortress (wing 2),
					# faction 1 sieges faction 0's fortress (wing 1).
					var target_wing: int = 2 if sieging_faction == 0 else 1
					_heat[target_wing] = float(_heat[target_wing]) + 6.0
					_force_shot(target_wing)
					_siege_lock_wing = target_wing
			elif ev_str.begins_with("siege_recalled:"):
				# Attackers pulled back to the middle: release the siege lock
				# so the camera can return to center. Let the wing cool fast.
				var parts: PackedStringArray = ev_str.split(":")
				if parts.size() >= 2:
					# Same wing convention as siege_started: the locked wing is the
					# ENEMY fortress of the recalling faction.
					var recalled_faction: int = int(parts[1])
					var target_wing: int = 2 if recalled_faction == 0 else 1
					_heat[target_wing] = maxf(float(_heat[target_wing]) - 4.0, 0.0)
					if _siege_lock_wing == target_wing:
						_siege_lock_wing = -1
			elif ev_str.begins_with("fortress_damaged:"):
				# Castle under attack: show it, no questions asked.
				var parts: PackedStringArray = ev_str.split(":")
				if parts.size() >= 2:
					var wing: int = 1 + int(parts[1])
					_heat[wing] = float(_heat[wing]) + 1.5
					_force_shot(wing)
			elif not _victory_emitted and ev_str.begins_with("victory:"):
				var parts: PackedStringArray = ev_str.split(":")
				if parts.size() >= 3:
					var winner: int = int(parts[1])
					var vtype: String = parts[2]
					_victory_emitted = true
					if vtype == "fortress":
						# Hold the camera on the collapsing castle first; the
						# march/celebration starts once the fall has been shown.
						_siege_lock_wing = -1
						_present_fortress_fall(winner)
					else:
						_perform_victory_celebration(winner)
					round_ended.emit(vtype, winner)


## Gift technique visuals. Tier 1: every living unit of the performing
## faction plays its tier animation, staggered by id order so the squad
## ripples instead of snapping in unison. Tier 2+ hand the presentation to
## the cinematic director (galaxy meteor rain / lion supreme art).
## If a cinematic is already playing, tier 2+ gifts are queued with priority:
## tier 3 (lion) > tier 2 (galaxy). When the current cinematic finishes, the
## highest-priority gift in the queue plays next.
func _perform_technique_visuals(faction: int, tier: int) -> void:
	print("[Cinematic] technique event: faction=%d tier=%d cinematic=%s playing=%s units=%d" % [
		faction, tier,
		"null" if _cinematic == null else "ok",
		str(_cinematic.is_playing()) if _cinematic != null else "-",
		_unit_visuals.size(),
	])
	if tier >= 2 and _cinematic != null:
		# If a cinematic is already playing, queue this gift instead of cutting it.
		if _cinematic.is_playing():
			print("[Cinematic] tier %d gift queued (cinematic playing)" % tier)
			_gift_queue.append({"faction": faction, "tier": tier})
			return
		# No cinematic playing — start this one immediately.
		_cinematic_active = true
		cinematic_started.emit()
		if tier == 2:
			_cinematic.play_galaxy(faction, _unit_visuals)
		else:
			_cinematic.play_lion(faction, _unit_visuals)
		return
	if tier >= 2:
		print("[Cinematic] FALLBACK PATH (no cutscene): cinematic=%s playing=%s" % [
			"null" if _cinematic == null else "ok",
			str(_cinematic.is_playing()) if _cinematic != null else "-",
		])
	var tech_v: Variant = _config.get("technique", {})
	var tech_cfg: Dictionary = tech_v if typeof(tech_v) == TYPE_DICTIONARY else {}
	var stagger: float = float(tech_cfg.get("staggerStepSeconds", 0.08))
	var ids: Array = _unit_visuals.keys()
	ids.sort()
	var tw := create_tween()
	var delay: float = 0.0
	var centroid := Vector3.ZERO
	var count: int = 0
	for uid: int in ids:
		var node: Node = _unit_visuals[uid]
		if node == null or not is_instance_valid(node):
			continue
		if not node.has_method("get_faction_index") or int(node.call("get_faction_index")) != faction:
			continue
		if node is Node3D:
			centroid += (node as Node3D).global_position
			count += 1
		if node.has_method("play_technique"):
			tw.parallel().tween_callback(Callable(node, "call").bind("play_technique", tier)).set_delay(delay)
			delay += stagger
	if count == 0:
		tw.kill()
		return
	centroid /= float(count)
	if tier >= 2:
		shake_camera(0.3 + 0.25 * float(tier), 0.5)
	if tier >= 3:
		focus_on(centroid, float(tech_cfg.get("performDurationSeconds", 1.6)))


## A gift cutscene finished — hand the camera back to the arena director
## (its smoothing eases the shot back to the master framing) and let the
## battle screen resume the sandbox. If there are queued gifts, play the
## highest-priority one next (tier 3 lion > tier 2 galaxy).
func _on_cinematic_finished() -> void:
	_cinematic_active = false
	cinematic_finished.emit()
	# Check the gift queue and play the next highest-priority gift.
	_play_next_queued_gift()


## Plays the next gift from the queue, sorted by priority (tier 3 > tier 2).
## Called when a cinematic finishes and there may be pending gifts.
func _play_next_queued_gift() -> void:
	if _gift_queue.is_empty():
		print("[Cinematic] queue empty, no gifts to play")
		return
	if _cinematic == null:
		print("[Cinematic] ERROR: cinematic is null, cannot play queued gift")
		return
	if _cinematic.is_playing():
		print("[Cinematic] ERROR: cinematic still playing when trying to play queued gift")
		return
	# Sort by tier descending (tier 3 lion first, then tier 2 galaxy).
	_gift_queue.sort_custom(func(a, b): return int(a["tier"]) > int(b["tier"]))
	var next_gift: Dictionary = _gift_queue.pop_front()
	var faction: int = int(next_gift["faction"])
	var tier: int = int(next_gift["tier"])
	print("[Cinematic] playing queued tier %d gift for faction %d (queue size: %d)" % [tier, faction, _gift_queue.size()])
	# Play the gift directly (bypass the queue check since we know no cinematic is playing).
	_cinematic_active = true
	cinematic_started.emit()
	if tier == 2:
		_cinematic.play_galaxy(faction, _unit_visuals)
	else:
		_cinematic.play_lion(faction, _unit_visuals)
	# Verify the cinematic actually started.
	if not _cinematic.is_playing():
		print("[Cinematic] ERROR: cinematic failed to start after play_galaxy/play_lion call")


## Fortress victory beat: hard-cut to the loser's gate, run the collapse
## (tilt + sink + char + explosion + rubble + smoke), shake the camera and
## push in on the ruins. Only after FALL_PRESENT_SECONDS does the winners'
## march/celebration begin, so the destruction is actually witnessed.
func _present_fortress_fall(winner: int) -> void:
	var loser: int = 1 - winner
	var fort: Node = _fortress_a if loser == 0 else _fortress_b
	if fort != null and fort.has_method("play_destruction"):
		fort.call("play_destruction")
	# Lock the director on the falling castle (wing 1 = left/A, 2 = right/B).
	_shot_lock_timer = FALL_PRESENT_SECONDS
	_force_shot(1 + loser)
	shake_camera(0.6, 1.4)
	if fort != null and is_instance_valid(fort):
		focus_on(fort.global_position + Vector3(0.0, 3.0, 0.0), FALL_PRESENT_SECONDS)
	# Hand over to the march/celebration once the collapse has been shown.
	var tw := create_tween()
	tw.tween_interval(FALL_PRESENT_SECONDS)
	tw.tween_callback(_perform_victory_celebration.bind(winner))


## Victory presentation: the surviving winners march back to the arena center
## (visual-side tween — the simulation is already frozen), take up a ring of
## slots around the crown, then ripple into their celebration clips while the
## camera returns to the master arena framing and pushes in on the party.
func _perform_victory_celebration(winner: int) -> void:
	var cel_v: Variant = _config.get("celebration", {})
	var cel_cfg: Dictionary = cel_v if typeof(cel_v) == TYPE_DICTIONARY else {}
	var stagger: float = float(cel_cfg.get("staggerStepSeconds", 0.06))
	var duration: float = float(cel_cfg.get("durationSeconds", 2.8))
	var march_speed: float = float(cel_cfg.get("returnMarchSpeed", 2.6))
	# Camera back to the arena — the celebration happens in the middle.
	_heat = [0.0, 0.0, 0.0]
	_force_shot(0)
	var ids: Array = _unit_visuals.keys()
	ids.sort()
	var winners: Array = []  # [{"uid": int, "node": Node}]
	for uid: int in ids:
		var node: Node = _unit_visuals[uid]
		if node == null or not is_instance_valid(node):
			continue
		if not node.has_method("get_faction_index") or int(node.call("get_faction_index")) != winner:
			continue
		# Fallen units stay down — only living winners march and celebrate.
		if node.has_method("is_dead") and bool(node.call("is_dead")):
			continue
		winners.append({"uid": uid, "node": node})
	if winners.is_empty():
		return
	# Phase 1 — return march: tween every winner to a slot on a ring around
	# the crown, playing the run clip with a fixed calibrated pace.
	var tw := create_tween()
	var march_time: float = 0.0
	var count: int = winners.size()
	for i in count:
		var entry: Dictionary = winners[i]
		var node3: Node3D = entry["node"]
		var angle: float = float(i) * TAU / float(count)
		var radius: float = 2.4 + float(i % 3) * 1.3
		var target := Vector3(cos(angle) * radius, GROUND_Y, sin(angle) * radius)
		if node3.has_method("face_toward"):
			node3.call("face_toward", target)
		if node3.has_method("play_return_march"):
			node3.call("play_return_march")
		var dist: float = node3.position.distance_to(target)
		var t: float = clampf(dist / maxf(march_speed, 0.1), 0.6, 2.4)
		march_time = maxf(march_time, t)
		tw.parallel().tween_property(node3, "position", target, t).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	# Phase 2 — celebration ripples in once the march arrives.
	var delay: float = march_time
	for i in count:
		var entry: Dictionary = winners[i]
		var node: Node = entry["node"]
		if node.has_method("play_celebration"):
			tw.parallel().tween_callback(Callable(node, "call").bind("play_celebration", int(entry["uid"]))).set_delay(delay)
			delay += stagger
	if bool(cel_cfg.get("cameraPushIn", true)):
		focus_on(Vector3(0.0, 1.5, 0.0), march_time + duration)


## Removes all visual nodes and clears registries.
func clear_round() -> void:
	_clear_all()
	_victory_emitted = false
	_reset_director_state()


## Public restart.
func restart(config: Dictionary = _config, faction_a: Dictionary = _faction_a, faction_b: Dictionary = _faction_b) -> void:
	clear_round()
	setup(config, faction_a, faction_b)


# --- Private helpers ---

func _acquire_unit_visual(unit_snap: Dictionary) -> Node:
	var utype: String = str(unit_snap.get("type", "champion"))
	var scene_path: String = UNIT_SCENE_PATHS.get(utype, "res://scenes/units/3d/Champion3D.tscn")
	var packed: PackedScene = load(scene_path) as PackedScene
	if packed == null:
		return null
	var node: Node = packed.instantiate()
	_unit_container.add_child(node)
	# Tell the unit how big the center arena is (for its flying-engine rides).
	if node.has_method("set_center_radius"):
		var arena_v: Variant = _config.get("arena", {})
		var arena_cfg: Dictionary = arena_v if typeof(arena_v) == TYPE_DICTIONARY else {}
		node.call("set_center_radius", float(arena_cfg.get("captureZoneRadius", 170.0)))
	if node.has_method("update_visual"):
		node.call("update_visual", unit_snap)
	return node


func _acquire_projectile_visual(proj_snap: Dictionary) -> Node:
	var packed: PackedScene = load(PROJECTILE_SCENE_PATH) as PackedScene
	if packed == null:
		return null
	var node: Node = packed.instantiate()
	_projectile_container.add_child(node)
	if node.has_method("update_visual"):
		node.call("update_visual", proj_snap)
	return node


func _release_unit_visual(uid: int) -> void:
	if not _unit_visuals.has(uid):
		return
	var node: Node = _unit_visuals[uid]
	_unit_visuals.erase(uid)
	if node != null and is_instance_valid(node):
		node.queue_free()


## A unit left the simulation snapshot (it died). Keep its visual around as a
## corpse: play the death animation, let it lie down, and schedule a sweep after
## CORPSE_TTL_SECONDS rather than vanishing the instant it falls.
func _kill_unit_visual(uid: int) -> void:
	if not _unit_visuals.has(uid):
		return
	var node: Node = _unit_visuals[uid]
	_unit_visuals.erase(uid)
	if node == null or not is_instance_valid(node):
		return
	if node.has_method("die"):
		node.call("die")
	_corpses[uid] = {"node": node, "died_usec": Time.get_ticks_usec()}


## Frees corpses that have lain longer than CORPSE_TTL_SECONDS.
func _sweep_corpses() -> void:
	if _corpses.is_empty():
		return
	var now_usec: int = Time.get_ticks_usec()
	var ttl_usec: int = int(CORPSE_TTL_SECONDS * 1000000.0)
	var expired: Array = []
	for uid: int in _corpses.keys():
		var corpse: Dictionary = _corpses[uid]
		var node: Node = corpse["node"]
		var stale: bool = (now_usec - int(corpse["died_usec"])) >= ttl_usec
		if node == null or not is_instance_valid(node) or stale:
			expired.append(uid)
	for uid: int in expired:
		var corpse: Dictionary = _corpses[uid]
		var node: Node = corpse["node"]
		if node != null and is_instance_valid(node):
			node.queue_free()
		_corpses.erase(uid)


func _release_projectile_visual(pid: int) -> void:
	if not _projectile_visuals.has(pid):
		return
	var node: Node = _projectile_visuals[pid]
	_projectile_visuals.erase(pid)
	if node != null and is_instance_valid(node):
		node.queue_free()


func _clear_all() -> void:
	if _bridges != null and is_instance_valid(_bridges):
		_bridges.queue_free()
		_bridges = null
	if _fortress_a != null and is_instance_valid(_fortress_a):
		_fortress_a.queue_free()
		_fortress_a = null
	if _fortress_b != null and is_instance_valid(_fortress_b):
		_fortress_b.queue_free()
		_fortress_b = null
	if _crown != null and is_instance_valid(_crown):
		_crown.queue_free()
		_crown = null
	if _capture_zone != null and is_instance_valid(_capture_zone):
		_capture_zone.queue_free()
		_capture_zone = null
	if _arena_ground != null and is_instance_valid(_arena_ground):
		_arena_ground.queue_free()
		_arena_ground = null
	if _unit_container != null and is_instance_valid(_unit_container):
		_unit_container.queue_free()
		_unit_container = null
	if _projectile_container != null and is_instance_valid(_projectile_container):
		_projectile_container.queue_free()
		_projectile_container = null
	_unit_visuals.clear()
	_projectile_visuals.clear()
	_corpses.clear()


func get_visual_unit_count() -> int:
	return _unit_visuals.size()


## Builds one futuristic bridge per side from the fortress gate to the capture
## zone rim using the Blender-authored v2 set piece (same hull/cyan/amber
## language as the capture zone). Deck tops sit just above the ground plane so
## walking units stay on the walkway; width matches the sim bridge corridor
## (BRIDGE_HALF_SIM 90). Falls back to plain boxes if the GLB is missing.
func _build_bridges() -> void:
	_bridges = Node3D.new()
	_bridges.name = "Bridges"
	add_child(_bridges)
	var arena_cfg: Dictionary = _config.get("arena", {}) if _config is Dictionary else {}
	var radius: float = float(arena_cfg.get("captureZoneRadius", 170.0))
	# Sim -> world x: 1080 sim units span 54 world meters.
	var zone_x: float = radius * (54.0 / 1080.0)
	var x0: float = zone_x - 1.0  # overlap the zone rim slightly
	var x1: float = 20.2  # reach the fortress at x = 21
	var bridge_packed: PackedScene = load(BRIDGE_GLB_PATH) as PackedScene
	for side in [-1.0, 1.0]:
		var holder := Node3D.new()
		holder.name = "Bridge%s" % ("A" if side < 0.0 else "B")
		_bridges.add_child(holder)
		if bridge_packed != null:
			var model: Node3D = bridge_packed.instantiate()
			# Stretch to span zone rim -> gate; rotate 180° on the left side so
			# the gate pylons always sit at the fortress end.
			model.scale = Vector3((x1 - x0) / BRIDGE_AUTHORED_LENGTH, 1.0, 1.0)
			if side < 0.0:
				model.rotation.y = PI
				model.position = Vector3(-x0, GROUND_Y, 0.0)
			else:
				model.position = Vector3(x0, GROUND_Y, 0.0)
			holder.add_child(model)
		else:
			_build_box_bridge(holder, side, x0, x1)


## Primitive fallback walkway if the v2 GLB fails to load.
func _build_box_bridge(holder: Node3D, side: float, x0: float, x1: float) -> void:
	var length: float = x1 - x0
	var cx: float = side * (x0 + x1) * 0.5
	var deck_mat := StandardMaterial3D.new()
	deck_mat.albedo_color = Color(0.42, 0.4, 0.37)
	deck_mat.roughness = 0.95
	deck_mat.metallic = 0.0
	var curb_mat := StandardMaterial3D.new()
	curb_mat.albedo_color = Color(0.3, 0.28, 0.26)
	curb_mat.roughness = 0.95
	curb_mat.metallic = 0.0
	# Deck: top surface just above GROUND_Y so feet stay on the walkway.
	var deck := MeshInstance3D.new()
	var deck_mesh := BoxMesh.new()
	deck_mesh.size = Vector3(length, 0.24, 6.1)
	deck.mesh = deck_mesh
	deck.material_override = deck_mat
	deck.position = Vector3(cx, GROUND_Y - 0.09, 0.0)
	holder.add_child(deck)
	# Curbs on both edges keep the corridor visually bounded.
	for z_edge in [-2.96, 2.96]:
		var curb := MeshInstance3D.new()
		var curb_mesh := BoxMesh.new()
		curb_mesh.size = Vector3(length, 0.42, 0.18)
		curb.mesh = curb_mesh
		curb.material_override = curb_mat
		curb.position = Vector3(cx, GROUND_Y + 0.12, z_edge)
		holder.add_child(curb)
	# Gate posts at the fortress end of the bridge.
	for z_edge in [-2.9, 2.9]:
		var post := MeshInstance3D.new()
		var post_mesh := BoxMesh.new()
		post_mesh.size = Vector3(0.5, 1.6, 0.5)
		post.mesh = post_mesh
		post.material_override = curb_mat
		post.position = Vector3(side * (x1 - 0.3), GROUND_Y + 0.8, z_edge)
		holder.add_child(post)


func get_visual_projectile_count() -> int:
	return _projectile_visuals.size()
