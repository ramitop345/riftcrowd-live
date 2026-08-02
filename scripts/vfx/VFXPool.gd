## VFXPool (Phase 15) — Godot-side object pool for GPUParticles2D instances.
##
## Pooled VFX nodes: particles, flashes, trails, overlays.
## Per-type limits from gateway config (loaded via HTTP on startup).
## LRU eviction when pool full.
## Connects to CommandDispatcher signals (spawn_vfx, spotlight_card, etc.).
class_name VFXPool
extends Node

## Emitted when a VFX node is acquired from the pool.
signal vfx_acquired(node: Node, vfx_type: String)

## Emitted when a VFX node is released back to the pool.
signal vfx_released(node: Node)

## Emitted when the quality tier changes (Tier 4).
signal quality_tier_changed(new_tier: String)

## Per-type limits (loaded from gateway /vfx/config on startup).
@export var max_particles: int = 100
@export var max_flashes: int = 20
@export var max_trails: int = 50
@export var max_overlays: int = 30

## Current quality tier (Tier 4). Default is "high".
var quality_tier: String = "high"

## Preloaded VFX scene templates.
@export var particle_scene: PackedScene
@export var flash_scene: PackedScene
@export var trail_scene: PackedScene
@export var overlay_scene: PackedScene

## Pool state.
var _pool: Dictionary = {}   ## type -> Array[Node]
var _active: Dictionary = {} ## type -> int
var _dropped: int = 0
var _last_used: Dictionary = {} ## Node -> int (msec timestamp for LRU eviction)

## Stats for observability.
var stats: Dictionary = {
	"active": 0,
	"idle": 0,
	"dropped": 0,
}


func _ready() -> void:
	# Preload VFX scene templates so pool nodes have proper visuals.
	if particle_scene == null and ResourceLoader.exists("res://scenes/vfx/ParticleBurst.tscn"):
		particle_scene = load("res://scenes/vfx/ParticleBurst.tscn") as PackedScene
	if flash_scene == null and ResourceLoader.exists("res://scenes/vfx/HitFlash.tscn"):
		flash_scene = load("res://scenes/vfx/HitFlash.tscn") as PackedScene
	if trail_scene == null and ResourceLoader.exists("res://scenes/vfx/Trail.tscn"):
		trail_scene = load("res://scenes/vfx/Trail.tscn") as PackedScene
	if overlay_scene == null and ResourceLoader.exists("res://scenes/vfx/FactionOverlay.tscn"):
		overlay_scene = load("res://scenes/vfx/FactionOverlay.tscn") as PackedScene
	_init_pool("particle", max_particles)
	_init_pool("flash", max_flashes)
	_init_pool("trail", max_trails)
	_init_pool("overlay", max_overlays)
	_update_stats()


## Pre-allocate pool nodes for a given type.
func _init_pool(vfx_type: String, count: int) -> void:
	_pool[vfx_type] = []
	_active[vfx_type] = 0
	for i in range(count):
		var node: Node = _create_node(vfx_type)
		if node:
			node.visible = false if node is CanvasItem else false
			add_child(node)
			_pool[vfx_type].append(node)


## Create a node for the given VFX type from preloaded scenes.
func _create_node(vfx_type: String) -> Node:
	match vfx_type:
		"particle":
			if particle_scene:
				return particle_scene.instantiate()
			return GPUParticles2D.new()
		"flash":
			if flash_scene:
				return flash_scene.instantiate()
			return ColorRect.new()
		"trail":
			if trail_scene:
				return trail_scene.instantiate()
			return Line2D.new()
		"overlay":
			if overlay_scene:
				return overlay_scene.instantiate()
			return TextureRect.new()
	return null


