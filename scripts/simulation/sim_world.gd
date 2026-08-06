## Headless simulation world. Deterministic gameplay logic with no rendering.
## Public contract for task #27 (scenes/sandbox/presenter).
##
## Captains' ultimates/abilities are NOT implemented in Phase 5 — they arrive
## with the gift economy phase. Captain units exist as plain combatants only.
##
## Phase 6 design seam: stage progression is currently driven internally by
## _advance_stage(). Phase 6 Match Director should inject stage overrides via a
## new enqueue_stage_override(stage) method and listen for a stage_changed
## signal emitted here.
##
## Phase 8 design seam: external GameCommand injection (SPAWN_CHAMPION,
## ADD_ENERGY, CAST_ABILITY, START_WORLD_EVENT, END_ROUND) needs
## enqueue_command(cmd: Dictionary) processed at the start of tick().
class_name SimWorld
extends RefCounted

const SPAWN_JITTER: float = 40.0
const SPAWN_SPREAD: float = 130.0      ## wider radial spawn band around the fortress
## Half width (sim units) of the stone-bridge corridor between each fortress
## and the capture zone. Marches outside the zone are funneled into this band
## so troops visibly cross the bridges on foot.
const BRIDGE_HALF_SIM: float = 90.0
const SEPARATION_RADIUS: float = 26.0  ## light push so squads don't stack
const ARENA_MARGIN: float = 40.0
## Casual stroll speed as a fraction of move_speed (idle wandering in the zone).
const WANDER_SPEED_FRACTION: float = 0.35
const ARENA_SIM_W: float = 1080.0
const ARENA_SIM_H: float = 1180.0
const SPAWN_DELAY: float = 0.2
const RETREAT_DURATION: float = 3.0
const PROJECTILE_HIT_RADIUS: float = 12.0
const FORTRESS_ATTACK_RANGE: float = 80.0
## Distance (sim units) inside which a triggered basic attack lands without
## the attacker having to move; beyond it the attacker walks to the target
## first. Overridable via config.combat.attackRadius.
const DEFAULT_ATTACK_RADIUS: float = 70.0
## Minimum gap between fortress_damaged events (camera/audio would choke on
## 30 events per second while a full squad hammers the gate).
const FORTRESS_DAMAGE_EVENT_CD: float = 0.5
## Volley combat: one strike pose per unit, then back to the march.
const ATTACK_POSE_SECONDS: float = 1.0
const DEFEND_PULL_RANGE: float = 150.0
const MAX_DEFENDERS: int = 3
## Center-dominion doctrine defaults (overridable via config.centerZone):
## flanks stay inside the capture zone and fortresses are shielded while
## their owner still has living units nearby.
const DEFAULT_FLANK_MIN: float = 30.0
const DEFAULT_FLANK_MAX_FRACTION: float = 0.8
const DEFAULT_FORTRESS_SHIELD_RADIUS: float = 160.0
## Max characters per side on the battlefield (bots + viewer joins combined).
const DEFAULT_MAX_UNITS_PER_SIDE: int = 30

## Stage names used in snapshots and events.
const STAGE_OPENING: String = "opening"
const STAGE_CRISIS: String = "crisis"
const STAGE_FINAL_SURGE: String = "final_surge"
const STAGE_SUDDEN_DEATH: String = "sudden_death"
const STAGE_ENDED: String = "ended"

# --- Members ---
var _config: Dictionary = {}
var _rng: SimRng
var _factions: Array = []         # [{ id, displayName }, ...]
var _dt: float = 0.05
var _tick: int = 0
var _elapsed: float = 0.0
var _stage: String = STAGE_OPENING
var _stage_elapsed: float = 0.0
var _stage_ticks: int = 0  ## integer accumulator (avoids float drift on stage boundaries)

# Layout
var _fortress_positions: Array = []  # [Vector2, Vector2]
var _crown: Vector2 = Vector2(540, 590)
var _capture_radius: float = 170.0

# State
var _dominion_raw: Array = [0.0, 0.0]
var _dominion_display: Array = [0.0, 0.0]
var _fortress_health: Array = [500.0, 500.0]
var _max_fortress_health: float = 500.0
var _winner: int = -1
var _victory_type: String = ""
var _round_over: bool = false

# Pools
var _champion_pool: UnitPool
var _guardian_pool: UnitPool
var _striker_pool: UnitPool
var _captain_pool: UnitPool
var _projectile_pool: ProjectilePool

# Tracking
var _events: Array = []
var _next_unit_id: int = 0
var _spawn_timers: Array = [0.0, 0.0]
var _spawn_cycles: Array = [0, 0]
var _spawn_counts: Array = [0, 0]
var _projectile_speed: float = 420.0
var _unit_registry: Dictionary = {}  # global_id -> SimUnit
var _dead_pending: Array = []        # SimUnit refs awaiting pool release

# Annihilation doctrine state.
var _sieging: Array = [false, false]          ## per faction: objective is the enemy fortress

# Roster bookkeeping (max per side + viewer joins).
var _max_units_per_side: int = DEFAULT_MAX_UNITS_PER_SIDE
var _deployment_done: Array = [false, false]  ## per faction: full roster deployed

# Volley combat pacing: each cadence tick one random fighter per side
# performs a single basic attack (gift techniques trigger extra attacks).
var _volley_interval: float = 20.0
var _volley_timer: float = 20.0
## Distance inside which a triggered basic attack lands without moving.
var _attack_radius: float = DEFAULT_ATTACK_RADIUS
## Throttle for fortress_damaged events per fortress side.
var _fort_damage_cd: Array = [0.0, 0.0]

# Cached config values
var _tick_rate: int = 20
var _stage_durations: Dictionary = {}
var _total_time: float = 0.0
var _dominion_rate: float = 4.0
var _dominion_smoothing: float = 0.15
var _weights: Dictionary = {}
var _flank_min: float = DEFAULT_FLANK_MIN
var _flank_max_radius: float = DEFAULT_FLANK_MAX_FRACTION * 170.0
var _fortress_shield_radius: float = DEFAULT_FORTRESS_SHIELD_RADIUS


## Static factory matching the public API contract.
static func create(config: Dictionary, seed_value: int, faction_a: Dictionary, faction_b: Dictionary) -> SimWorld:
	var world := SimWorld.new()
	world._init_world(config, seed_value, faction_a, faction_b)
	return world


