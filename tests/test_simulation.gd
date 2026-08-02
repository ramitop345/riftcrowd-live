# Headless simulation test. Run from the repository root:
#   godot --headless --path game --script tests/test_simulation.gd
# Exercises the headless simulation core: GameplayConfig, SimRng, SimUnit,
# UnitPool, ProjectilePool, SimProjectile, and SimWorld. Uses a SHORT test
# config override for fast rounds. Exit code 0 on success, 1 on any failure.
extends SceneTree

const GC := preload("res://scripts/simulation/gameplay_config.gd")

var _passed: int = 0
var _failed: int = 0


func _initialize() -> void:
	_test_config_load()
	_test_config_rejection()
	_test_determinism()
	_test_state_machine()
	_test_combat()
	_test_pooling()
	_test_capture_dominion()
	_test_fortress_victory()
	_test_sudden_death()
	_test_full_round()
	_test_snapshot_shape()
	_test_boss_spawn()
	_test_projectile_pool_exhaustion()
	print("SIMULATION TESTS: %d passed, %d failed" % [_passed, _failed])
	quit(0 if _failed == 0 else 1)


# --- Test config helpers ---

func _make_config() -> Dictionary:
	return {
		"schemaVersion": 1, "tickRate": 20,
		"stages": {"opening": 12, "crisis": 6, "finalSurge": 6, "suddenDeath": 6},
		"arena": {"width": 1080, "height": 1180, "captureZoneRadius": 170},
		"fortressHealth": 50,
		"capturePressureWeights": {"champion": 1.0, "guardian": 0.6, "striker": 0.8, "captain": 1.5},
		"dominion": {"ratePerSecondAtFullAdvantage": 10.0, "smoothing": 0.15},
		"unitStats": {
			"champion": {"maxHealth": 100, "attackDamage": 12, "attackIntervalSeconds": 1.0, "moveSpeed": 140, "attackRange": 60, "retreatHealthFraction": 0.25},
			"guardian": {"maxHealth": 160, "attackDamage": 8, "attackIntervalSeconds": 1.2, "moveSpeed": 100, "attackRange": 50, "retreatHealthFraction": 0.25},
			"striker": {"maxHealth": 70, "attackDamage": 16, "attackIntervalSeconds": 0.8, "moveSpeed": 190, "attackRange": 55, "retreatHealthFraction": 0.25},
			"captain": {"maxHealth": 400, "attackDamage": 25, "attackIntervalSeconds": 1.4, "moveSpeed": 110, "attackRange": 80, "retreatHealthFraction": 0},
			"boss": {"maxHealth": 1200, "attackDamage": 30, "attackIntervalSeconds": 1.6, "moveSpeed": 80, "attackRange": 90, "retreatHealthFraction": 0},
		},
		"pools": {"champion": 60, "guardian": 60, "striker": 60, "projectile": 120},
		"bots": {"spawnIntervalSeconds": 4.0, "unitCycle": ["champion", "guardian", "striker"]},
		"finalSurge": {"spawnIntervalMultiplier": 0.5},
		"suddenDeath": {"dominionRateMultiplier": 2.0, "healingAllowed": false},
		"crisis": {"bossEnabled": true, "bossCaptureBonus": 0.5, "bossCaptureBonusSeconds": 10},
		"projectile": {"speed": 420},
	}


func _make_factions() -> Array:
	return [
		{"id": "alpha", "displayName": "Alpha"},
		{"id": "beta", "displayName": "Beta"},
	]


func _create_world(config: Dictionary, seed_val: int) -> SimWorld:
	var f: Array = _make_factions()
	return SimWorld.create(config, seed_val, f[0], f[1])


# --- (a) Config tests ---

func _test_config_load() -> void:
	var result: Dictionary = GC.load_default()
	_check(bool(result["ok"]), "gameplay.json loads ok")
	if result["ok"]:
		var cfg: Dictionary = result["value"]
		_check(int(cfg.get("tickRate", 0)) == 20, "tickRate is 20")
		_check(cfg.has("stages"), "has stages")
		_check(cfg.has("unitStats"), "has unitStats")
		_check(cfg.has("pools"), "has pools")


