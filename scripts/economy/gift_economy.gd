## GiftEconomy (Phase 11) — subscribes to CommandDispatcher.gift_apply signal
## and applies gift impacts to the game state.
##
## Connect this node after CommandDispatcher is available. Each gift_apply
## command is routed to the appropriate subsystem:
##   - SPAWN_CHAMPION → delegate to ChampionSpawner / simulation
##   - ADD_ENERGY → add energy to faction
##   - ADD_SHIELD → add shield to faction
##   - SPAWN_SQUAD → delegate to squad spawner
##   - CAST_ABILITY → delegate to ability system
##   - START_WORLD_EVENT → delegate to world event system
##   - DISPLAY_SPOTLIGHT → delegate to UI spotlight
##
## This is a desk-checked implementation (Godot not installed on this machine).
class_name GiftEconomy
extends Node

## Emitted after a gift impact is applied.
signal gift_applied(payload: Dictionary)

## Reference to the CommandDispatcher node (set via inspector or code).
@export var dispatcher_path: NodePath = ^"/root/CommandDispatcher"

var _dispatcher: Node = null

func _ready() -> void:
	# Connect to CommandDispatcher.gift_apply signal
	if dispatcher_path != NodePath(""):
		_dispatcher = get_node_or_null(dispatcher_path)
		if _dispatcher and _dispatcher.has_signal("gift_apply"):
			_dispatcher.gift_apply.connect(_on_gift_apply)
			print("[GiftEconomy] Connected to CommandDispatcher.gift_apply")
		else:
			push_warning("[GiftEconomy] CommandDispatcher not found at path: %s" % str(dispatcher_path))
	else:
		push_warning("[GiftEconomy] dispatcher_path is empty; gift_apply signal not connected")

## Handles a gift_apply command from the gateway.
## Expected payload shape:
##   { "type": "GIFT_APPLY", "factionId": "...", "viewerId": "...",
##     "amount": <int>, "metadata": { "giftTier": "...", "cinematic": <bool>, ... } }
func _on_gift_apply(payload: Dictionary) -> void:
	var cmd_type: String = str(payload.get("type", ""))
	if cmd_type != "GIFT_APPLY":
		push_warning("[GiftEconomy] Received non-GIFT_APPLY command: %s" % cmd_type)
		return

	var faction_id: String = str(payload.get("factionId", ""))
	var viewer_id: String = str(payload.get("viewerId", ""))
	var amount: int = int(payload.get("amount", 0))
	var metadata: Dictionary = payload.get("metadata", {}) if payload.get("metadata") is Dictionary else {}
	var gift_tier: String = str(metadata.get("giftTier", ""))
	var is_cinematic: bool = bool(metadata.get("cinematic", false))

	# Log the gift impact
	print("[GiftEconomy] Applying gift_apply: tier=%s faction=%s viewer=%s amount=%d cinematic=%s" % [
		gift_tier, faction_id, viewer_id, amount, str(is_cinematic)
	])

	# Route to appropriate subsystem based on the metadata
	# In a full implementation, these would delegate to ChampionSpawner,
	# EnergySystem, ShieldSystem, etc. For now, we emit a signal.
	gift_applied.emit(payload)

	# Apply energy if present
	if amount > 0:
		_apply_energy(faction_id, amount)

	# Trigger spotlight if cinematic
	if is_cinematic:
		_trigger_spotlight(viewer_id, gift_tier)

## Placeholder: add energy to a faction.
## Phase 12+ will wire this to the actual energy/score system.
func _apply_energy(faction_id: String, amount: int) -> void:
	# In full implementation: find the faction's energy pool and add to it
	print("[GiftEconomy] +%d energy to faction %s" % [amount, faction_id])

## Placeholder: trigger a UI spotlight for cinematic gifts.
func _trigger_spotlight(viewer_id: String, tier: String) -> void:
	# In full implementation: show a fullscreen spotlight overlay
	print("[GiftEconomy] Spotlight: viewer=%s tier=%s" % [viewer_id, tier])