func _init_world(config: Dictionary, seed_value: int, faction_a: Dictionary, faction_b: Dictionary) -> void:
	_config = config
	_tick_rate = int(config.get("tickRate", 20))
	_dt = 1.0 / float(_tick_rate)
	_rng = SimRng.new(seed_value)
	_factions = [
		{"id": faction_a.get("id", "a"), "displayName": faction_a.get("displayName", "A")},
		{"id": faction_b.get("id", "b"), "displayName": faction_b.get("displayName", "B")},
	]
	var stages: Dictionary = config.get("stages", {})
	_stage_durations = {
		STAGE_OPENING: float(stages.get("opening", 120)),
		STAGE_CRISIS: float(stages.get("crisis", 60)),
		STAGE_FINAL_SURGE: float(stages.get("finalSurge", 60)),
		STAGE_SUDDEN_DEATH: float(stages.get("suddenDeath", 45)),
	}
	# General battle timer: when configured, the four stages are scaled
	# proportionally (opening:crisis:finalSurge:suddenDeath = 1:1:1:2) so the
	# whole battle lasts exactly battleDurationSeconds — even sub-minute runs.
	var battle_duration: float = float(config.get("battleDurationSeconds", 0.0))
	if battle_duration > 0.0:
		var quarter: float = battle_duration / 5.0
		_stage_durations[STAGE_OPENING] = quarter
		_stage_durations[STAGE_CRISIS] = quarter
		_stage_durations[STAGE_FINAL_SURGE] = quarter
		_stage_durations[STAGE_SUDDEN_DEATH] = 2.0 * quarter
	_total_time = 0.0
	for key in _stage_durations:
		_total_time += _stage_durations[key]
	_max_units_per_side = maxi(int(config.get("maxUnitsPerSide", DEFAULT_MAX_UNITS_PER_SIDE)), 1)
	var arena: Dictionary = config.get("arena", {})
	_capture_radius = float(arena.get("captureZoneRadius", 170))
	_fortress_positions = [Vector2(120, 590), Vector2(960, 590)]
	_crown = Vector2(540, 590)
	_max_fortress_health = float(config.get("fortressHealth", 500))
	_fortress_health = [_max_fortress_health, _max_fortress_health]
	var dom: Dictionary = config.get("dominion", {})
	_dominion_rate = float(dom.get("ratePerSecondAtFullAdvantage", 4.0))
	_dominion_smoothing = float(dom.get("smoothing", 0.15))
	_weights = config.get("capturePressureWeights", {})
	var cz: Dictionary = config.get("centerZone", {})
	_flank_min = float(cz.get("flankMinRadius", DEFAULT_FLANK_MIN))
	_flank_max_radius = _capture_radius * float(cz.get("flankRadiusFraction", DEFAULT_FLANK_MAX_FRACTION))
	_fortress_shield_radius = float(cz.get("fortressShieldRadius", DEFAULT_FORTRESS_SHIELD_RADIUS))
	_projectile_speed = float(config.get("projectile", {}).get("speed", 420))
	var pools: Dictionary = config.get("pools", {})
	_champion_pool = UnitPool.new(int(pools.get("champion", 60)))
	_guardian_pool = UnitPool.new(int(pools.get("guardian", 60)))
	_striker_pool = UnitPool.new(int(pools.get("striker", 60)))
	_captain_pool = UnitPool.new(2)
	_projectile_pool = ProjectilePool.new(int(pools.get("projectile", 120)))
	_spawn_timers = [0.0, 0.0]
	_spawn_cycles = [0, 0]
	_spawn_counts = [0, 0]
	_dominion_raw = [0.0, 0.0]
	_dominion_display = [0.0, 0.0]
	_winner = -1
	_victory_type = ""
	_round_over = false
	_tick = 0
	_elapsed = 0.0
	_stage = STAGE_OPENING
	_stage_elapsed = 0.0
	_stage_ticks = 0
	_next_unit_id = 0
	_events.clear()
	_dead_pending.clear()
	_unit_registry.clear()
	_sieging = [false, false]
	_deployment_done = [false, false]
	var combat_cfg: Dictionary = _config.get("combat", {})
	_volley_interval = maxf(float(combat_cfg.get("volleyIntervalSeconds", 20.0)), 1.0)
	_volley_timer = _volley_interval
	_attack_radius = maxf(float(combat_cfg.get("attackRadius", DEFAULT_ATTACK_RADIUS)), 10.0)
	_fort_damage_cd = [0.0, 0.0]
	# Opening deployment: a small starting squad per side (default 5).
	# Everything else only arrives through viewer joins (red/blue comments).
	_spawn_initial_squads()


func tick() -> void:
	if _round_over:
		return
	_tick += 1
	_elapsed = float(_tick) * _dt
	_advance_stage()
	if _round_over:
		return
	_spawn_bots()
	_tick_volley()
	_update_doctrine_state()
	_tick_units()
	_tick_projectiles()
	_resolve_cleanup()
	_calculate_dominion()
	_check_victory()


func run_ticks(n: int) -> void:
	for i in n:
		tick()
		if _round_over:
			break


func get_snapshot() -> Dictionary:
	var units_arr: Array = []
	for pool in [_champion_pool, _guardian_pool, _striker_pool, _captain_pool]:
		for u: SimUnit in pool.active_units():
			if u.alive:
				units_arr.append({
					"id": u.id, "type": u.unit_type, "faction": u.faction_index,
					"x": u.position.x, "y": u.position.y,
					"health_fraction": u.health / maxf(u.max_health, 0.001),
					"state": u.state_string(),
				})
	var proj_arr: Array = []
	for p: SimProjectile in _projectile_pool.active_projectiles():
		if p.active:
			proj_arr.append({"id": p.id, "faction": p.faction_index, "x": p.position.x, "y": p.position.y})
	var drained: Array = _events.duplicate()
	_events.clear()
	var stage_tl: float = 0.0
	if not _round_over:
		stage_tl = maxf(_stage_durations.get(_stage, 0.0) - _stage_elapsed, 0.0)
	return {
		"tick": _tick, "elapsed": _elapsed, "stage": _stage,
		"stage_time_left": stage_tl,
		"battle_time_left": maxf(_total_time - _elapsed, 0.0),
		"alive_counts": [_count_alive(0), _count_alive(1)],
		"max_units_per_side": _max_units_per_side,
		"dominion": [_dominion_display[0], _dominion_display[1]],
		"fortress_health": [_fortress_health[0], _fortress_health[1]],
		"capture_pressure": _compute_pressure(),
		"winner": _winner, "victory_type": _victory_type,
		"units": units_arr, "projectiles": proj_arr, "events": drained,
		"pool_stats": {
			"champion": _champion_pool.pool_stats(),
			"guardian": _guardian_pool.pool_stats(),
			"striker": _striker_pool.pool_stats(),
			"projectile": _projectile_pool.pool_stats(),
		},
	}


func reset(seed_value: int) -> void:
	_rng = SimRng.new(seed_value)
	_champion_pool.reset_all()
	_guardian_pool.reset_all()
	_striker_pool.reset_all()
	_captain_pool.reset_all()
	_projectile_pool.reset_all()
	_dominion_raw = [0.0, 0.0]
	_dominion_display = [0.0, 0.0]
	_fortress_health = [_max_fortress_health, _max_fortress_health]
	_winner = -1
	_victory_type = ""
	_round_over = false
	_tick = 0
	_elapsed = 0.0
	_stage = STAGE_OPENING
	_stage_elapsed = 0.0
	_stage_ticks = 0
	_next_unit_id = 0
	_spawn_timers = [0.0, 0.0]
	_spawn_cycles = [0, 0]
	_spawn_counts = [0, 0]
	_events.clear()
	_dead_pending.clear()
	_unit_registry.clear()
	_sieging = [false, false]
	_deployment_done = [false, false]
	_volley_timer = _volley_interval
	_fort_damage_cd = [0.0, 0.0]
	_spawn_initial_squads()


func is_round_over() -> bool:
	return _round_over


