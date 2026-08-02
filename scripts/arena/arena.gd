## Arena visual manager. Hosts fortress/crown/capture-zone instances and manages
## pooled unit and projectile visual nodes, syncing them each frame from the
## simulation snapshot produced by SimulationSandbox.
extends Node2D

const UNIT_SCENE_PATHS: Dictionary = {
	"champion": "res://scenes/units/Champion.tscn",
	"guardian": "res://scenes/units/Guardian.tscn",
	"striker": "res://scenes/units/Striker.tscn",
	"captain": "res://scenes/units/Captain.tscn",
	"boss": "res://scenes/units/Boss.tscn",
}
const PROJECTILE_SCENE_PATH: String = "res://scenes/units/Projectile.tscn"
const FORTRESS_SCENE_PATH: String = "res://scenes/units/Fortress.tscn"
const CROWN_SCENE_PATH: String = "res://scenes/units/Crown.tscn"
const CAPTURE_ZONE_SCENE_PATH: String = "res://scenes/units/CaptureZone.tscn"
const DEAD_FADE_DURATION: float = 0.3

signal round_ended(victory_type: String, winner: int)

## Visual registries keyed by simulation id.
var _unit_visuals: Dictionary = {}
var _projectile_visuals: Dictionary = {}

## Node references for static elements.
var _fortress_a: Node = null
var _fortress_b: Node = null
var _crown: Node = null
var _capture_zone: Node = null

## Child containers for dynamic nodes.
var _unit_container: Node2D
var _projectile_container: Node2D

var _config: Dictionary = {}
var _faction_a: Dictionary = {}
var _faction_b: Dictionary = {}
var _victory_emitted: bool = false


## Instantiates fortress/crown/capture-zone nodes with correct positions.
func setup(config: Dictionary, faction_a: Dictionary, faction_b: Dictionary) -> void:
	_config = config
	_faction_a = faction_a
	_faction_b = faction_b
	_victory_emitted = false
	_clear_all()
	# Capture zone first (renders behind everything).
	var cz_packed: PackedScene = load(CAPTURE_ZONE_SCENE_PATH) as PackedScene
	_capture_zone = cz_packed.instantiate()
	add_child(_capture_zone)
	_capture_zone.position = Vector2(540, 590)
	# Crown.
	var crown_packed: PackedScene = load(CROWN_SCENE_PATH) as PackedScene
	_crown = crown_packed.instantiate()
	add_child(_crown)
	_crown.position = Vector2(540, 590)
	# Fortresses.
	var fort_packed: PackedScene = load(FORTRESS_SCENE_PATH) as PackedScene
	_fortress_a = fort_packed.instantiate()
	add_child(_fortress_a)
	_fortress_a.position = Vector2(120, 590)
	if _fortress_a.has_method("update_visual"):
		_fortress_a.call("update_visual", 1.0, 0)
	_fortress_b = fort_packed.instantiate()
	add_child(_fortress_b)
	_fortress_b.position = Vector2(960, 590)
	if _fortress_b.has_method("update_visual"):
		_fortress_b.call("update_visual", 1.0, 1)
	# Dynamic containers.
	_unit_container = Node2D.new()
	_unit_container.name = "UnitContainer"
	add_child(_unit_container)
	_projectile_container = Node2D.new()
	_projectile_container.name = "ProjectileContainer"
	add_child(_projectile_container)


## Removes all visual nodes and clears registries.
func clear_round() -> void:
	_clear_all()
	_victory_emitted = false


## Public restart: clears the current round and re-initialises with the given
## (or previously stored) config and factions. Encapsulates clear+setup so that
## callers (e.g. BattlePresenter) don't need to reach into private fields.
func restart(config: Dictionary = _config, faction_a: Dictionary = _faction_a, faction_b: Dictionary = _faction_b) -> void:
	clear_round()
	setup(config, faction_a, faction_b)


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


# --- Private helpers ---

func _acquire_unit_visual(unit_snap: Dictionary) -> Node:
	var utype: String = str(unit_snap.get("type", "champion"))
	var scene_path: String = UNIT_SCENE_PATHS.get(utype, "res://scenes/units/Champion.tscn")
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
		_fade_and_free(node)


func _release_projectile_visual(pid: int) -> void:
	if not _projectile_visuals.has(pid):
		return
	var node: Node = _projectile_visuals[pid]
	_projectile_visuals.erase(pid)
	if node != null and is_instance_valid(node):
		node.queue_free()


func _fade_and_free(node: Node) -> void:
	if node is CanvasItem:
		var tw: Tween = create_tween()
		tw.tween_property(node, "modulate:a", 0.0, DEAD_FADE_DURATION)
		tw.tween_callback(node.queue_free)
	else:
		node.queue_free()


func _clear_all() -> void:
	# Free static elements first.
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
	# Free containers — this also frees all their children (unit/projectile visuals).
	if _unit_container != null and is_instance_valid(_unit_container):
		_unit_container.queue_free()
		_unit_container = null
	if _projectile_container != null and is_instance_valid(_projectile_container):
		_projectile_container.queue_free()
		_projectile_container = null
	# Clear registries without re-freeing (children already freed with containers).
	_unit_visuals.clear()
	_projectile_visuals.clear()


## Returns the count of active visual nodes (for testing/debugging).
func get_visual_unit_count() -> int:
	return _unit_visuals.size()


func get_visual_projectile_count() -> int:
	return _projectile_visuals.size()
