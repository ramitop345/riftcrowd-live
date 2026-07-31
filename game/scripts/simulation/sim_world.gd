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
const SPAWN_DELAY: float = 0.2
const RETREAT_DURATION: float = 3.0
const PROJECTILE_HIT_RADIUS: float = 12.0
const FORTRESS_ATTACK_RANGE: float = 80.0
const DEFEND_PULL_RANGE: float = 150.0
const MAX_DEFENDERS: int = 3
const DOMINION_AGGRESSION_THRESHOLD: float = 20.0

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
var _boss_spawned: bool = false
var _boss_bonus_faction: int = -1
var _boss_bonus_timer: float = 0.0
var _projectile_speed: float = 420.0
var _unit_registry: Dictionary = {}  # global_id -> SimUnit
var _dead_pending: Array = []        # SimUnit refs awaiting pool release

# Cached config values
var _tick_rate: int = 20
var _stage_durations: Dictionary = {}
var _total_time: float = 0.0
var _dominion_rate: float = 4.0
var _dominion_smoothing: float = 0.15
var _weights: Dictionary = {}


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
	_total_time = 0.0
	for key in _stage_durations:
		_total_time += _stage_durations[key]
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
	_boss_spawned = false
	_boss_bonus_faction = -1
	_boss_bonus_timer = 0.0
	_next_unit_id = 0
	_events.clear()
	_dead_pending.clear()
	_unit_registry.clear()
	# Spawn captains
	_spawn_captain(0)
	_spawn_captain(1)


func tick() -> void:
	if _round_over:
		return
	_tick += 1
	_elapsed = float(_tick) * _dt
	_advance_stage()
	if _round_over:
		return
	_spawn_bots()
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
	_boss_spawned = false
	_boss_bonus_faction = -1
	_boss_bonus_timer = 0.0
	_next_unit_id = 0
	_spawn_timers = [0.0, 0.0]
	_spawn_cycles = [0, 0]
	_spawn_counts = [0, 0]
	_events.clear()
	_dead_pending.clear()
	_unit_registry.clear()
	_spawn_captain(0)
	_spawn_captain(1)


func is_round_over() -> bool:
	return _round_over


# === PRIVATE ===

func _advance_stage() -> void:
	_stage_elapsed += _dt
	var old := _stage
	match _stage:
		STAGE_OPENING:
			if _stage_elapsed >= _stage_durations[STAGE_OPENING]:
				_stage = STAGE_CRISIS
				_stage_elapsed = 0.0
				_events.append("stage_changed:crisis")
		STAGE_CRISIS:
			if not _boss_spawned:
				var crisis_cfg: Dictionary = _config.get("crisis", {})
				if crisis_cfg.get("bossEnabled", false):
					_spawn_boss()
					_boss_spawned = true
			if _stage_elapsed >= _stage_durations[STAGE_CRISIS]:
				_stage = STAGE_FINAL_SURGE
				_stage_elapsed = 0.0
				_events.append("stage_changed:final_surge")
		STAGE_FINAL_SURGE:
			if _stage_elapsed >= _stage_durations[STAGE_FINAL_SURGE]:
				_stage = STAGE_SUDDEN_DEATH
				_stage_elapsed = 0.0
				_events.append("stage_changed:sudden_death")
		STAGE_SUDDEN_DEATH:
			if _stage_elapsed >= _stage_durations[STAGE_SUDDEN_DEATH]:
				_resolve_sudden_death()
				return
	# Boss bonus timer
	if _boss_bonus_timer > 0.0:
		_boss_bonus_timer -= _dt
		if _boss_bonus_timer <= 0.0:
			_boss_bonus_faction = -1
			_boss_bonus_timer = 0.0