## Gift technique system. Triggered by CAST_TECHNIQUE commands (gift tiers).
## tier 1 (finger heart) = one basic attack: a random fighter strikes the
## nearest enemy (walking into attack radius first) or the enemy fortress;
## tier 2 (galaxy) = 3000 damage points split equally among all enemies,
## or the full amount on the fortress when no enemy character remains;
## tier 3 (lion) = wipes every enemy and damages the enemy fortress (half
## its points, or 80% when fewer than 5 defenders remain, or outright
## destruction when only the fortress is left);
## tier 4 (laser / hand heart) = a random fighter instantly kills one enemy,
## or hits the enemy fortress when no enemy character remains.
## Emits a "technique:<faction>:<tier>" sim event so the arena can play
## the matching animations (tier 4 appends the caster's unit id).
func trigger_technique(faction: int, tier: int) -> bool:
	if _round_over or faction < 0 or faction > 1 or tier < 1 or tier > 4:
		return false
	var tech_cfg: Dictionary = _config.get("technique", {})
	if tech_cfg.is_empty():
		return false
	# Every technique is performed by the team's fighters: without a living
	# character on the casting side the gift cannot launch (battle.gd plays
	# the camera-shake failure feedback instead). Checked at trigger time, so
	# a character that joins AFTER a failed attempt makes the technique
	# available again immediately.
	if _count_alive(faction) == 0:
		return false
	match tier:
		1:
			# Finger heart: one basic attack by a random fighter, right now.
			_perform_basic_attack(faction)
		2:
			# Galaxy: the gift's power is split equally among all enemies.
			var t2: Dictionary = tech_cfg.get("tier2", {})
			_apply_galaxy_damage(faction, float(t2.get("totalDamage", 3000.0)))
		3:
			# Lion: destroy every enemy and break the enemy fortress.
			_apply_lion(faction, tech_cfg.get("tier3", {}))
		4:
			# Laser (hand heart): a random fighter instantly kills one enemy.
			var t4: Dictionary = tech_cfg.get("tier4", {})
			var caster_id: int = _apply_laser(faction, t4)
			_events.append("technique:%d:4:%d" % [faction, caster_id])
			return true
	_events.append("technique:%d:%d" % [faction, tier])
	return true


## Galaxy technique: the gift's total damage is distributed equally among all
## living enemy characters. With no enemy character left the full amount hits
## the enemy fortress. Deaths are attributed to the casting faction.
func _apply_galaxy_damage(faction: int, total_damage: float) -> void:
	if total_damage <= 0.0:
		return
	var enemies: Array = []
	for pool in [_champion_pool, _guardian_pool, _striker_pool, _captain_pool]:
		for u: SimUnit in pool.active_units():
			if u.alive and u.faction_index != faction:
				enemies.append(u)
	if enemies.is_empty():
		_hit_fortress(1 - faction, total_damage)
		return
	var per_enemy: float = total_damage / float(enemies.size())
	for enemy: SimUnit in enemies:
		enemy.health -= per_enemy
		enemy.last_hit_faction = faction
	# Deterministic death pass (same pattern as the two-pass projectile system).
	for pool in [_champion_pool, _guardian_pool, _striker_pool, _captain_pool]:
		for u: SimUnit in pool.active_units():
			if u.alive and u.health <= 0.0:
				_kill_unit(u, u.last_hit_faction)


## Lion technique: wipes every enemy character and damages the enemy fortress.
## Full enemy roster (>= lowCountThreshold): flat fortressDamage points.
## Fewer defenders: fortressDamageFractionLow of the fortress gauge.
## Fortress standing alone: destroyed outright regardless of remaining points.
func _apply_lion(faction: int, t3: Dictionary) -> void:
	var enemy: int = 1 - faction
	var enemy_count: int = _count_alive(enemy)
	if enemy_count == 0:
		_fortress_health[enemy] = 0.0
		_events.append("fortress_damaged:%d" % enemy)
		return
	_wipe_faction(enemy, faction)
	var threshold: int = int(t3.get("lowCountThreshold", 5))
	if enemy_count < threshold:
		_hit_fortress(enemy, _max_fortress_health * float(t3.get("fortressDamageFractionLow", 0.8)))
	else:
		_hit_fortress(enemy, float(t3.get("fortressDamage", 2500.0)))


## Laser technique (hand heart): a random fighter of `faction` instantly
## kills one random enemy character. With no enemy character left the beam
## burns the enemy fortress instead. Returns the caster's unit id so the
## arena can stage the beam from the right character.
func _apply_laser(faction: int, t4: Dictionary) -> int:
	var fighters: Array = []
	for pool in [_champion_pool, _guardian_pool, _striker_pool, _captain_pool]:
		for u: SimUnit in pool.active_units():
			if u.alive and u.faction_index == faction and u.state != SimUnit.State.SPAWNING:
				fighters.append(u)
	var caster_id: int = -1
	if not fighters.is_empty():
		var caster: SimUnit = _rng.pick(fighters)
		caster_id = caster.id
		# Strike pose — the arena shows the raised-hand beam animation.
		caster.state = SimUnit.State.ATTACK
		caster.state_time = 0.0
	var enemies: Array = []
	for pool in [_champion_pool, _guardian_pool, _striker_pool, _captain_pool]:
		for u: SimUnit in pool.active_units():
			if u.alive and u.faction_index != faction:
				enemies.append(u)
	if enemies.is_empty():
		_hit_fortress(1 - faction, float(t4.get("fortressDamage", 1000.0)))
	else:
		var victim: SimUnit = _rng.pick(enemies)
		victim.health = 0.0
		_kill_unit(victim, faction)
	return caster_id


## Direct fortress damage from gift techniques — bypasses the fortress shield
## (a gift always pays off) but keeps the throttled fortress_damaged event.
func _hit_fortress(fortress_index: int, damage: float) -> void:
	if fortress_index < 0 or fortress_index > 1 or damage <= 0.0:
		return
	_fortress_health[fortress_index] = maxf(_fortress_health[fortress_index] - damage, 0.0)
	if float(_fort_damage_cd[fortress_index]) <= 0.0:
		_fort_damage_cd[fortress_index] = FORTRESS_DAMAGE_EVENT_CD
		_events.append("fortress_damaged:%d" % fortress_index)


## Buffs take the stronger value while any buff is still active, so a tier 1
## re-cast never downgrades an active tier 3 buff.
func _apply_buff_max(u: SimUnit, stat: String, fraction: float, duration: float) -> void:
	if stat == "damage":
		if u.damage_buff_timer <= 0.0 or fraction >= u.damage_buff_fraction:
			u.damage_buff_fraction = fraction
			u.damage_buff_timer = duration
	else:
		if u.speed_buff_timer <= 0.0 or fraction >= u.speed_buff_fraction:
			u.speed_buff_fraction = fraction
			u.speed_buff_timer = duration


## Effective damage/speed including active technique buffs.
func _effective_damage(u: SimUnit) -> float:
	if u.damage_buff_timer > 0.0:
		return u.attack_damage * (1.0 + u.damage_buff_fraction)
	return u.attack_damage


func _effective_speed(u: SimUnit) -> float:
	if u.speed_buff_timer > 0.0:
		return u.move_speed * (1.0 + u.speed_buff_fraction)
	return u.move_speed


# === PRIVATE ===