func _test_config_rejection() -> void:
	# Missing key
	var missing: Dictionary = {"schemaVersion": 1, "tickRate": 20}
	var r1: Dictionary = GC.parse(missing)
	_check(not r1["ok"], "reject config missing keys")
	_check(_has_error_containing(r1, "required"), "missing key error mentions 'required'")
	# Wrong type (tickRate as string)
	var wrong_type: Dictionary = _make_config()
	wrong_type["tickRate"] = "fast"
	var r2: Dictionary = GC.parse(wrong_type)
	_check(not r2["ok"], "reject config wrong type for tickRate")
	# Negative value
	var negative: Dictionary = _make_config()
	negative["fortressHealth"] = -10
	var r3: Dictionary = GC.parse(negative)
	_check(not r3["ok"], "reject config negative fortressHealth")
	# Unknown key
	var unknown: Dictionary = _make_config()
	unknown["extraKey"] = 42
	var r4: Dictionary = GC.parse(unknown)
	_check(not r4["ok"], "reject config unknown key")
	_check(_has_error_containing(r4, "unknown key"), "unknown key error mentions 'unknown key'")
	# Non-object root
	var r5: Dictionary = GC.parse(42)
	_check(not r5["ok"], "reject config non-object root")


# --- (b) Determinism ---

func _test_determinism() -> void:
	var cfg: Dictionary = _make_config()
	var w1 := _create_world(cfg, 42)
	var w2 := _create_world(cfg, 42)
	for i in 200:
		w1.tick()
		w2.tick()
		# Drain events at same ticks
		w1.get_snapshot()
		w2.get_snapshot()
	var s1: Dictionary = w1.get_snapshot()
	var s2: Dictionary = w2.get_snapshot()
	_check(int(s1["tick"]) == int(s2["tick"]), "determinism: same tick count")
	_check(float(s1["elapsed"]) == float(s2["elapsed"]), "determinism: same elapsed")
	_check(str(s1["stage"]) == str(s2["stage"]), "determinism: same stage")
	var snap1: String = JSON.stringify(s1)
	var snap2: String = JSON.stringify(s2)
	_check(snap1 == snap2, "determinism: identical snapshots (same seed, 200 ticks)")
	# Different seeds diverge
	var w3 := _create_world(cfg, 42)
	var w4 := _create_world(cfg, 99)
	w3.run_ticks(200)
	w4.run_ticks(200)
	var s3: Dictionary = w3.get_snapshot()
	var s4: Dictionary = w4.get_snapshot()
	var snap3: String = JSON.stringify(s3)
	var snap4: String = JSON.stringify(s4)
	_check(snap3 != snap4, "determinism: different seeds diverge by tick 200")


# --- (c) State machine ---

func _test_state_machine() -> void:
	var cfg: Dictionary = _make_config()
	var w := _create_world(cfg, 7)
	# Tick 0: captains just spawned, should be SPAWNING
	var snap0: Dictionary = w.get_snapshot()
	var units0: Array = snap0["units"]
	_check(units0.size() == 2, "state: 2 captains at start")
	var all_spawning: bool = true
	for u: Variant in units0:
		if str((u as Dictionary).get("state", "")) != "spawning":
			all_spawning = false
	_check(all_spawning, "state: captains start SPAWNING")
	# After 5 ticks (0.25s) captains should transition to ADVANCE
	w.run_ticks(5)
	var snap1: Dictionary = w.get_snapshot()
	var found_advance: bool = false
	for u: Variant in snap1["units"]:
		if str((u as Dictionary).get("state", "")) == "advance":
			found_advance = true
	_check(found_advance, "state: captain transitions to ADVANCE after spawn delay")
	# Run more ticks to get ATTACK state (captains meet near center)
	w.run_ticks(100)
	var snap2: Dictionary = w.get_snapshot()
	var found_attack: bool = false
	for u: Variant in snap2["units"]:
		if str((u as Dictionary).get("state", "")) == "attack":
			found_attack = true
	_check(found_attack, "state: unit reaches ATTACK state")
	# Captain never retreats: run many ticks, verify no captain in RETREAT
	w.run_ticks(100)
	var snap3: Dictionary = w.get_snapshot()
	var captain_retreats: bool = false
	for u: Variant in snap3["units"]:
		var ud: Dictionary = u
		if str(ud.get("type", "")) == "captain" and str(ud.get("state", "")) == "retreat":
			captain_retreats = true
	_check(not captain_retreats, "state: captain never retreats (retreatHealthFraction=0)")
	# SimUnit direct test
	var unit := SimUnit.new()
	_check(unit.state == SimUnit.State.DEAD, "state: new SimUnit starts DEAD")
	_check(unit.state_string() == "dead", "state: state_string for DEAD")