func _spawn_bots() -> void:
	var bots_cfg: Dictionary = _config.get("bots", {})
	var interval: float = float(bots_cfg.get("spawnIntervalSeconds", 4.0))
	if _stage == STAGE_FINAL_SURGE:
		var fs: Dictionary = _config.get("finalSurge", {})
		interval *= float(fs.get("spawnIntervalMultiplier", 0.5))
	for faction in 2:
		_spawn_timers[faction] += _dt
		if _spawn_timers[faction] >= interval:
			_spawn_timers[faction] -= interval
			var cycle: Array = bots_cfg.get("unitCycle", ["champion", "guardian", "striker"])
			if cycle.is_empty():
				continue
			var idx: int = _spawn_cycles[faction] % cycle.size()
			var utype: String = cycle[idx]
			_spawn_cycles[faction] += 1
			_spawn_bot(faction, utype)


func _spawn_bot(faction: int, utype: String) -> void:
	var pool := _get_pool(utype)
	if pool == null:
		return
	var u: SimUnit = pool.acquire()
	if u == null:
		return  # Pool exhausted, skip spawn
	_configure_unit(u, utype, faction)
	var letters: Array = ["A", "B"]
	_spawn_counts[faction] += 1
	u.display_name = "Bot_%s_%d" % [letters[faction], _spawn_counts[faction]]


func _spawn_captain(faction: int) -> void:
	var u: SimUnit = _captain_pool.acquire()
	if u == null:
		return
	_configure_unit(u, "captain", faction)
	u.display_name = str(_factions[faction]["displayName"]) + " Captain"


func _spawn_boss() -> void:
	# Boss uses a dedicated pool slot from champion pool (large enough)
	var u: SimUnit = _champion_pool.acquire()
	if u == null:
		return
	_configure_unit(u, "boss", -1)
	u.display_name = "Boss"
	u.position = _crown + Vector2(_rng.randf_range(-20.0, 20.0), _rng.randf_range(-20.0, 20.0))
	_events.append("boss_spawned")


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
	# Spawn position
	if faction >= 0:
		var base: Vector2 = _fortress_positions[faction]
		u.position = base + Vector2(_rng.randf_range(-SPAWN_JITTER, SPAWN_JITTER), _rng.randf_range(-SPAWN_JITTER, SPAWN_JITTER))
	else:
		u.position = _crown
	_unit_registry[gid] = u


func _get_pool(utype: String) -> UnitPool:
	match utype:
		"champion": return _champion_pool
		"guardian": return _guardian_pool
		"striker": return _striker_pool
		"captain": return _captain_pool
		# Bosses are spawned from the champion pool (singleton heavy units).
		# Reusing the champion pool avoids a dedicated 1-slot pool.
		"boss": return _champion_pool
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

func _tick_units() -> void:
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
	# Fortress damage pass
	_process_fortress_attacks(all)


func _unit_ai(u: SimUnit) -> void:
	if not u.alive:
		return
	u.state_time += _dt
	u.attack_cooldown = maxf(u.attack_cooldown - _dt, 0.0)
	# Retreat check (not for captain/boss)
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
		SimUnit.State.ADVANCE:
			_advance_ai(u)
		SimUnit.State.ATTACK:
			_attack_ai(u)
		SimUnit.State.RETREAT:
			_retreat_ai(u)
		SimUnit.State.DEFEND:
			_defend_ai(u)


func _advance_ai(u: SimUnit) -> void:
	# Find enemy in aggro range
	var target := _find_nearest_enemy(u, u.attack_range * 4.0)
	if target != null:
		u.target_id = target.id
		u.state = SimUnit.State.ATTACK
		u.state_time = 0.0
		return
	# Move toward objective
	var objective := _get_objective(u)
	_move_toward(u, objective)
	# Defend check
	if u.faction_index >= 0 and _is_fortress_threatened(u.faction_index):
		if _should_defend(u):
			u.state = SimUnit.State.DEFEND
			u.state_time = 0.0