## Acquire a VFX node from the pool. Returns null if exhausted.
func acquire(vfx_type: String, params: Dictionary) -> Node:
	var pool_arr: Array = _pool.get(vfx_type, [])
	var active_count: int = _active.get(vfx_type, 0)
	var max_count: int = _get_max(vfx_type)

	if active_count >= max_count:
		# Try LRU eviction before giving up
		var evicted: Node = evict_lru(vfx_type)
		if evicted != null:
			if evicted is CanvasItem:
				evicted.visible = true
			else:
				evicted.set_meta("active", true)
			_apply_params(evicted, params)
			_active[vfx_type] = active_count + 1
			_last_used[evicted] = Time.get_ticks_msec()
			_update_stats()
			vfx_acquired.emit(evicted, vfx_type)
			return evicted
		_dropped += 1
		_update_stats()
		return null

	# Find first idle node
	for node in pool_arr:
		if node is CanvasItem and not node.visible:
			node.visible = true
			_apply_params(node, params)
			_active[vfx_type] = active_count + 1
			_last_used[node] = Time.get_ticks_msec()
			_update_stats()
			vfx_acquired.emit(node, vfx_type)
			return node
		elif not (node is CanvasItem):
			# Non-CanvasItem nodes: use metadata for active tracking
			if not node.get_meta("active", false):
				node.set_meta("active", true)
				_apply_params(node, params)
				_active[vfx_type] = active_count + 1
				_last_used[node] = Time.get_ticks_msec()
				_update_stats()
				vfx_acquired.emit(node, vfx_type)
				return node

	_dropped += 1
	_update_stats()
	return null


## Release a VFX node back to the pool.
func release(node: Node) -> void:
	for vfx_type in _pool:
		var pool_arr: Array = _pool[vfx_type]
		if node in pool_arr:
			if node is CanvasItem:
				node.visible = false
			else:
				node.set_meta("active", false)
			_active[vfx_type] = max(0, _active[vfx_type] - 1)
			_last_used[node] = Time.get_ticks_msec()
			_update_stats()
			vfx_released.emit(node)
			return


## Evict the oldest idle node (LRU) of the given type.
## Tracks last_used timestamps to find the true least-recently-used idle node.
func evict_lru(vfx_type: String) -> Node:
	var pool_arr: Array = _pool.get(vfx_type, [])
	var oldest_node: Node = null
	var oldest_time: int = 9223372036854775807  # max int sentinel
	for node in pool_arr:
		var is_idle: bool = false
		if node is CanvasItem:
			is_idle = not node.visible
		else:
			is_idle = not node.get_meta("active", false)
		if is_idle:
			var ts: int = _last_used.get(node, 0)
			if ts < oldest_time:
				oldest_time = ts
				oldest_node = node
	return oldest_node


## Get the max for a given VFX type.
func _get_max(vfx_type: String) -> int:
	match vfx_type:
		"particle":
			return max_particles
		"flash":
			return max_flashes
		"trail":
			return max_trails
		"overlay":
			return max_overlays
	return 0


## Auto-release expired VFX nodes each frame.
func _process(_delta: float) -> void:
	var now: int = Time.get_ticks_msec()
	var to_release: Array = []
	for node in _last_used:
		var dur_ms: int = int(node.get_meta("duration", 0.0) * 1000.0)
		if dur_ms > 0 and now - _last_used[node] >= dur_ms:
			to_release.append(node)
	for node in to_release:
		release(node)


## Apply params dictionary to a node.
func _apply_params(node: Node, params: Dictionary) -> void:
	if params.has("x") and params.has("y") and node is CanvasItem:
		(node as CanvasItem).position = Vector2(
			float(params["x"]),
			float(params["y"])
		)
	if params.has("color") and node is ColorRect:
		(node as ColorRect).color = Color(str(params["color"]))
	if params.has("duration"):
		node.set_meta("duration", float(params["duration"]))
	# Restart GPUParticles2D so they actually emit when re-acquired.
	if node is GPUParticles2D:
		(node as GPUParticles2D).restart()
	# Play AnimationPlayer if present (e.g. HitFlash).
	var anim_player: AnimationPlayer = node.get_node_or_null("AnimationPlayer")
	if anim_player != null and anim_player.has_animation("flash"):
		anim_player.play("flash")


## Update stats dictionary.
func _update_stats() -> void:
	var total_active: int = 0
	var total_idle: int = 0
	for vfx_type in _active:
		total_active += _active[vfx_type]
		total_idle += _pool[vfx_type].size() - _active[vfx_type]
	stats["active"] = total_active
	stats["idle"] = total_idle
	stats["dropped"] = _dropped