# --- (d) Combat ---

func _test_combat() -> void:
	var cfg: Dictionary = _make_config()
	var w := _create_world(cfg, 13)
	# Run enough ticks for units to spawn, move, fight, and kill
	var death_seen: bool = false
	var fortress_damaged: bool = false
	for batch in 40:
		w.run_ticks(10)
		var snap: Dictionary = w.get_snapshot()
		var events: Array = snap["events"]
		for e: Variant in events:
			var ev: String = str(e)
			if ev.begins_with("unit_died:"):
				death_seen = true
			if ev.begins_with("fortress_damaged:"):
				fortress_damaged = true
		if death_seen and fortress_damaged:
			break
	_check(death_seen, "combat: unit death event emitted")
	_check(fortress_damaged, "combat: fortress damage event emitted")
	# Pool count: active should be <= capacity
	var final_snap: Dictionary = w.get_snapshot()
	var ps: Dictionary = final_snap["pool_stats"]
	var champ_stats: Dictionary = ps["champion"]
	_check(int(champ_stats["active"]) <= int(champ_stats["capacity"]), "combat: active <= capacity")


# --- (e) Pooling ---

func _test_pooling() -> void:
	# Direct pool test
	var pool := UnitPool.new(3)
	_check(pool.get_active_count() == 0, "pool: starts empty")
	_check(pool.get_total_capacity() == 3, "pool: capacity is 3")
	var u1: SimUnit = pool.acquire()
	_check(u1 != null, "pool: first acquire succeeds")
	var u2: SimUnit = pool.acquire()
	_check(u2 != null, "pool: second acquire succeeds")
	var u3: SimUnit = pool.acquire()
	_check(u3 != null, "pool: third acquire succeeds")
	_check(pool.get_active_count() == 3, "pool: 3 active after 3 acquires")
	var u4: SimUnit = pool.acquire()
	_check(u4 == null, "pool: exhaustion returns null")
	_check(pool.get_active_count() == 3, "pool: still 3 active after failed acquire")
	_check(pool.get_active_count() <= pool.get_total_capacity(), "pool: never exceeds capacity")
	# Reuse: release u2, acquire again should return same object
	pool.release(u2)
	_check(pool.get_active_count() == 2, "pool: active decrements on release")
	var u5: SimUnit = pool.acquire()
	_check(u5 == u2, "pool: released unit reused (same identity)")
	_check(pool.get_peak_active() == 3, "pool: peak_active tracks max")
	# Reset
	pool.reset_all()
	_check(pool.get_active_count() == 0, "pool: reset_all clears active")


# --- (f) Capture/Dominion ---