func _advance_stage() -> void:
	_stage_ticks += 1
	_stage_elapsed = float(_stage_ticks) * _dt
	var old := _stage
	match _stage:
		STAGE_OPENING:
			if _stage_elapsed >= _stage_durations[STAGE_OPENING]:
				_stage = STAGE_CRISIS
				_stage_elapsed = 0.0
				_stage_ticks = 0
				_events.append("stage_changed:crisis")
		STAGE_CRISIS:
			if _stage_elapsed >= _stage_durations[STAGE_CRISIS]:
				_stage = STAGE_FINAL_SURGE
				_stage_elapsed = 0.0
				_stage_ticks = 0
				_events.append("stage_changed:final_surge")
		STAGE_FINAL_SURGE:
			if _stage_elapsed >= _stage_durations[STAGE_FINAL_SURGE]:
				_stage = STAGE_SUDDEN_DEATH
				_stage_elapsed = 0.0
				_stage_ticks = 0
				_events.append("stage_changed:sudden_death")
		STAGE_SUDDEN_DEATH:
			if _stage_elapsed >= _stage_durations[STAGE_SUDDEN_DEATH]:
				_resolve_sudden_death()
				return


func _spawn_bots() -> void:
	var bots_cfg: Dictionary = _config.get("bots", {})
	# Viewer-driven rosters: bot auto-spawn can be disabled so only chat
	# joins (red/blue comments) add characters after the opening squads.
	if not bool(bots_cfg.get("enabled", true)):
		return
	var interval: float = float(bots_cfg.get("spawnIntervalSeconds", 4.0))
	if _stage == STAGE_FINAL_SURGE:
		var fs: Dictionary = _config.get("finalSurge", {})
		interval *= float(fs.get("spawnIntervalMultiplier", 0.5))
	for faction in 2:
		# Annihilation doctrine: while the enemy marches on a wiped side's
		# castle that side stays wiped — no bot respawns mid-siege, otherwise
		# fresh bots recall the siege every few seconds and troops appear to
		# march on the castle while the zone battle is still ongoing.
		# Viewer joins still recall the siege via add_viewer_unit.
		if bool(_sieging[1 - faction]):
			continue
		_spawn_timers[faction] += _dt
		if _spawn_timers[faction] >= interval:
			_spawn_timers[faction] -= interval
			# Roster cap: once a side has fielded maxUnitsPerSide characters
			# its deployment is done — no respawns, further characters only
			# arrive via viewer joins (red/blue in chat).
			if bool(_deployment_done[faction]):
				continue
			if _count_alive(faction) >= _max_units_per_side:
				_deployment_done[faction] = true
				continue
			var cycle: Array = bots_cfg.get("unitCycle", ["champion", "guardian", "striker"])
			if cycle.is_empty():
				continue
			var idx: int = _spawn_cycles[faction] % cycle.size()
			var utype: String = cycle[idx]
			_spawn_cycles[faction] += 1
			var spawned: SimUnit = _spawn_bot(faction, utype)
			if spawned != null and _count_alive(faction) >= _max_units_per_side:
				_deployment_done[faction] = true


func _spawn_bot(faction: int, utype: String) -> SimUnit:
	var pool := _get_pool(utype)
	if pool == null:
		return null
	var u: SimUnit = pool.acquire()
	if u == null:
		return null  # Pool exhausted, skip spawn
	_configure_unit(u, utype, faction)
	var letters: Array = ["A", "B"]
	_spawn_counts[faction] += 1
	u.display_name = "Bot_%s_%d" % [letters[faction], _spawn_counts[faction]]
	return u


## Opening deployment: one captain plus initialSquadSize - 1 fighters per
## side (default 5 vs 5). Further characters only arrive via viewer joins.
func _spawn_initial_squads() -> void:
	var bots_cfg: Dictionary = _config.get("bots", {})
	var squad_size: int = maxi(int(bots_cfg.get("initialSquadSize", 5)), 1)
	var cycle: Array = bots_cfg.get("unitCycle", ["champion", "guardian", "striker"])
	for faction in 2:
		_spawn_captain(faction)
		for i in range(squad_size - 1):
			if cycle.is_empty():
				break
			var idx: int = _spawn_cycles[faction] % cycle.size()
			_spawn_cycles[faction] += 1
			_spawn_bot(faction, str(cycle[idx]))


## Viewer join: a chat user typed red/blue mid-battle to add one character to
## that side. Respects the maxUnitsPerSide cap. Emits a unit_joined event so
## the arena/HUD can show the "X joined the BLUE army" banner.
func add_viewer_unit(faction: int, viewer_name: String = "") -> bool:
	if _round_over or faction < 0 or faction > 1:
		return false
	if _count_alive(faction) >= _max_units_per_side:
		return false
	var bots_cfg: Dictionary = _config.get("bots", {})
	var cycle: Array = bots_cfg.get("unitCycle", ["champion", "guardian", "striker"])
	if cycle.is_empty():
		return false
	var idx: int = _spawn_cycles[faction] % cycle.size()
	var utype: String = str(cycle[idx])
	_spawn_cycles[faction] += 1
	var u: SimUnit = _spawn_bot(faction, utype)
	if u == null:
		return false
	var clean_name: String = viewer_name.replace(":", " ").strip_edges().left(24)
	if clean_name.is_empty():
		clean_name = u.display_name
	else:
		u.display_name = clean_name
	_events.append("unit_joined:%d:%s" % [faction, clean_name])
	return true


## Living units of one faction (captains included).
func _count_alive(faction: int) -> int:
	var count: int = 0
	for pool in [_champion_pool, _guardian_pool, _striker_pool, _captain_pool]:
		for u: SimUnit in pool.active_units():
			if u.alive and u.faction_index == faction:
				count += 1
	return count


## Public alive count so the battle screen can gate gift techniques on the
## presence of living casters (real-time: reflects units added at any point).
func count_alive(faction: int) -> int:
	if faction < 0 or faction > 1:
		return 0
	return _count_alive(faction)


func _spawn_captain(faction: int) -> void:
	var u: SimUnit = _captain_pool.acquire()
	if u == null:
		return
	_configure_unit(u, "captain", faction)
	u.display_name = str(_factions[faction]["displayName"]) + " Captain"


func _configure_unit(u: SimUnit, utype: String, faction: int) -> void:
	var gid: int = _next_unit_id
	_next_unit_id += 1
	u.id = gid
	u.unit_type = utype
	u.faction_index = faction
	var stats: Dictionary = _get_unit_stats(utype)
	u.max_health = float(stats.get("maxHealth", 100))
	u.health = u.max_health
	u.attack_damage = float(stats.get("attackDamage", 10))
	u.attack_interval = float(stats.get("attackIntervalSeconds", 1.0))
	u.move_speed = float(stats.get("moveSpeed", 100))
	u.attack_range = float(stats.get("attackRange", 50))
	u.retreat_health_fraction = float(stats.get("retreatHealthFraction", 0.25))
	u.uses_projectiles = (utype == "striker" or utype == "captain")
	u.state = SimUnit.State.SPAWNING
	u.state_time = 0.0
	u.attack_cooldown = 0.0
	u.target_id = -1
	u.retreat_timer = 0.0
	u.alive = true
	u.active = true
	u.last_hit_faction = -1
	# Spawn position: radial band around the owner's fortress.
	var base: Vector2 = _fortress_positions[faction]
	var spawn_angle: float = _rng.randf() * TAU
	var spawn_radius: float = _rng.randf_range(0.0, SPAWN_SPREAD)
	u.position = _clamp_arena(base + Vector2(cos(spawn_angle), sin(spawn_angle)) * spawn_radius)
	# Assign a personal slot inside the center zone so armies spread across
	# the whole middle scene instead of stacking on the crown point.
	var flank_angle: float = _rng.randf() * TAU
	var flank_mag: float = _rng.randf_range(_flank_min, maxf(_flank_max_radius, _flank_min + 1.0))
	u.flank_offset = Vector2(cos(flank_angle), sin(flank_angle)) * flank_mag
	_unit_registry[gid] = u


