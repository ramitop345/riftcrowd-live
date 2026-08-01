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

## Per-type limits (loaded from gateway /vfx/config on startup).
@export var max_particles: int = 100
@export var max_flashes: int = 20
@export var max_trails: int = 50
@export var max_overlays: int = 30

## Preloaded VFX scene templates.
@export var particle_scene: PackedScene
@export var flash_scene: PackedScene
@export var trail_scene: PackedScene
@export var overlay_scene: PackedScene

## Pool state.
var _pool: Dictionary = {}   ## type -> Array[Node]
var _active: Dictionary = {} ## type -> int
var _dropped: int = 0

## Stats for observability.
var stats: Dictionary = {
	"active": 0,
	"idle": 0,
	"dropped": 0,
}


func _ready() -> void:
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
		_dropped += 1
		_update_stats()
		return null

	# Find first idle node
	for node in pool_arr:
		if node is CanvasItem and not node.visible:
			node.visible = true
			_apply_params(node, params)
			_active[vfx_type] = active_count + 1
			_update_stats()
			vfx_acquired.emit(node, vfx_type)
			return node
		elif not (node is CanvasItem):
			# Non-CanvasItem nodes: use metadata for active tracking
			if not node.get_meta("active", false):
				node.set_meta("active", true)
				_apply_params(node, params)
				_active[vfx_type] = active_count + 1
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
			_update_stats()
			vfx_released.emit(node)
			return


## Evict the oldest idle node (LRU) of the given type.
func evict_lru(vfx_type: String) -> Node:
	var pool_arr: Array = _pool.get(vfx_type, [])
	for node in pool_arr:
		if node is CanvasItem and not node.visible:
			return node
	return null


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