## Load config from gateway HTTP endpoint.
func load_config_from_gateway(url: String = "http://127.0.0.1:8787/vfx/config") -> void:
	var http := HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(func(result: int, code: int, headers: PackedStringArray, body: PackedByteArray) -> void:
		if result == HTTPRequest.RESULT_SUCCESS and code == 200:
			var json := JSON.new()
			var err := json.parse(body.get_string_from_utf8())
			if err == OK:
				var data: Dictionary = json.data
				if data.has("pool"):
					var pool_cfg: Dictionary = data["pool"]
					max_particles = int(pool_cfg.get("maxParticles", 100))
					max_flashes = int(pool_cfg.get("maxFlashes", 20))
					max_trails = int(pool_cfg.get("maxTrails", 50))
					max_overlays = int(pool_cfg.get("maxOverlays", 30))
		http.queue_free()
	)
	http.request(url)


## ===========================================================================
## Tier 4 — Quality tier management
## ===========================================================================

## Per-tier pool limits: ultra 1.5x, high 1.0x, medium 0.5x, low 0.25x.
const TIER_LIMITS: Dictionary = {
	"ultra": {"particles": 150, "flashes": 30, "trails": 75, "overlays": 45},
	"high": {"particles": 100, "flashes": 20, "trails": 50, "overlays": 30},
	"medium": {"particles": 50, "flashes": 10, "trails": 25, "overlays": 15},
	"low": {"particles": 25, "flashes": 5, "trails": 12, "overlays": 7},
}


## Set the quality tier and scale pool limits accordingly.
## When downgrading, release excess idle nodes (queue_free).
## When upgrading, lazily re-instantiate on demand.
func set_quality_tier(tier: String) -> void:
	if tier == quality_tier:
		return
	if not TIER_LIMITS.has(tier):
		push_warning("VFXPool: unknown quality tier '%s'" % tier)
		return

	var old_tier: String = quality_tier
	quality_tier = tier

	var limits: Dictionary = TIER_LIMITS[tier]
	max_particles = int(limits["particles"])
	max_flashes = int(limits["flashes"])
	max_trails = int(limits["trails"])
	max_overlays = int(limits["overlays"])

	# When downgrading, release excess idle nodes
	var old_limits: Dictionary = TIER_LIMITS[old_tier]
	var tier_index_new: int = _tier_rank(tier)
	var tier_index_old: int = _tier_rank(old_tier)
	if tier_index_new < tier_index_old:
		_trim_excess_idle("particle", max_particles)
		_trim_excess_idle("flash", max_flashes)
		_trim_excess_idle("trail", max_trails)
		_trim_excess_idle("overlay", max_overlays)

	_update_stats()
	quality_tier_changed.emit(tier)


## Get the rank of a tier (higher = better quality).
func _tier_rank(tier: String) -> int:
	match tier:
		"low":
			return 0
		"medium":
			return 1
		"high":
			return 2
		"ultra":
			return 3
	return 2


## Trim idle nodes of a given type if total exceeds new cap.
func _trim_excess_idle(vfx_type: String, cap: int) -> void:
	var pool_arr: Array = _pool.get(vfx_type, [])
	var to_remove: Array = []
	var total: int = pool_arr.size()
	if total <= cap:
		return
	# Find idle nodes to remove (oldest first via LRU timestamp)
	var idle_nodes: Array = []
	for node in pool_arr:
		var is_idle: bool = false
		if node is CanvasItem:
			is_idle = not node.visible
		else:
			is_idle = not node.get_meta("active", false)
		if is_idle:
			idle_nodes.append(node)
	# Sort by last_used timestamp (oldest first)
	idle_nodes.sort_custom(func(a: Node, b: Node) -> bool:
		return _last_used.get(a, 0) < _last_used.get(b, 0)
	)
	var excess: int = total - cap
	for i in range(mini(excess, idle_nodes.size())):
		var node: Node = idle_nodes[i]
		pool_arr.erase(node)
		_last_used.erase(node)
		node.queue_free()
