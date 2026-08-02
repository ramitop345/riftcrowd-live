## CommandDispatcher (Phase 10 + Phase 11 + Phase 12) — routes incoming GameCommands from WSClient
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
##   follow_guardian(payload: Dictionary)   ## Phase 12
##   share_shield(payload: Dictionary)     ## Phase 12
##   strategy_vote(payload: Dictionary)    ## Phase 12
##   free_energy_ability(payload: Dictionary) ## Phase 12
##   add_score(payload: Dictionary)        ## Phase 12
##   spawn_vfx(payload: Dictionary)         ## Phase 15
##   spotlight_card(payload: Dictionary)    ## Phase 15
##   supporter_callout(payload: Dictionary) ## Phase 15
##   camera_impulse(payload: Dictionary)    ## Phase 15
##   play_audio(payload: Dictionary)        ## Phase 15
##   set_window_mode(payload: Dictionary)    ## Phase 16
##   activate_fallback(payload: Dictionary)  ## Phase 16
##   deactivate_fallback(payload: Dictionary) ## Phase 16
##   set_quality_tier(payload: Dictionary)   ## Phase 17/Tier 4
class_name CommandDispatcher
extends Node

signal mode_vote(payload: Dictionary)
signal faction_join(payload: Dictionary)
signal spawn_champion(payload: Dictionary)
signal gift_apply(payload: Dictionary)  ## Phase 11
signal add_energy(payload: Dictionary)
signal add_shield(payload: Dictionary)
signal spawn_squad(payload: Dictionary)
signal cast_ability(payload: Dictionary)
signal start_world_event(payload: Dictionary)
signal display_spotlight(payload: Dictionary)
signal pause_events(payload: Dictionary)
signal end_round(payload: Dictionary)
signal follow_guardian(payload: Dictionary)     ## Phase 12: follow → guardian spawn
signal share_shield(payload: Dictionary)         ## Phase 12: share → shield apply
signal strategy_vote(payload: Dictionary)        ## Phase 12: strategy vote → cast ability
signal free_energy_ability(payload: Dictionary)  ## Phase 12: !ability → free energy
signal add_score(payload: Dictionary)            ## Phase 12: like milestone → add score
signal spawn_vfx(payload: Dictionary)            ## Phase 15: VFX spawn
signal spotlight_card(payload: Dictionary)       ## Phase 15: spotlight card
signal supporter_callout(payload: Dictionary)    ## Phase 15: supporter callout
signal camera_impulse(payload: Dictionary)       ## Phase 15: camera impulse
signal play_audio(payload: Dictionary)           ## Phase 15: audio playback
signal set_window_mode(payload: Dictionary)       ## Phase 16: window mode change
signal activate_fallback(payload: Dictionary)     ## Phase 16: fallback overlay on
signal deactivate_fallback(payload: Dictionary)   ## Phase 16: fallback overlay off
signal set_quality_tier(payload: Dictionary)      ## Phase 17/Tier 4: quality tier change

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
		"FOLLOW_GUARDIAN":
			follow_guardian.emit(command)
		"SHARE_SHIELD":
			share_shield.emit(command)
		"STRATEGY_VOTE":
			strategy_vote.emit(command)
		"FREE_ENERGY_ABILITY":
			free_energy_ability.emit(command)
		"ADD_SCORE":
			add_score.emit(command)
		"SPAWN_VFX":
			spawn_vfx.emit(command)
		"SPOTLIGHT_CARD":
			spotlight_card.emit(command)
		"SUPPORTER_CALLOUT":
			supporter_callout.emit(command)
		"CAMERA_IMPULSE":
			camera_impulse.emit(command)
		"PLAY_AUDIO":
			play_audio.emit(command)
		"SET_WINDOW_MODE":
			_set_window_mode(command)
		"ACTIVATE_FALLBACK":
			activate_fallback.emit(command)
		"DEACTIVATE_FALLBACK":
			deactivate_fallback.emit(command)
		"SET_QUALITY_TIER":
			set_quality_tier.emit(command)
		_:
			push_warning("CommandDispatcher: unknown command type '%s'" % cmd_type)


## Phase 16: Handler stub for SET_WINDOW_MODE command.
## Wired to command queue; emits set_window_mode signal for consumers.
## Currently no consumer connected — WindowManager handles its own config loading.
func _set_window_mode(cmd: Dictionary) -> void:
	set_window_mode.emit(cmd)