func _get_pool(utype: String) -> UnitPool:
	match utype:
		"champion": return _champion_pool
		"guardian": return _guardian_pool
		"striker": return _striker_pool
		"captain": return _captain_pool
	return null


func _get_unit_stats(utype: String) -> Dictionary:
	var all_stats: Dictionary = _config.get("unitStats", {})
	if all_stats.has(utype):
		return all_stats[utype]
	return {}


func _find_unit(uid: int) -> SimUnit:
	if _unit_registry.has(uid):
		var u: SimUnit = _unit_registry[uid]
		if u.alive and u.active:
			return u
	return null


# --- Tick sub-systems ---

## Annihilation doctrine. Recomputed once per tick (before unit AI):
## every troop converges on the arena center and fights there. A faction
## may only march on the enemy castle after the LAST enemy character has
## fallen. If the wiped side receives fresh characters (chat joins) the
## siege force is recalled and returns to the arena to fight.
func _update_doctrine_state() -> void:
	for faction in 2:
		var wants_siege: bool = _count_alive(faction) > 0 and _count_alive(1 - faction) == 0
		if wants_siege and not bool(_sieging[faction]):
			_events.append("siege_started:%d" % faction)
			# Rally EVERY survivor onto the march: nobody keeps retreating or
			# defending an empty field — the whole army converges on the castle.
			_rally_faction_to_siege(faction)
		elif not wants_siege and bool(_sieging[faction]):
			_events.append("siege_recalled:%d" % faction)
		_sieging[faction] = wants_siege


## On siege start, pull every living unit of the faction out of stationary
## states (retreat/defend/attack pose) and clear wander targets so the entire
## remaining army marches on the enemy fortress together.
func _rally_faction_to_siege(faction: int) -> void:
	for pool in [_champion_pool, _guardian_pool, _striker_pool, _captain_pool]:
		for u: SimUnit in pool.active_units():
			if not u.alive or u.faction_index != faction:
				continue
			if u.state == SimUnit.State.SPAWNING or u.state == SimUnit.State.DEAD:
				continue
			u.state = SimUnit.State.ADVANCE
			u.state_time = 0.0
			u.target_id = -1
			u.pending_attack = false
			u.pending_fortress = false
			u.wander_target = Vector2.ZERO
			u.wander_timer = 0.0


## Volley combat: every _volley_interval seconds each side performs exactly
## one triggered basic attack per side (gift techniques trigger extra ones).
func _tick_volley() -> void:
	_volley_timer -= _dt
	if _volley_timer > 0.0:
		return
	_volley_timer += _volley_interval
	_perform_basic_attack(0)
	_perform_basic_attack(1)


## One basic attack: a single random fighter of `faction` strikes. If any
## enemy character lives, the nearest one is the target — the attacker walks
## to it until it is inside the attack radius, then lands one blow. With no
## enemy character left the attacker marches to the enemy fortress and lands
## one blow from weapon range (this keeps the periodic siege pressure going
## while the rest of the army idles in front of the walls).
func _perform_basic_attack(faction: int) -> void:
	if _round_over:
		return
	var candidates: Array = []
	for pool in [_champion_pool, _guardian_pool, _striker_pool, _captain_pool]:
		for u: SimUnit in pool.active_units():
			if not u.alive or u.faction_index != faction:
				continue
			if u.state == SimUnit.State.SPAWNING or u.state == SimUnit.State.RETREAT:
				continue
			candidates.append(u)
	if candidates.is_empty():
		return
	var attacker: SimUnit = _rng.pick(candidates)
	attacker.attack_cooldown = 0.0
	attacker.wander_target = Vector2.ZERO
	attacker.wander_timer = 0.0
	var target := _find_nearest_enemy(attacker, 99999.0)
	if target != null:
		attacker.target_id = target.id
		if attacker.position.distance_to(target.position) <= _attack_radius:
			_strike_target(attacker, target)
		else:
			attacker.pending_attack = true
			attacker.state = SimUnit.State.ADVANCE
			attacker.state_time = 0.0
		return
	# No enemy character left: one blow on the enemy fortress from range.
	var enemy_fortress: int = 1 - faction
	if attacker.position.distance_to(_fortress_positions[enemy_fortress]) <= FORTRESS_ATTACK_RANGE:
		attacker.state = SimUnit.State.ATTACK
		attacker.state_time = 0.0
		_damage_fortress(enemy_fortress, _effective_damage(attacker))
	else:
		attacker.pending_fortress = true
		attacker.state = SimUnit.State.ADVANCE
		attacker.state_time = 0.0


## Pending basic attack on a character: chase the target until it is inside
## the attack radius, then land one blow. Retargets when the victim dies
## mid-walk; gives up when no enemy character remains.
func _chase_and_strike(u: SimUnit) -> void:
	var target := _find_unit(u.target_id)
	if target == null:
		target = _find_nearest_enemy(u, 99999.0)
		if target == null:
			u.pending_attack = false
			u.target_id = -1
			return
		u.target_id = target.id
	if u.position.distance_to(target.position) > _attack_radius:
		_move_toward(u, target.position)
		return
	u.pending_attack = false
	_strike_target(u, target)


## One blow on a character target (melee or projectile) with the strike pose.
## Triggered attacks (periodic cadence or gift) ALWAYS land: the cooldown is
## force-reset first, otherwise a picked fighter that swung recently would
## silently swallow the blow. Emits "strike:<attacker>:<target>" so the arena
## can stage the swing and the victim's hit glow at the exact moment the blow
## lands — any number of strikes can be in flight concurrently (one per
## triggered attacker).
func _strike_target(u: SimUnit, target: SimUnit) -> void:
	u.state = SimUnit.State.ATTACK
	u.state_time = 0.0
	u.attack_cooldown = 0.0
	var landed: bool
	if u.uses_projectiles:
		landed = _fire_projectile(u, target)
	else:
		landed = _apply_melee(u, target)
	if landed:
		_events.append("strike:%d:%d" % [u.id, target.id])


## Pending basic attack on the enemy fortress: march into weapon range, then
## land one blow (periodic siege strikes while troops camp the gates).
func _march_and_strike_fortress(u: SimUnit) -> void:
	var enemy_fortress: int = 1 - u.faction_index
	var fort_pos: Vector2 = _fortress_positions[enemy_fortress]
	if u.position.distance_to(fort_pos) > FORTRESS_ATTACK_RANGE:
		_move_toward(u, fort_pos)
		return
	u.pending_fortress = false
	u.state = SimUnit.State.ATTACK
	u.state_time = 0.0
	if _damage_fortress(enemy_fortress, _effective_damage(u)):
		_events.append("strike:%d:-1" % u.id)


