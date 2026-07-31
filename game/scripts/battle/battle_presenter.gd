## Battle presenter — bridges the SimulationSandbox (headless sim) with the
## Arena (visual nodes). Each frame the presenter advances the sandbox, reads
## the latest snapshot, and feeds it to the arena.
class_name BattlePresenter
extends RefCounted

signal round_completed(snapshot: Dictionary)

var sandbox: SimulationSandbox = null
var arena: Node = null  ## Arena node (Node2D, typed as Node for flexibility)
var _round_done: bool = false


## Creates and wires up a sandbox + arena for a new round.
func setup(config: Dictionary, seed_value: int, faction_a: Dictionary, faction_b: Dictionary, arena_node: Node) -> void:
	sandbox = SimulationSandbox.new()
	sandbox.start(config, seed_value, faction_a, faction_b)
	arena = arena_node
	if arena != null and arena.has_method("setup"):
		arena.call("setup", config, faction_a, faction_b)
	_round_done = false
	# Connect arena round_ended signal.
	if arena != null and arena.has_signal("round_ended"):
		if not arena.is_connected("round_ended", _on_arena_round_ended):
			arena.connect("round_ended", _on_arena_round_ended)


## Called each frame from the battle screen's _process.
func present(delta: float) -> Dictionary:
	if sandbox == null or _round_done:
		return {}
	var snapshot: Dictionary = sandbox.advance(delta)
	if arena != null and arena.has_method("apply_snapshot") and not snapshot.is_empty():
		arena.call("apply_snapshot", snapshot)
	return snapshot


## Sets the sandbox playback speed.
func set_speed(speed: float) -> void:
	if sandbox != null:
		sandbox.set_playback_speed(speed)


## Toggles pause on the sandbox.
func toggle_pause() -> void:
	if sandbox != null:
		sandbox.toggle_pause()


## Resets the round with a new seed and clears arena visuals.
func restart(new_seed: int) -> void:
	if sandbox != null:
		sandbox.reset(new_seed)
	_round_done = false
	if arena != null and arena.has_method("restart"):
		arena.call("restart")


## Returns whether the round has completed.
func is_round_done() -> bool:
	return _round_done


func _on_arena_round_ended(victory_type: String, winner: int) -> void:
	_round_done = true
	var snap: Dictionary = {}
	if sandbox != null and sandbox.world != null:
		snap = sandbox.world.get_snapshot()
	round_completed.emit(snap)