func _attack_ai(u: SimUnit) -> void:
	var target := _find_unit(u.target_id)
	if target == null:
		u.target_id = -1
		u.state = SimUnit.State.ADVANCE
		u.state_time = 0.0
		return
	var dist: float = u.position.distance_to(target.position)
	if dist <= u.attack_range:
		if u.uses_projectiles:
			_fire_projectile(u, target)
		else:
			_apply_melee(u, target)
	else:
		# Move toward target to maintain range
		_move_toward(u, target.position)
		# If too far, revert to advance
		if dist > u.attack_range * 4.0:
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
		_move_toward(u, _fortress_positions[u.faction_index])


func _defend_ai(u: SimUnit) -> void:
	if u.faction_index < 0:
		u.state = SimUnit.State.ADVANCE
		u.state_time = 0.0
		return
	var fortress_pos: Vector2 = _fortress_positions[u.faction_index]
	_move_toward(u, fortress_pos)
	# Attack nearby enemies
	var target := _find_nearest_enemy(u, u.attack_range * 2.0)
	if target != null:
		u.target_id = target.id
		var dist: float = u.position.distance_to(target.position)
		if dist <= u.attack_range:
			if u.uses_projectiles:
				_fire_projectile(u, target)
			else:
				_apply_melee(u, target)
	# Clear defend if threat gone
	if not _is_fortress_threatened(u.faction_index):
		u.state = SimUnit.State.ADVANCE
		u.state_time = 0.0


func _move_toward(u: SimUnit, target_pos: Vector2) -> void:
	var diff: Vector2 = target_pos - u.position
	var dist: float = diff.length()
	if dist < 1.0:
		return
	var step: float = u.move_speed * _dt
	if step >= dist:
		u.position = target_pos
	else:
		u.position += (diff / dist) * step


func _find_nearest_enemy(u: SimUnit, max_range: float) -> SimUnit:
	var best: SimUnit = null
	var best_dist: float = max_range
	for pool in [_champion_pool, _guardian_pool, _striker_pool, _captain_pool]:
		for other: SimUnit in pool.active_units():
			if not other.alive:
				continue
			if other == u:
				continue
			# Boss attacks anyone; others attack enemy faction
			if u.faction_index == -1:
				pass  # Boss targets anyone
			elif other.faction_index == u.faction_index:
				continue  # Same faction, skip
			elif other.faction_index == -1:
				pass  # Target boss
			var dist: float = u.position.distance_to(other.position)
			if dist < best_dist:
				best_dist = dist
				best = other
			elif dist == best_dist and best != null and other.id < best.id:
				# Deterministic tie-breaker: lower id wins when equidistant,
				# removing hidden positional bias from pool iteration order.
				best = other
	return best


func _apply_melee(attacker: SimUnit, target: SimUnit) -> void:
	if attacker.attack_cooldown > 0.0:
		return
	attacker.attack_cooldown = attacker.attack_interval
	target.health -= attacker.attack_damage
	# Record melee hitter for consistency with the two-pass projectile system.
	target.last_hit_faction = attacker.faction_index
	if target.health <= 0.0 and target.alive:
		_kill_unit(target, attacker.faction_index)


func _fire_projectile(shooter: SimUnit, target: SimUnit) -> void:
	if shooter.attack_cooldown > 0.0:
		return
	shooter.attack_cooldown = shooter.attack_interval
	var proj: SimProjectile = _projectile_pool.acquire()
	if proj == null:
		return
	proj.id = _next_unit_id
	_next_unit_id += 1
	proj.faction_index = shooter.faction_index
	proj.position = shooter.position
	proj.damage = shooter.attack_damage
	proj.target_id = target.id
	var diff: Vector2 = target.position - shooter.position
	var dist: float = diff.length()
	if dist > 0.01:
		proj.velocity = (diff / dist) * _projectile_speed
	else:
		proj.velocity = Vector2.ZERO


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


