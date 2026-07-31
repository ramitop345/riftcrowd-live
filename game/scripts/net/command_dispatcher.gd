## CommandDispatcher (Phase 10) — routes incoming GameCommands from WSClient
## to the appropriate subsystem via typed signals.
##
## Connect this node to WSClient.command_received signal. Each command type
## emits a corresponding signal that subsystems (Battle presenter, ViewerRegistry,
## ChampionSpawner, etc.) can connect to.
##
## Signals:
##   mode_vote(payload: Dictionary)
##   faction_join(payload: Dictionary)
##   spawn_champion(payload: Dictionary)
##   gift_apply(payload: Dictionary)
##   add_energy(payload: Dictionary)
##   add_shield(payload: Dictionary)
##   spawn_squad(payload: Dictionary)
##   cast_ability(payload: Dictionary)
##   start_world_event(payload: Dictionary)
##   display_spotlight(payload: Dictionary)
##   pause_events(payload: Dictionary)
##   end_round(payload: Dictionary)
class_name CommandDispatcher
extends Node

signal mode_vote(payload: Dictionary)
signal faction_join(payload: Dictionary)
signal spawn_champion(payload: Dictionary)
signal gift_apply(payload: Dictionary)  ## Phase 11: add "GIFT_APPLY" case in dispatch() + GameCommandTypeSchema
signal add_energy(payload: Dictionary)
signal add_shield(payload: Dictionary)
signal spawn_squad(payload: Dictionary)
signal cast_ability(payload: Dictionary)
signal start_world_event(payload: Dictionary)
signal display_spotlight(payload: Dictionary)
signal pause_events(payload: Dictionary)
signal end_round(payload: Dictionary)

## Routes a command dictionary to the appropriate signal based on command type.
## Expected shape: { "type": "JOIN_FACTION" | "SPAWN_CHAMPION" | ..., ... }
func dispatch(command: Dictionary) -> void:
	var cmd_type: String = str(command.get("type", ""))

	match cmd_type:
		"JOIN_FACTION":
			faction_join.emit(command)
		"SPAWN_CHAMPION":
			spawn_champion.emit(command)
		"ADD_ENERGY":
			add_energy.emit(command)
		"ADD_SHIELD":
			add_shield.emit(command)
		"SPAWN_SQUAD":
			spawn_squad.emit(command)
		"CAST_ABILITY":
			cast_ability.emit(command)
		"START_WORLD_EVENT":
			start_world_event.emit(command)
		"DISPLAY_SPOTLIGHT":
			display_spotlight.emit(command)
		"PAUSE_EVENTS":
			pause_events.emit(command)
		"END_ROUND":
			end_round.emit(command)
		"GIFT_APPLY":
			gift_apply.emit(command)
		_:
			push_warning("CommandDispatcher: unknown command type '%s'" % cmd_type)