## Applies damage to a fortress, clamped at zero, and emits a throttled
## fortress_damaged event so the HUD gauge drains in lockstep with the sim —
## the gauge can never still show health when the fortress actually falls.
## Returns true when the damage actually landed (false while shielded).
func _damage_fortress(fortress_index: int, damage: float) -> bool:
	if fortress_index < 0 or fortress_index > 1 or damage <= 0.0:
		return false
	if _is_fortress_shielded(fortress_index):
		return false
	_fortress_health[fortress_index] = maxf(_fortress_health[fortress_index] - damage, 0.0)
	if float(_fort_damage_cd[fortress_index]) <= 0.0:
		_fort_damage_cd[fortress_index] = FORTRESS_DAMAGE_EVENT_CD
		_events.append("fortress_damaged:%d" % fortress_index)
	return true


func _tick_units() -> void:
	# Fortress damage event cooldowns tick down with the world.
	for i in 2:
		_fort_damage_cd[i] = maxf(float(_fort_damage_cd[i]) - _dt, 0.0)
	# Collect all active units for deterministic id-ordered processing
	var all: Array = []
	for pool in [_champion_pool, _guardian_pool, _striker_pool, _captain_pool]:
		for u: SimUnit in pool.active_units():
			if u.alive:
				all.append(u)
	# Sort by id (insertion sort for stability and determinism)
	for i in range(1, all.size()):
		var key_unit: SimUnit = all[i]
		var key_id: int = key_unit.id
		var j: int = i - 1
		while j >= 0 and (all[j] as SimUnit).id > key_id:
			all[j + 1] = all[j]
			j -= 1
		all[j + 1] = key_unit
	# Process AI
	for u: SimUnit in all:
		_unit_ai(u)
	# Fortress damage only lands through triggered basic attacks (periodic
	# cadence or gift techniques), always through _damage_fortress.


func _unit_ai(u: SimUnit) -> void:
	if not u.alive:
		return
	u.state_time += _dt
	u.attack_cooldown = maxf(u.attack_cooldown - _dt, 0.0)
	# Siege troops never attack the fortress on their own — damage only lands
	# through triggered basic attacks (periodic cadence or gift techniques).
	# Technique buff timers tick down each frame; expiry keeps the fraction
	# at 0 influence since _effective_* checks the timer first.
	if u.damage_buff_timer > 0.0:
		u.damage_buff_timer = maxf(u.damage_buff_timer - _dt, 0.0)
	if u.speed_buff_timer > 0.0:
		u.speed_buff_timer = maxf(u.speed_buff_timer - _dt, 0.0)
	# Retreat check (disabled per-unit via retreatHealthFraction = 0)
	if u.retreat_health_fraction > 0.0 and u.state != SimUnit.State.RETREAT and u.state != SimUnit.State.DEAD:
		if u.health <= u.max_health * u.retreat_health_fraction:
			u.state = SimUnit.State.RETREAT
			u.retreat_timer = RETREAT_DURATION
			u.target_id = -1
			u.state_time = 0.0
	match u.state:
		SimUnit.State.SPAWNING:
			if u.state_time >= SPAWN_DELAY:
				u.state = SimUnit.State.ADVANCE
				u.state_time = 0.0
		SimUnit.State.ATTACK:
			# A triggered attack interrupts the strike pose: the picked unit
			# must chase its target even if it posed on a previous volley.
			if u.pending_attack or u.pending_fortress:
				_advance_ai(u)
			else:
				_attack_ai(u)
		SimUnit.State.ADVANCE:
			_advance_ai(u)
		SimUnit.State.RETREAT:
			_retreat_ai(u)
		SimUnit.State.DEFEND:
			_defend_ai(u)


func _advance_ai(u: SimUnit) -> void:
	# Triggered basic attack: a picked fighter chases its target (or the
	# enemy fortress) until in range, then lands one blow.
	if u.pending_attack:
		_chase_and_strike(u)
		return
	if u.pending_fortress:
		_march_and_strike_fortress(u)
		return
	# Volley combat: no auto-aggro. Units gather in the middle and wait;
	# strikes only happen on the volley timer or a gift technique.
	# Move toward objective. Flanked lanes apply only around the crown —
	# siege objectives must be closed to within fortress attack range.
	var obj_pos: Vector2 = _get_objective(u)
	if obj_pos == _crown and u.faction_index >= 0:
		var slot: Vector2 = _clamp_arena(obj_pos + u.flank_offset)
		# Casual wander: a unit parked at its slot with nobody to fight
		# strolls slowly to random nearby points inside the capture zone
		# instead of standing like a statue (SimRng keeps it deterministic).
		u.wander_timer = maxf(u.wander_timer - _dt, 0.0)
		var parked: bool = u.position.distance_to(slot) < 10.0
		var arrived: bool = u.wander_target != Vector2.ZERO and u.position.distance_to(u.wander_target) < 6.0
		if parked and (u.wander_timer <= 0.0 or arrived):
			var ang: float = _rng.randf() * TAU
			var mag: float = _rng.randf_range(20.0, 70.0)
			var wt: Vector2 = u.position + Vector2(cos(ang), sin(ang)) * mag
			if wt.distance_to(_crown) > _capture_radius * 0.95:
				wt = _crown + (wt - _crown).normalized() * _capture_radius * 0.95
			u.wander_target = _clamp_arena(wt)
			u.wander_timer = _rng.randf_range(2.5, 5.0)
		if parked and u.wander_target != Vector2.ZERO:
			_move_toward(u, u.wander_target, WANDER_SPEED_FRACTION)
			return
		u.wander_target = Vector2.ZERO
		obj_pos = slot
	# Siege positioning: when marching on the enemy fortress, troops stop at
	# weapon range and spread around the fortress instead of overlapping it.
	# Each unit gets a personal slot on the ring so the squad forms a line.
	if u.faction_index >= 0 and bool(_sieging[u.faction_index]):
		var enemy_fort: int = 1 - u.faction_index
		var fort_pos: Vector2 = _fortress_positions[enemy_fort]
		var siege_ring: float = FORTRESS_ATTACK_RANGE * 0.85
		var dist_to_fort: float = u.position.distance_to(fort_pos)
		# Personal angle based on unit id so squads fan out evenly.
		var personal_angle: float = fmod(float(u.id) * 2.39996, TAU)  # golden angle
		var ring_target: Vector2 = fort_pos + Vector2(cos(personal_angle), sin(personal_angle)) * siege_ring
		if dist_to_fort < siege_ring + 40.0:
			obj_pos = ring_target
			# Siege idle: parked in front of the fortress with no attack
			# triggered, troops shuffle around their ring slot instead of
			# standing still — and never hit the walls on their own.
			u.wander_timer = maxf(u.wander_timer - _dt, 0.0)
			var parked: bool = u.position.distance_to(ring_target) < 8.0
			var arrived: bool = u.wander_target != Vector2.ZERO and u.position.distance_to(u.wander_target) < 5.0
			if parked and (u.wander_timer <= 0.0 or arrived):
				var ang: float = _rng.randf() * TAU
				var mag: float = _rng.randf_range(6.0, 22.0)
				u.wander_target = _clamp_arena(u.position + Vector2(cos(ang), sin(ang)) * mag)
				u.wander_timer = _rng.randf_range(1.5, 3.5)
			if parked and u.wander_target != Vector2.ZERO:
				_move_toward(u, u.wander_target, WANDER_SPEED_FRACTION)
				return
			u.wander_target = Vector2.ZERO
	# Bridge corridor: outside the capture zone every march (spawn approach,
	# siege, recall) is funneled onto the stone bridge on the unit's side so
	# troops visibly cross on foot instead of cutting across open ground.
	if u.faction_index >= 0 and u.position.distance_to(_crown) > _capture_radius:
		obj_pos = Vector2(obj_pos.x, _crown.y + clampf(u.position.y - _crown.y, -BRIDGE_HALF_SIM, BRIDGE_HALF_SIM))
	_move_toward(u, obj_pos)
	# Defend check
	if u.faction_index >= 0 and _is_fortress_threatened(u.faction_index):
		if _should_defend(u):
			u.state = SimUnit.State.DEFEND
			u.state_time = 0.0