func _process_fortress_attacks(all_units: Array) -> void:
	for u: SimUnit in all_units:
		if not u.alive or u.faction_index < 0:
			continue
		var enemy_fortress: int = 1 - u.faction_index
		var dist: float = u.position.distance_to(_fortress_positions[enemy_fortress])
		if dist <= FORTRESS_ATTACK_RANGE and u.attack_cooldown <= 0.0:
			u.attack_cooldown = u.attack_interval
			_fortress_health[enemy_fortress] -= u.attack_damage
			_events.append("fortress_damaged:%d" % enemy_fortress)


func _kill_unit(victim: SimUnit, killer_faction: int) -> void:
	victim.health = 0.0
	victim.alive = false
	victim.state = SimUnit.State.DEAD
	_events.append("unit_died:%s:%d" % [victim.unit_type, victim.faction_index])
	# Boss contribution reward
	if victim.unit_type == "boss" and killer_faction >= 0:
		var crisis_cfg: Dictionary = _config.get("crisis", {})
		_boss_bonus_faction = killer_faction
		_boss_bonus_timer = float(crisis_cfg.get("bossCaptureBonusSeconds", 10))
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
	# Boss bonus
	if _boss_bonus_faction >= 0:
		var crisis_cfg: Dictionary = _config.get("crisis", {})
		var bonus: float = float(crisis_cfg.get("bossCaptureBonus", 0.5))
		_dominion_raw[_boss_bonus_faction] += bonus * _dt
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
			if not u.alive or u.faction_index < 0:
				continue
			if u.position.distance_to(_crown) <= _capture_radius:
				var w: float = float(_weights.get(u.unit_type, 0.0))
				p[u.faction_index] += w
	return p


func _get_objective(u: SimUnit) -> Vector2:
	if u.faction_index < 0:
		# Boss: nearest unit
		var nearest := _find_nearest_enemy(u, 99999.0)
		if nearest != null:
			return nearest.position
		return _crown
	# Striker aggression: target enemy fortress when dominion advantage >= 20
	if u.unit_type == "striker":
		var my_dom: float = _dominion_display[u.faction_index]
		var enemy_dom: float = _dominion_display[1 - u.faction_index]
		if my_dom - enemy_dom >= DOMINION_AGGRESSION_THRESHOLD:
			return _fortress_positions[1 - u.faction_index]
	return _crown


func _is_fortress_threatened(faction: int) -> bool:
	var fortress_pos: Vector2 = _fortress_positions[faction]
	for pool in [_champion_pool, _guardian_pool, _striker_pool, _captain_pool]:
		for u: SimUnit in pool.active_units():
			if not u.alive:
				continue
			if u.faction_index == faction or u.faction_index == -1:
				continue
			if u.position.distance_to(fortress_pos) <= DEFEND_PULL_RANGE:
				return true
	return false


func _should_defend(u: SimUnit) -> bool:
	if u.faction_index < 0:
		return false
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
	# Dominion win
	if _dominion_raw[0] >= 100.0:
		_end_round(0, "dominion")
		return
	if _dominion_raw[1] >= 100.0:
		_end_round(1, "dominion")
		return
	# Fortress destruction
	if _fortress_health[0] <= 0.0:
		_end_round(1, "fortress")
		return
	if _fortress_health[1] <= 0.0:
		_end_round(0, "fortress")
		return


func _resolve_sudden_death() -> void:
	if _dominion_display[0] > _dominion_display[1]:
		_end_round(0, "sudden_death")
	elif _dominion_display[1] > _dominion_display[0]:
		_end_round(1, "sudden_death")
	elif _fortress_health[0] > _fortress_health[1]:
		_end_round(0, "sudden_death")
	elif _fortress_health[1] > _fortress_health[0]:
		_end_round(1, "sudden_death")
	else:
		_end_round(2, "draw")


func _end_round(winner: int, vtype: String) -> void:
	_winner = winner
	_victory_type = vtype
	_round_over = true
	_stage = STAGE_ENDED
	_events.append("victory:%d:%s" % [winner, vtype])
