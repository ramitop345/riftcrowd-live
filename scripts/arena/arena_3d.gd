## Arena 3D visual manager — hosts fortress/crown/capture-zone instances and manages
## pooled unit and projectile visual nodes, syncing each frame from the simulation
## snapshot. Same public interface as arena.gd: setup(), apply_snapshot(), clear_round().
extends Node3D

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
const ARENA_GLB_PATH: String = "res://assets/models/environment/RC_Arena_Master.glb"
const GROUND_Y: float = 1.0  # objects sit on the flat arena ground

signal round_ended(victory_type: String, winner: int)

## Visual registries keyed by simulation id.
var _unit_visuals: Dictionary = {}
var _projectile_visuals: Dictionary = {}

## Child references for static elements.
var _fortress_a: Node = null
var _fortress_b: Node = null
var _crown: Node = null
var _capture_zone: Node = null
var _arena_ground: Node3D = null

## Dynamic containers.
var _unit_container: Node3D
var _projectile_container: Node3D

## Camera reference for shake.
var _camera: Camera3D = null
var _camera_base_pos: Vector3 = Vector3.ZERO
var _shake_intensity: float = 0.0
var _shake_duration: float = 0.0
var _shake_timer: float = 0.0

var _config: Dictionary = {}
var _faction_a: Dictionary = {}
var _faction_b: Dictionary = {}
var _victory_emitted: bool = false


func _ready() -> void:
	# Ensure the environment has a sky (in case .tscn cache is stale).
	var we: WorldEnvironment = null
	for child in get_children():
		if child is WorldEnvironment:
			we = child
			break
	if we != null and we.environment != null:
		var env: Environment = we.environment
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
	# Cache camera reference.
	_camera = _find_camera()
	if _camera != null:
		_camera_base_pos = _camera.position
		_frame_battle_camera()


## Instantiates fortress/crown/capture-zone nodes with correct 3D positions.
func setup(config: Dictionary, faction_a: Dictionary, faction_b: Dictionary) -> void:
	_config = config
	_faction_a = faction_a
	_faction_b = faction_b
	_victory_emitted = false
	_clear_all()
	# Arena ground mesh
	var arena_packed: PackedScene = load(ARENA_GLB_PATH) as PackedScene
	if arena_packed != null:
		_arena_ground = arena_packed.instantiate()
		_arena_ground.name = "ArenaGround"
		add_child(_arena_ground)
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
	# Fortresses at x = ±20m.
	var fort_packed: PackedScene = load(FORTRESS_SCENE_PATH) as PackedScene
	if fort_packed != null:
		_fortress_a = fort_packed.instantiate()
		add_child(_fortress_a)
		_fortress_a.position = Vector3(-20, GROUND_Y, 0)
		if _fortress_a.has_method("update_visual"):
			_fortress_a.call("update_visual", 1.0, 0)
		_fortress_b = fort_packed.instantiate()
		add_child(_fortress_b)
		_fortress_b.position = Vector3(20, GROUND_Y, 0)
		if _fortress_b.has_method("update_visual"):
			_fortress_b.call("update_visual", 1.0, 1)
	# Dynamic containers.
	_unit_container = Node3D.new()
	_unit_container.name = "UnitContainer"
	add_child(_unit_container)
	_projectile_container = Node3D.new()
	_projectile_container.name = "ProjectileContainer"
	add_child(_projectile_container)


func _process(delta: float) -> void:
	# Camera shake.
	if _shake_timer > 0.0:
		_shake_timer -= delta
		var t: float = _shake_timer / maxf(_shake_duration, 0.01)
		if _camera != null:
			_camera.position = _camera_base_pos + Vector3(
				randf_range(-1.0, 1.0) * _shake_intensity * t,
				randf_range(-1.0, 1.0) * _shake_intensity * t * 0.5,
				randf_range(-1.0, 1.0) * _shake_intensity * t
			)
	elif _camera != null and _camera.position != _camera_base_pos:
		_camera.position = _camera_base_pos


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


## Positions the camera for a low, side-on battle view. The camera sits on the
## field behind the near rock line and looks across the battle line (z ~ 0),
## so players see the units' bodies fighting rather than a flat top-down map.
func _frame_battle_camera() -> void:
	if _camera == null:
		return
	_camera.position = Vector3(0, 24, -28)
	_camera.look_at(Vector3(0, 1, 0), Vector3.UP)
	_camera.fov = 75.0
	# Keep the shake-rest position in sync with the framed battle view.
	_camera_base_pos = _camera.position


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
	# Remove dead/gone unit visuals.
	var to_remove: Array = []
	for uid: int in _unit_visuals.keys():
		if not active_ids.has(uid):
			to_remove.append(uid)
	for uid: int in to_remove:
		_release_unit_visual(uid)
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
	# Victory event.
	if not _victory_emitted:
		var events: Variant = snapshot.get("events")
		if typeof(events) == TYPE_ARRAY:
			for ev: Variant in (events as Array):
				var ev_str: String = str(ev)
				if ev_str.begins_with("victory:"):
					var parts: PackedStringArray = ev_str.split(":")
					if parts.size() >= 3:
						var winner: int = int(parts[1])
						var vtype: String = parts[2]
						_victory_emitted = true
						round_ended.emit(vtype, winner)


## Removes all visual nodes and clears registries.
func clear_round() -> void:
	_clear_all()
	_victory_emitted = false


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


func _release_projectile_visual(pid: int) -> void:
	if not _projectile_visuals.has(pid):
		return
	var node: Node = _projectile_visuals[pid]
	_projectile_visuals.erase(pid)
	if node != null and is_instance_valid(node):
		node.queue_free()


func _clear_all() -> void:
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


func get_visual_unit_count() -> int:
	return _unit_visuals.size()


func get_visual_projectile_count() -> int:
	return _projectile_visuals.size()
