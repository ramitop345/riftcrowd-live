## FreeEngagement (Phase 12) — subscribes to CommandDispatcher signals and applies
## free engagement impacts to game state.
##
## Connect to CommandDispatcher signals:
##   follow_guardian → spawn guardian champion
##   share_shield → apply shield buff
##   strategy_vote → trigger strategy ability
##   free_energy_ability → add energy
##   add_score → add score from like milestones
class_name FreeEngagement
extends Node

## Emitted when a guardian is spawned from a follow
signal guardian_spawned(payload: Dictionary)
## Emitted when a shield is applied from a share
signal shield_applied(payload: Dictionary)
## Emitted when a strategy vote triggers an ability
signal strategy_triggered(payload: Dictionary)
## Emitted when free energy is added
signal energy_added(payload: Dictionary)
## Emitted when score is added from like milestones
signal score_added(payload: Dictionary)

## Tracks active guardians per faction (for bound enforcement)
var _active_guardians: Dictionary = {}
## Tracks active shields per faction (for bound enforcement)
var _active_shields: Dictionary = {}

func _ready() -> void:
	# Connect to CommandDispatcher if it exists
	var dispatcher: Node = get_node_or_null("/root/CommandDispatcher")
	if dispatcher and dispatcher.has_signal("follow_guardian"):
		dispatcher.connect("follow_guardian", _on_follow_guardian)
		dispatcher.connect("share_shield", _on_share_shield)
		dispatcher.connect("strategy_vote", _on_strategy_vote)
		dispatcher.connect("free_energy_ability", _on_free_energy_ability)
		dispatcher.connect("add_score", _on_add_score)
		push_warning("FreeEngagement: CommandDispatcher not found, signals not connected")

## Handles FOLLOW_GUARDIAN command — spawns a guardian champion
func _on_follow_guardian(payload: Dictionary) -> void:
	var faction_id: String = str(payload.get("factionId", ""))
	var champion_type: String = str(payload.get("metadata", {}).get("championType", "guardian"))
	var duration_ms: int = int(payload.get("metadata", {}).get("duration", 30000))

	# Track active guardians
	if not _active_guardians.has(faction_id):
		_active_guardians[faction_id] = []
	_active_guardians[faction_id].append({
		"type": champion_type,
		"expires_at": Time.get_ticks_msec() + duration_ms,
	})

	guardian_spawned.emit(payload)
	print("[FreeEngagement] Guardian spawned for %s (type: %s, duration: %dms)" % [faction_id, champion_type, duration_ms])

## Handles SHARE_SHIELD command — applies a shield buff
func _on_share_shield(payload: Dictionary) -> void:
	var faction_id: String = str(payload.get("factionId", ""))
	var magnitude: float = float(payload.get("amount", 0))
	var duration_ms: int = int(payload.get("metadata", {}).get("duration", 15000))

	# Track active shields
	if not _active_shields.has(faction_id):
		_active_shields[faction_id] = []
	_active_shields[faction_id].append({
		"magnitude": magnitude,
		"expires_at": Time.get_ticks_msec() + duration_ms,
	})

	shield_applied.emit(payload)
	print("[FreeEngagement] Shield applied for %s (+%.1f, duration: %dms)" % [faction_id, magnitude, duration_ms])

## Handles STRATEGY_VOTE command (CAST_ABILITY from strategy vote)
func _on_strategy_vote(payload: Dictionary) -> void:
	var faction_id: String = str(payload.get("factionId", ""))
	var option: String = str(payload.get("abilityId", ""))

	strategy_triggered.emit(payload)
	print("[FreeEngagement] Strategy triggered for %s: %s" % [faction_id, option])

## Handles FREE_ENERGY_ABILITY command — adds energy
func _on_free_energy_ability(payload: Dictionary) -> void:
	var faction_id: String = str(payload.get("factionId", ""))
	var magnitude: float = float(payload.get("amount", 0))

	energy_added.emit(payload)
	print("[FreeEngagement] Free energy added for %s (+%.1f)" % [faction_id, magnitude])

## Handles ADD_SCORE command — adds score from like milestones
func _on_add_score(payload: Dictionary) -> void:
	var faction_id: String = str(payload.get("factionId", ""))
	var magnitude: float = float(payload.get("amount", 0))

	score_added.emit(payload)
	print("[FreeEngagement] Score added for %s (+%.1f)" % [faction_id, magnitude])

## Cleanup expired guardians and shields (call from _process or timer)
func cleanup_expired() -> void:
	var now_ms: int = Time.get_ticks_msec()

	# Cleanup guardians
	for faction_id in _active_guardians.keys():
		var guardians: Array = _active_guardians[faction_id]
		var remaining: Array = []
		for g in guardians:
			if g["expires_at"] > now_ms:
				remaining.append(g)
		_active_guardians[faction_id] = remaining

	# Cleanup shields
	for faction_id in _active_shields.keys():
		var shields: Array = _active_shields[faction_id]
		var remaining: Array = []
		for s in shields:
			if s["expires_at"] > now_ms:
				remaining.append(s)
		_active_shields[faction_id] = remaining

## Returns active guardian count for a faction
func get_active_guardians(faction_id: String) -> int:
	if not _active_guardians.has(faction_id):
		return 0
	return _active_guardians[faction_id].size()

## Returns active shield count for a faction
func get_active_shields(faction_id: String) -> int:
	if not _active_shields.has(faction_id):
		return 0
	return _active_shields[faction_id].size()

## Resets all state (called on round end)
func reset() -> void:
	_active_guardians.clear()
	_active_shields.clear()
