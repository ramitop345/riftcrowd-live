## Plain-logic unit (NO Node). Represents one combatant in the simulation.
## Pool-managed: units are preallocated and reused via acquire/release.
## State machine: SPAWNING -> ADVANCE -> ATTACK <-> RETREAT -> DEFEND -> DEAD
##   REJOIN from guide = re-entering ADVANCE after RETREAT timer expires.
class_name SimUnit
extends RefCounted

## State machine states matching the guide's spawn/move/attack/retreat/defend/rejoin.
enum State {
	SPAWNING,  ## Just spawned, brief delay before moving
	ADVANCE,   ## Moving toward objective (capture zone or enemy)
	ATTACK,    ## In combat with a target
	RETREAT,   ## Low health, retreating toward own fortress (3s timer)
	DEFEND,    ## Pulled back to defend own fortress
	DEAD,      ## Killed, pending pool release
}

var id: int = -1
var unit_type: String = ""          ## "champion"|"guardian"|"striker"|"captain"|"boss"
var faction_index: int = -1         ## 0 or 1, boss = -1
var display_name: String = ""
var position: Vector2 = Vector2.ZERO
var health: float = 0.0
var max_health: float = 0.0
var alive: bool = false
var state: int = State.DEAD
var state_time: float = 0.0
var attack_cooldown: float = 0.0
var target_id: int = -1             ## -1 = no target
var active: bool = false            ## pool flag

## Stat fields copied from config on spawn.
var attack_damage: float = 0.0
var attack_interval: float = 1.0
var move_speed: float = 100.0
var attack_range: float = 50.0
var retreat_health_fraction: float = 0.25

## Projectile-using flag: strikers and captains fire projectiles.
var uses_projectiles: bool = false

## Retreat timer (seconds remaining in RETREAT state before returning to ADVANCE).
var retreat_timer: float = 0.0

## Boss contribution reward: faction that dealt killing blow gets capture bonus.
var boss_killer_faction: int = -1
var boss_bonus_time_left: float = 0.0

## Last projectile faction to hit this unit (used by two-pass projectile
## resolution to attribute the kill to the correct striker/captain).
var last_hit_faction: int = -1

## Per-unit lateral marching offset so squads spread across the arena
## instead of converging on the center line. Assigned at spawn from SimRng.
var flank_offset: Vector2 = Vector2.ZERO

## Casual wander target + countdown used when the unit is parked inside the
## capture zone with nothing to fight, so troops never stand like statues.
var wander_target: Vector2 = Vector2.ZERO
var wander_timer: float = 0.0

## Gift technique buffs. Fractions are multipliers added on top of the base
## stat (e.g. 0.5 = +50% damage); timers count down in SimWorld._unit_ai().
var damage_buff_fraction: float = 0.0
var damage_buff_timer: float = 0.0
var speed_buff_fraction: float = 0.0
var speed_buff_timer: float = 0.0


## Clears everything for pool reuse.
func reset() -> void:
	id = -1
	unit_type = ""
	faction_index = -1
	display_name = ""
	position = Vector2.ZERO
	health = 0.0
	max_health = 0.0
	alive = false
	state = State.DEAD
	state_time = 0.0
	attack_cooldown = 0.0
	target_id = -1
	active = false
	attack_damage = 0.0
	attack_interval = 1.0
	move_speed = 100.0
	attack_range = 50.0
	retreat_health_fraction = 0.25
	uses_projectiles = false
	retreat_timer = 0.0
	boss_killer_faction = -1
	boss_bonus_time_left = 0.0
	last_hit_faction = -1
	flank_offset = Vector2.ZERO
	wander_target = Vector2.ZERO
	wander_timer = 0.0
	damage_buff_fraction = 0.0
	damage_buff_timer = 0.0
	speed_buff_fraction = 0.0
	speed_buff_timer = 0.0


## Returns the state as a string for snapshot output.
func state_string() -> String:
	match state:
		State.SPAWNING: return "spawning"
		State.ADVANCE: return "advance"
		State.ATTACK: return "attack"
		State.RETREAT: return "retreat"
		State.DEFEND: return "defend"
		State.DEAD: return "dead"
	return "unknown"