func _test_capture_dominion() -> void:
	var cfg: Dictionary = _make_config()
	var w := _create_world(cfg, 42)
	# Run some ticks and check dominion accrual
	w.run_ticks(100)
	var snap: Dictionary = w.get_snapshot()
	var dom: Array = snap["dominion"]
	var dom0: float = float(dom[0])
	var dom1: float = float(dom[1])
	# At least one faction should have non-zero dominion after 5 seconds
	_check(dom0 > 0.0 or dom1 > 0.0, "dominion: at least one faction accrues dominion")
	_check(dom0 >= 0.0 and dom1 >= 0.0, "dominion: values non-negative")
	# Pressure weights: hand-compute with known units
	# captain in zone = 1.5, champion in zone = 1.0
	# If faction 0 has captain (1.5) and faction 1 has nothing in zone,
	# pressure = [1.5, 0] — faction 0 should accrue
	_check(snap.has("capture_pressure"), "dominion: snapshot has capture_pressure")
	var cp: Array = snap["capture_pressure"]
	_check(cp.size() == 2, "dominion: capture_pressure has 2 entries")
	# Dominion never decreases
	var prev_dom: Array = [0.0, 0.0]
	var decreased: bool = false
	for batch in 10:
		w.run_ticks(20)
		var s: Dictionary = w.get_snapshot()
		var d: Array = s["dominion"]
		if float(d[0]) < prev_dom[0] - 0.001 or float(d[1]) < prev_dom[1] - 0.001:
			decreased = true
		prev_dom = [float(d[0]), float(d[1])]
	_check(not decreased, "dominion: never decreases")


# --- (g) Fortress victory ---

func _test_fortress_victory() -> void:
	var cfg: Dictionary = _make_config()
	# Use very low fortress health for quick destruction
	cfg["fortressHealth"] = 10
	var w := _create_world(cfg, 55)
	var max_ticks: int = 20 * 30  # 30 seconds
	w.run_ticks(max_ticks)
	_check(w.is_round_over(), "fortress: round ends within budget")
	var snap: Dictionary = w.get_snapshot()
	var vtype: String = str(snap["victory_type"])
	var fh: Array = snap["fortress_health"]
	# Either fortress or dominion win
	_check(vtype == "fortress" or vtype == "dominion", "fortress: victory type is fortress or dominion")
	if vtype == "fortress":
		_check(float(fh[0]) <= 0.0 or float(fh[1]) <= 0.0, "fortress: destroyed fortress has 0 health")
		_check(int(snap["winner"]) >= 0, "fortress: winner is 0 or 1")


# --- (h) Sudden death ---

func _test_sudden_death() -> void:
	# Config with very short stages to reach sudden_death quickly
	var cfg: Dictionary = _make_config()
	cfg["stages"] = {"opening": 2, "crisis": 2, "finalSurge": 2, "suddenDeath": 4}
	cfg["dominion"] = {"ratePerSecondAtFullAdvantage": 2.0, "smoothing": 0.15}
	var w := _create_world(cfg, 77)
	var total_time: float = 2 + 2 + 2 + 4  # 10 seconds
	var max_ticks: int = int(total_time * 20) + 40  # extra buffer
	w.run_ticks(max_ticks)
	_check(w.is_round_over(), "sudden_death: round ends")
	var snap: Dictionary = w.get_snapshot()
	var winner: int = int(snap["winner"])
	_check(winner >= 0 and winner <= 2, "sudden_death: valid winner (0, 1, or 2 for draw)")
	# Draw test: force a perfectly symmetric config
	var cfg2: Dictionary = _make_config()
	cfg2["stages"] = {"opening": 1, "crisis": 1, "finalSurge": 1, "suddenDeath": 2}
	cfg2["dominion"] = {"ratePerSecondAtFullAdvantage": 0.0, "smoothing": 0.15}
	cfg2["bots"] = {"spawnIntervalSeconds": 999.0, "unitCycle": ["champion"]}
	# With 0 dominion rate and no bots, both factions stay symmetric
	var w2 := _create_world(cfg2, 42)
	w2.run_ticks(20 * 10)  # 10 seconds
	_check(w2.is_round_over(), "sudden_death: draw round ends")
	var snap2: Dictionary = w2.get_snapshot()
	# With 0 rate, dominion stays 0 for both; fortress health equal -> draw
	_check(int(snap2["winner"]) == 2, "sudden_death: forced tie results in draw")


# --- (i) Full-round acceptance ---

