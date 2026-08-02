## Simulation sandbox — wraps a SimWorld with time-based advancement and
## playback-speed controls. The sandbox is a RefCounted (not a Node) so it
## can be used from any context: the battle presenter, headless tests, or
## a future replay tool.
class_name SimulationSandbox
extends RefCounted

## Allowed playback speed values. 0.0 == paused.
const SPEED_VALUES: Array = [0.0, 0.5, 1.0, 2.0, 4.0]

var world: SimWorld = null
var playback_speed: float = 1.0
var paused: bool = false
var accumulator: float = 0.0
## Per-frame tick budget. Default 500 covers worst-case: 60 fps × 4× speed ×
## 20 Hz tick-rate = 4800 ticks/s real-time, i.e. 4800 / 60 ≈ 80 ticks/frame;
## 500 gives ample headroom. A budget of 10 (previous default) capped advance()
## at ~600 ticks/s, making 2× and 4× playback visibly lag.
var tick_budget: int = 500


## Creates a new SimWorld with the given parameters.
func start(config: Dictionary, seed_value: int, faction_a: Dictionary, faction_b: Dictionary) -> void:
	world = SimWorld.create(config, seed_value, faction_a, faction_b)
	accumulator = 0.0
	paused = false
	playback_speed = 1.0


## Sets the playback speed. Only values in SPEED_VALUES are accepted.
func set_playback_speed(s: float) -> void:
	if SPEED_VALUES.has(s):
		playback_speed = s
		if s == 0.0:
			paused = true
		else:
			paused = false


## Toggles between paused (0.0) and the previous non-zero speed (default 1.0).
func toggle_pause() -> void:
	if paused:
		paused = false
		if playback_speed == 0.0:
			playback_speed = 1.0
	else:
		paused = true
		playback_speed = 0.0


## Advances the simulation by delta seconds (real time), scaled by playback
## speed. Returns the latest snapshot after all ticks.
func advance(delta: float) -> Dictionary:
	if world == null:
		return {}
	if paused or playback_speed == 0.0:
		return world.get_snapshot()
	accumulator += delta * playback_speed
	var dt: float = 1.0 / float(_get_tick_rate())
	var ticks_done: int = 0
	var budget_remaining: int = tick_budget
	while accumulator >= dt and budget_remaining > 0:
		world.tick()
		accumulator -= dt
		ticks_done += 1
		budget_remaining -= 1
	return world.get_snapshot()


## Resets the world with a new seed and clears the accumulator.
func reset(seed_value: int) -> void:
	if world != null:
		world.reset(seed_value)
	accumulator = 0.0


## Returns the tick count executed so far.
func get_tick_count() -> int:
	if world == null:
		return 0
	var snap: Dictionary = world.get_snapshot()
	return int(snap.get("tick", 0))


func _get_tick_rate() -> int:
	if world == null:
		return 20
	return int(world._tick_rate)