## Volley combat: the ATTACK state plays exactly one strike for
## ATTACK_POSE_SECONDS (the damage was already applied by the volley or
## technique that triggered it), then the unit resumes its march. No
## continuous attacks — the next blow waits for the next volley or gift.
func _attack_ai(u: SimUnit) -> void:
	if u.state_time >= ATTACK_POSE_SECONDS:
		u.target_id = -1
		u.state = SimUnit.State.ADVANCE
		u.state_time = 0.0


func _retreat_ai(u: SimUnit) -> void:
	u.retreat_timer -= _dt
	if u.retreat_timer <= 0.0:
		u.state = SimUnit.State.ADVANCE
		u.state_time = 0.0
		return
	if u.faction_index >= 0:
		var fp: Vector2 = _fortress_positions[u.faction_index]
		if u.position.distance_to(_crown) > _capture_radius:
			fp = Vector2(fp.x, _crown.y + clampf(u.position.y - _crown.y, -BRIDGE_HALF_SIM, BRIDGE_HALF_SIM))
		_move_toward(u, fp)


func _defend_ai(u: SimUnit) -> void:
	var fortress_pos: Vector2 = _fortress_positions[u.faction_index]
	if u.position.distance_to(_crown) > _capture_radius:
		fortress_pos = Vector2(fortress_pos.x, _crown.y + clampf(u.position.y - _crown.y, -BRIDGE_HALF_SIM, BRIDGE_HALF_SIM))
	_move_toward(u, fortress_pos)
	# Volley combat: defenders hold the gate but do not auto-attack — their
	# strikes land with the next volley like everyone else's.
	# Clear defend if threat gone
	if not _is_fortress_threatened(u.faction_index):
		u.state = SimUnit.State.ADVANCE
		u.state_time = 0.0


func _move_toward(u: SimUnit, target_pos: Vector2, speed_fraction: float = 1.0) -> void:
	var diff: Vector2 = target_pos - u.position
	var dist: float = diff.length()
	if dist < 1.0:
		return
	var step: float = _effective_speed(u) * speed_fraction * _dt
	var push := _separation_push(u)
	if step >= dist:
		u.position = _clamp_arena(target_pos + push)
	else:
		u.position = _clamp_arena(u.position + (diff / dist) * step + push)


## Light deterministic push away from nearby living units so squads spread
## across the arena floor instead of stacking on one point.
func _separation_push(u: SimUnit) -> Vector2:
	var push := Vector2.ZERO
	for pool in [_champion_pool, _guardian_pool, _striker_pool, _captain_pool]:
		for other: SimUnit in pool.active_units():
			if not other.alive or other == u:
				continue
			var away: Vector2 = u.position - other.position
			var d: float = away.length()
			if d > 0.001 and d < SEPARATION_RADIUS:
				push += (away / d) * (SEPARATION_RADIUS - d) * 0.35
	return push * _dt


## Keeps every unit inside the playable arena bounds.
func _clamp_arena(pos: Vector2) -> Vector2:
	return Vector2(
		clampf(pos.x, ARENA_MARGIN, ARENA_SIM_W - ARENA_MARGIN),
		clampf(pos.y, ARENA_MARGIN, ARENA_SIM_H - ARENA_MARGIN)
	)


func _find_nearest_enemy(u: SimUnit, max_range: float) -> SimUnit:
	var best: SimUnit = null
	var best_dist: float = max_range
	for pool in [_champion_pool, _guardian_pool, _striker_pool, _captain_pool]:
		for other: SimUnit in pool.active_units():
			if not other.alive:
				continue
			if other == u:
				continue
			if other.faction_index == u.faction_index:
				continue  # Same faction, skip
			var dist: float = u.position.distance_to(other.position)
			if dist < best_dist:
				best_dist = dist
				best = other
			elif dist == best_dist and best != null and other.id < best.id:
				# Deterministic tie-breaker: lower id wins when equidistant,
				# removing hidden positional bias from pool iteration order.
				best = other
	return best


func _apply_melee(attacker: SimUnit, target: SimUnit) -> bool:
	if attacker.attack_cooldown > 0.0:
		return false
	attacker.attack_cooldown = attacker.attack_interval
	target.health -= _effective_damage(attacker)
	# Record melee hitter for consistency with the two-pass projectile system.
	target.last_hit_faction = attacker.faction_index
	if target.health <= 0.0 and target.alive:
		_kill_unit(target, attacker.faction_index)
	return true


func _fire_projectile(shooter: SimUnit, target: SimUnit) -> bool:
	if shooter.attack_cooldown > 0.0:
		return false
	shooter.attack_cooldown = shooter.attack_interval
	var proj: SimProjectile = _projectile_pool.acquire()
	if proj == null:
		return false
	proj.id = _next_unit_id
	_next_unit_id += 1
	proj.faction_index = shooter.faction_index
	proj.position = shooter.position
	proj.damage = _effective_damage(shooter)
	proj.target_id = target.id
	var diff: Vector2 = target.position - shooter.position
	var dist: float = diff.length()
	if dist > 0.01:
		proj.velocity = (diff / dist) * _projectile_speed
	else:
		proj.velocity = Vector2.ZERO
	return true


func _tick_projectiles() -> void:
	# Two-pass projectile resolution (ordering fix):
	# Pass 1: accumulate all projectile damage first — decrement target health,
	# release projectile to pool, record killer faction on the target.
	# Pass 2: iterate units whose alive && health <= 0 and call _kill_unit once.
	# This prevents the scenario where projectile A kills a target and projectile
	# B (later in iteration order) loses its hit on the same target.
	var to_release: Array = []
	for p: SimProjectile in _projectile_pool.active_projectiles():
		if not p.active:
			continue
		p.lifetime -= _dt
		if p.lifetime <= 0.0:
			to_release.append(p)
			continue
		var target := _find_unit(p.target_id)
		if target == null:
			to_release.append(p)
			continue
		# Home toward target's current position
		var diff: Vector2 = target.position - p.position
		var dist: float = diff.length()
		if dist > 0.01:
			p.velocity = (diff / dist) * _projectile_speed
		p.position += p.velocity * _dt
		if p.position.distance_to(target.position) <= PROJECTILE_HIT_RADIUS:
			target.health -= p.damage
			# Record the last hitting faction so _kill_unit can attribute
			# the kill to the striker/captain whose projectile dealt the
			# killing blow (latest hit wins, which is deterministic since
			# projectiles iterate in pool order).
			target.last_hit_faction = p.faction_index
			to_release.append(p)
	for p: SimProjectile in to_release:
		_projectile_pool.release(p)
	# Pass 2: kill units that dropped to 0 or below health.
	for pool in [_champion_pool, _guardian_pool, _striker_pool, _captain_pool]:
		for u: SimUnit in pool.active_units():
			if u.alive and u.health <= 0.0:
				_kill_unit(u, u.last_hit_faction)