func _test_full_round() -> void:
	var cfg: Dictionary = _make_config()
	var seeds: Array = [10, 20, 30, 40, 50]
	# Create once and reset between rounds for pool reuse verification
	var w := _create_world(cfg, seeds[0])
	for round_idx in 5:
		if round_idx > 0:
			w.reset(seeds[round_idx])
		# Snapshot at start: 2 captains only
		var snap_start: Dictionary = w.get_snapshot()
		_check(snap_start["units"].size() == 2, "full_round[%d]: start has 2 captains" % round_idx)
		var ps_start: Dictionary = snap_start["pool_stats"]
		_check(int(ps_start["champion"]["active"]) == 0, "full_round[%d]: champion pool empty at start" % round_idx)
		_check(int(ps_start["guardian"]["active"]) == 0, "full_round[%d]: guardian pool empty at start" % round_idx)
		_check(int(ps_start["striker"]["active"]) == 0, "full_round[%d]: striker pool empty at start" % round_idx)
		# Run to completion
		var max_ticks: int = 20 * 40  # 40 seconds budget
		var completed: bool = false
		for batch in (max_ticks / 10):
			w.run_ticks(10)
			if w.is_round_over():
				completed = true
				break
		_check(completed, "full_round[%d]: round completes within budget" % round_idx)
		_check(w.is_round_over(), "full_round[%d]: is_round_over" % round_idx)
		# After round, reset and check pools
		if round_idx < 4:
			w.reset(seeds[round_idx + 1])
			var snap_after: Dictionary = w.get_snapshot()
			var ps_after: Dictionary = snap_after["pool_stats"]
			_check(int(ps_after["champion"]["active"]) == 0, "full_round[%d]: champion active=0 after reset" % round_idx)
			_check(int(ps_after["guardian"]["active"]) == 0, "full_round[%d]: guardian active=0 after reset" % round_idx)
			_check(int(ps_after["striker"]["active"]) == 0, "full_round[%d]: striker active=0 after reset" % round_idx)
			_check(int(ps_after["projectile"]["active"]) == 0, "full_round[%d]: projectile active=0 after reset" % round_idx)


# --- (j) Snapshot shape ---

func _test_snapshot_shape() -> void:
	var cfg: Dictionary = _make_config()
	var w := _create_world(cfg, 42)
	w.run_ticks(10)
	var snap: Dictionary = w.get_snapshot()
	# Required keys
	var required_keys: PackedStringArray = [
		"tick", "elapsed", "stage", "stage_time_left", "dominion",
		"fortress_health", "capture_pressure", "winner", "victory_type",
		"units", "projectiles", "events", "pool_stats",
	]
	for key: String in required_keys:
		_check(snap.has(key), "snapshot: has key '%s'" % key)
	_check(typeof(snap["dominion"]) == TYPE_ARRAY, "snapshot: dominion is array")
	_check((snap["dominion"] as Array).size() == 2, "snapshot: dominion has 2 entries")
	_check(typeof(snap["fortress_health"]) == TYPE_ARRAY, "snapshot: fortress_health is array")
	_check((snap["fortress_health"] as Array).size() == 2, "snapshot: fortress_health has 2 entries")
	_check(typeof(snap["units"]) == TYPE_ARRAY, "snapshot: units is array")
	_check(typeof(snap["projectiles"]) == TYPE_ARRAY, "snapshot: projectiles is array")
	_check(typeof(snap["events"]) == TYPE_ARRAY, "snapshot: events is array")
	_check(typeof(snap["pool_stats"]) == TYPE_DICTIONARY, "snapshot: pool_stats is dict")
	var ps: Dictionary = snap["pool_stats"]
	_check(ps.has("champion"), "snapshot: pool_stats has champion")
	_check(ps.has("guardian"), "snapshot: pool_stats has guardian")
	_check(ps.has("striker"), "snapshot: pool_stats has striker")
	_check(ps.has("projectile"), "snapshot: pool_stats has projectile")
	# Unit shape
	var units: Array = snap["units"]
	if units.size() > 0:
		var u: Dictionary = units[0]
		_check(u.has("id"), "snapshot: unit has id")
		_check(u.has("type"), "snapshot: unit has type")
		_check(u.has("faction"), "snapshot: unit has faction")
		_check(u.has("x"), "snapshot: unit has x")
		_check(u.has("y"), "snapshot: unit has y")
		_check(u.has("health_fraction"), "snapshot: unit has health_fraction")
		_check(u.has("state"), "snapshot: unit has state")
	# Events drained: second call returns empty
	var snap2: Dictionary = w.get_snapshot()
	var events2: Array = snap2["events"]
	_check(events2.size() == 0, "snapshot: events drained on second call")
	_check(int(snap2["tick"]) == int(snap["tick"]), "snapshot: tick unchanged on second call")