## True while the fortress owner still has a living unit within the shield
## radius of their own fortress.
func _is_fortress_shielded(faction: int) -> bool:
	var fortress_pos: Vector2 = _fortress_positions[faction]
	for pool in [_champion_pool, _guardian_pool, _striker_pool, _captain_pool]:
		for u: SimUnit in pool.active_units():
			if not u.alive or u.faction_index != faction:
				continue
			if u.position.distance_to(fortress_pos) <= _fortress_shield_radius:
				return true
	return false


func _kill_unit(victim: SimUnit, killer_faction: int) -> void:
	victim.health = 0.0
	victim.alive = false
	victim.state = SimUnit.State.DEAD
	_events.append("unit_died:%s:%d" % [victim.unit_type, victim.faction_index])
	_dead_pending.append(victim)


func _resolve_cleanup() -> void:
	for u: SimUnit in _dead_pending:
		var pool := _get_pool(u.unit_type)
		if pool != null:
			pool.release(u)
		_unit_registry.erase(u.id)
		u.reset()
	_dead_pending.clear()


func _calculate_dominion() -> void:
	var pressure := _compute_pressure()
	var p0: float = pressure[0]
	var p1: float = pressure[1]
	var rate: float = _dominion_rate
	# Stage multiplier
	if _stage == STAGE_SUDDEN_DEATH:
		var sd: Dictionary = _config.get("suddenDeath", {})
		rate *= float(sd.get("dominionRateMultiplier", 2.0))
	# Accrual: only the faction with higher pressure gains
	if p0 > p1 and p0 > 0.0:
		var advantage: float = clampf((p0 - p1) / maxf(p0, 1.0), 0.0, 1.0)
		_dominion_raw[0] += rate * advantage * _dt
	elif p1 > p0 and p1 > 0.0:
		var advantage: float = clampf((p1 - p0) / maxf(p1, 1.0), 0.0, 1.0)
		_dominion_raw[1] += rate * advantage * _dt
	# Never decrease
	_dominion_raw[0] = maxf(_dominion_raw[0], 0.0)
	_dominion_raw[1] = maxf(_dominion_raw[1], 0.0)
	# Framerate-independent exponential smoothing. The config value
	# _dominion_smoothing (e.g. 0.15) is defined per-tick at the reference
	# tick-rate. We convert it to a frame-rate-independent alpha so the
	# displayed convergence rate does not depend on _tick_rate.
	# alpha = 1 - (1 - smoothing)^(dt * tick_rate)
	var alpha: float = 1.0 - pow(1.0 - _dominion_smoothing, _dt * float(_tick_rate))
	_dominion_display[0] += alpha * (_dominion_raw[0] - _dominion_display[0])
	_dominion_display[1] += alpha * (_dominion_raw[1] - _dominion_display[1])
	# Cap at 100
	_dominion_raw[0] = minf(_dominion_raw[0], 100.0)
	_dominion_raw[1] = minf(_dominion_raw[1], 100.0)
	_dominion_display[0] = minf(_dominion_display[0], 100.0)
	_dominion_display[1] = minf(_dominion_display[1], 100.0)


func _compute_pressure() -> Array:
	var p: Array = [0.0, 0.0]
	for pool in [_champion_pool, _guardian_pool, _striker_pool, _captain_pool]:
		for u: SimUnit in pool.active_units():
			if not u.alive:
				continue
			if u.position.distance_to(_crown) <= _capture_radius:
				var w: float = float(_weights.get(u.unit_type, 0.0))
				p[u.faction_index] += w
	return p


func _get_objective(u: SimUnit) -> Vector2:
	# Annihilation doctrine: fight in the middle scene; only march on the
	# enemy fortress once no enemy character remains alive.
	if bool(_sieging[u.faction_index]):
		return _fortress_positions[1 - u.faction_index]
	return _crown


func _is_fortress_threatened(faction: int) -> bool:
	var fortress_pos: Vector2 = _fortress_positions[faction]
	for pool in [_champion_pool, _guardian_pool, _striker_pool, _captain_pool]:
		for u: SimUnit in pool.active_units():
			if not u.alive:
				continue
			if u.faction_index == faction:
				continue
			if u.position.distance_to(fortress_pos) <= DEFEND_PULL_RANGE:
				return true
	return false


func _should_defend(u: SimUnit) -> bool:
	var fortress_pos: Vector2 = _fortress_positions[u.faction_index]
	var my_dist: float = u.position.distance_to(fortress_pos)
	# Count allies closer than us
	var closer: int = 0
	for pool in [_champion_pool, _guardian_pool, _striker_pool, _captain_pool]:
		for other: SimUnit in pool.active_units():
			if not other.alive or other == u:
				continue
			if other.faction_index != u.faction_index:
				continue
			if other.position.distance_to(fortress_pos) < my_dist:
				closer += 1
				if closer >= MAX_DEFENDERS:
					return false
	return true



func _check_victory() -> void:
	# A battle can only be won by destroying the enemy castle. When a castle
	# falls, every remaining character of that side falls with it — a win
	# always leaves the losing side with zero characters on the field.
	if _fortress_health[0] <= 0.0:
		_wipe_faction(0, 1)
		_end_round(1, "fortress")
		return
	if _fortress_health[1] <= 0.0:
		_wipe_faction(1, 0)
		_end_round(0, "fortress")
		return


## Every living unit of `faction` dies with its castle. Killer attribution
## goes to the attacking side so kill bookkeeping stays consistent.
func _wipe_faction(faction: int, killer: int) -> void:
	for pool in [_champion_pool, _guardian_pool, _striker_pool, _captain_pool]:
		for u: SimUnit in pool.active_units():
			if u.alive and u.faction_index == faction:
				_kill_unit(u, killer)


func _resolve_sudden_death() -> void:
	# Battle timer expired. Castle destruction still wins outright; otherwise
	# the side with FEWER characters left on the battlefield loses.
	if _fortress_health[0] <= 0.0:
		_wipe_faction(0, 1)
		_end_round(1, "fortress")
		return
	if _fortress_health[1] <= 0.0:
		_wipe_faction(1, 0)
		_end_round(0, "fortress")
		return
	var alive_a: int = _count_alive(0)
	var alive_b: int = _count_alive(1)
	if alive_a > alive_b:
		_end_round(0, "timer")
	elif alive_b > alive_a:
		_end_round(1, "timer")
	else:
		_end_round(2, "draw")


func _end_round(winner: int, vtype: String) -> void:
	_winner = winner
	_victory_type = vtype
	_round_over = true
	_stage = STAGE_ENDED
	_sieging = [false, false]
	_events.append("victory:%d:%s" % [winner, vtype])