# --- (k) Boss spawn (crisis stage) ---

func _test_boss_spawn() -> void:
	# Use a config where opening=9s, crisis=5s so we reach crisis quickly.
	var cfg: Dictionary = _make_config()
	cfg["stages"] = {"opening": 9, "crisis": 5, "finalSurge": 6, "suddenDeath": 6}
	cfg["crisis"] = {"bossEnabled": true, "bossCaptureBonus": 0.5, "bossCaptureBonusSeconds": 10}
	var w := _create_world(cfg, 42)
	# Run through opening (9s = 180 ticks at 20Hz) plus a few crisis ticks.
	w.run_ticks(180)
	var snap_pre: Dictionary = w.get_snapshot()
	_check(str(snap_pre["stage"]) == "crisis", "boss_spawn: stage is crisis after opening")
	# Run a few more ticks for the boss to spawn.
	w.run_ticks(5)
	var snap: Dictionary = w.get_snapshot()
	var boss_found: bool = false
	var boss_alive: bool = false
	for u: Variant in snap["units"]:
		var ud: Dictionary = u
		if str(ud.get("type", "")) == "boss":
			boss_found = true
			if int(ud.get("faction", -99)) == -1:
				boss_alive = true
	_check(boss_found, "boss_spawn: boss unit appears in snapshot")
	_check(boss_alive, "boss_spawn: boss has faction_index == -1")
	# Run further ticks to try to kill the boss (lots of combat ticks).
	var boss_death_event: bool = false
	for batch in 60:
		w.run_ticks(10)
		var s: Dictionary = w.get_snapshot()
		for e: Variant in s["events"]:
			var ev: String = str(e)
			if ev.begins_with("unit_died:boss"):
				boss_death_event = true
		if boss_death_event:
			break
	_check(boss_death_event, "boss_spawn: boss death event emitted (unit_died:boss:*)")


# --- (l) ProjectilePool exhaustion ---

func _test_projectile_pool_exhaustion() -> void:
	var pool := ProjectilePool.new(3)
	_check(pool.get_active_count() == 0, "proj_pool: starts empty")
	_check(pool.get_total_capacity() == 3, "proj_pool: capacity is 3")
	var p1: SimProjectile = pool.acquire()
	_check(p1 != null, "proj_pool: first acquire succeeds")
	var p2: SimProjectile = pool.acquire()
	_check(p2 != null, "proj_pool: second acquire succeeds")
	var p3: SimProjectile = pool.acquire()
	_check(p3 != null, "proj_pool: third acquire succeeds")
	_check(pool.get_active_count() == 3, "proj_pool: 3 active after 3 acquires")
	# N+1 should return null.
	var p4: SimProjectile = pool.acquire()
	_check(p4 == null, "proj_pool: exhaustion returns null (N+1)")
	_check(pool.get_active_count() == 3, "proj_pool: still 3 active after failed acquire")
	# Release one, acquire again — same identity.
	pool.release(p2)
	_check(pool.get_active_count() == 2, "proj_pool: active decrements on release")
	var p5: SimProjectile = pool.acquire()
	_check(p5 != null, "proj_pool: acquire after release succeeds")
	_check(p5 == p2, "proj_pool: released projectile reused (same identity)")
	# reset_all clears active.
	pool.reset_all()
	_check(pool.get_active_count() == 0, "proj_pool: reset_all clears active count")


# --- Helpers ---

func _check(condition: bool, message: String) -> void:
	if condition:
		_passed += 1
	else:
		_fail_case(message)


func _fail_case(message: String) -> void:
	_failed += 1
	printerr("FAIL " + message)


func _has_error_containing(result: Dictionary, fragment: String) -> bool:
	var errors: Array = result.get("errors", [])
	for e: Variant in errors:
		if str(e).find(fragment) >= 0:
			return true
	return false
