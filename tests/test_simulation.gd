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
	_test_annihilation_doctrine()
	_test_doctrine_config()
	_test_pooling()
	_test_capture_dominion()
	_test_fortress_victory()
	_test_sudden_death()
	_test_full_round()
	_test_snapshot_shape()
	_test_boss_spawn()
	_test_projectile_pool_exhaustion()
	_test_technique_config()
	_test_technique_effects()
	_test_technique_determinism()
	_test_celebration_config()
	_test_victory_event_emitted()
	_test_roster_cap_and_viewer_join()
	_test_no_elimination_victory()
	_test_timer_victory()
	_test_battle_duration()
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
		"bots": {"spawnIntervalSeconds": 4.0, "initialSquadSize": 1, "unitCycle": ["champion", "guardian", "striker"]},
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
	# Fast volleys so the ATTACK pose shows up inside the tick budget.
	cfg["combat"] = {"volleyIntervalSeconds": 1.0}
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
	cfg["combat"] = {"volleyIntervalSeconds": 1.0}
	var w := _create_world(cfg, 13)
	# Run enough ticks for units to spawn, trade volleys and die. Under the
	# center-dominion doctrine fortress sieges are gated on holding the center
	# zone, so fortress coverage lives in _test_center_doctrine instead.
	var death_seen: bool = false
	for batch in 80:
		w.run_ticks(10)
		var snap: Dictionary = w.get_snapshot()
		var events: Array = snap["events"]
		for e: Variant in events:
			if str(e).begins_with("unit_died:"):
				death_seen = true
		if death_seen:
			break
	_check(death_seen, "combat: unit death event emitted")
	# Pool count: active should be <= capacity
	var final_snap: Dictionary = w.get_snapshot()
	var ps: Dictionary = final_snap["pool_stats"]
	var champ_stats: Dictionary = ps["champion"]
	_check(int(champ_stats["active"]) <= int(champ_stats["capacity"]), "combat: active <= capacity")


# --- (d2) Annihilation doctrine ---

func _test_annihilation_doctrine() -> void:
	# While both sides still send troops, nobody may march on a castle: no
	# siege events and no fortress damage, no matter how weak the castles are.
	var cfg: Dictionary = _make_config()
	cfg["stages"] = {"opening": 60, "crisis": 60, "finalSurge": 60, "suddenDeath": 60}
	cfg["fortressHealth"] = 1000
	var w := _create_world(cfg, 21)
	var siege_or_damage_seen: bool = false
	for batch in 30:  # 15 seconds of two-sided battle
		w.run_ticks(10)
		var snap: Dictionary = w.get_snapshot()
		for e: Variant in snap["events"]:
			var ev: String = str(e)
			if ev.begins_with("siege_started:") or ev.begins_with("fortress_damaged:"):
				siege_or_damage_seen = true
	_check(not siege_or_damage_seen, "doctrine: no siege and no fortress damage while both sides field troops")
	_check(not bool(w._sieging[0]) and not bool(w._sieging[1]), "doctrine: both squads hold the arena")
	# Wipe faction 0: the survivors must immediately march on the blue castle.
	w._deployment_done[0] = true
	w._wipe_faction(0, 1)
	var siege_started: bool = false
	var fortress_damaged: bool = false
	for batch in 40:  # up to 20 seconds
		w.run_ticks(10)
		var snap: Dictionary = w.get_snapshot()
		for e: Variant in snap["events"]:
			var ev: String = str(e)
			if ev == "siege_started:1":
				siege_started = true
			if ev.begins_with("fortress_damaged:0"):
				fortress_damaged = true
		if fortress_damaged:
			break
	_check(siege_started, "doctrine: siege_started once the last enemy character falls")
	_check(fortress_damaged, "doctrine: fortress damaged only after the enemy side is wiped")
	# Recall: a fresh enemy join pulls the siege force back to the arena.
	w.run_ticks(10)  # drain in-flight events
	_check(w.add_viewer_unit(0, "Rescue"), "doctrine: wiped side can rejoin via chat")
	var recall_seen: bool = false
	for batch in 10:
		w.run_ticks(10)
		var snap: Dictionary = w.get_snapshot()
		for e: Variant in snap["events"]:
			if str(e) == "siege_recalled:1":
				recall_seen = true
		if recall_seen:
			break
	_check(recall_seen, "doctrine: siege_recalled when the enemy side receives fresh troops")


func _test_doctrine_config() -> void:
	# Valid centerZone section accepted.
	var cfg: Dictionary = _make_config()
	cfg["centerZone"] = {"flankMinRadius": 30.0, "flankRadiusFraction": 0.8, "fortressShieldRadius": 160.0}
	var r1: Dictionary = GC.parse(cfg)
	_check(bool(r1["ok"]), "center_zone_cfg: valid centerZone accepted")
	# Unknown key inside centerZone rejected.
	var bad: Dictionary = _make_config()
	bad["centerZone"] = {"flankMinRadius": 30.0, "bogus": 1}
	var r2: Dictionary = GC.parse(bad)
	_check(not r2["ok"], "center_zone_cfg: unknown centerZone key rejected")
	# flankRadiusFraction above maximum rejected.
	var big: Dictionary = _make_config()
	big["centerZone"] = {"flankRadiusFraction": 2.0}
	var r3: Dictionary = GC.parse(big)
	_check(not r3["ok"], "center_zone_cfg: flankRadiusFraction above 1.5 rejected")
	# Valid spaceBackdrop section accepted.
	var cfg2: Dictionary = _make_config()
	cfg2["spaceBackdrop"] = {
		"enabled": true, "starCount": 500, "seed": 1, "shipIntervalSeconds": 15.0,
		"shipSpeedMin": 5.0, "shipSpeedMax": 9.0, "maxShips": 2,
	}
	var r4: Dictionary = GC.parse(cfg2)
	_check(bool(r4["ok"]), "space_cfg: valid spaceBackdrop accepted")
	# Unknown key inside spaceBackdrop rejected.
	var bad2: Dictionary = _make_config()
	bad2["spaceBackdrop"] = {"enabled": true, "bogus": 1}
	var r5: Dictionary = GC.parse(bad2)
	_check(not r5["ok"], "space_cfg: unknown spaceBackdrop key rejected")


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
	# Under the annihilation doctrine a siege only starts after the enemy side
	# is fully wiped — whitebox the wipe, then the survivors must take the
	# castle; fortress destruction is the ONLY victory condition asserted here.
	cfg["fortressHealth"] = 10
	cfg["bots"] = {"spawnIntervalSeconds": 1.0, "unitCycle": ["champion"]}
	cfg["stages"] = {"opening": 12, "crisis": 6, "finalSurge": 6, "suddenDeath": 90}
	var w := _create_world(cfg, 55)
	w.run_ticks(20 * 8)  # let both sides field several units
	# Faction 0 loses every character and can no longer deploy.
	w._deployment_done[0] = true
	w._wipe_faction(0, 1)
	var max_ticks: int = 20 * 100
	w.run_ticks(max_ticks)
	_check(w.is_round_over(), "fortress: round ends within budget")
	var snap: Dictionary = w.get_snapshot()
	var vtype: String = str(snap["victory_type"])
	var fh: Array = snap["fortress_health"]
	_check(vtype == "fortress", "fortress: only castle destruction wins")
	_check(int(snap["winner"]) == 1, "fortress: the surviving side wins")
	_check(float(fh[0]) <= 0.0, "fortress: destroyed fortress has 0 health")
	var alive: Array = snap["alive_counts"]
	_check(int(alive[0]) == 0, "fortress: losing side has zero characters left")


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
	# Symmetric armies (1 captain each, nobody died) -> timer expires -> draw
	_check(int(snap2["winner"]) == 2, "sudden_death: equal armies result in draw")
	_check(str(snap2["victory_type"]) == "draw", "sudden_death: draw victory type")


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
		"battle_time_left", "alive_counts", "max_units_per_side",
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
	# A long sudden_death stage keeps the round alive while the boss is killed.
	var cfg: Dictionary = _make_config()
	cfg["stages"] = {"opening": 9, "crisis": 5, "finalSurge": 6, "suddenDeath": 60}
	cfg["crisis"] = {"bossEnabled": true, "bossCaptureBonus": 0.5, "bossCaptureBonusSeconds": 10}
	# Keep the round alive long enough for the boss to spawn and die:
	# fortress wins need real sieges and dominion never accrues (rate 0).
	cfg["fortressHealth"] = 5000
	cfg["dominion"] = {"ratePerSecondAtFullAdvantage": 0.0, "smoothing": 0.15}
	cfg["combat"] = {"volleyIntervalSeconds": 1.0}
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
	# Run further ticks to try to kill the boss (lots of combat ticks). The
	# center-dominion doctrine clusters the brawl where the boss roams, but the
	# boss soaks a lot of damage before going down, so allow a generous budget.
	var boss_death_event: bool = false
	for batch in 120:
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


# --- (m) Technique config validation ---

func _technique_config() -> Dictionary:
	return {
		"tier1": {},
		"tier2": {"aoeDamage": 5.0},
		"tier3": {"fortressDamageFraction": 0.5, "spawnLockSeconds": 2.0, "cinematic": true},
		"performDurationSeconds": 1.6,
		"staggerStepSeconds": 0.08,
	}


func _test_technique_config() -> void:
	# Valid technique section accepted.
	var cfg: Dictionary = _make_config()
	cfg["technique"] = _technique_config()
	var r1: Dictionary = GC.parse(cfg)
	_check(bool(r1["ok"]), "technique_cfg: valid technique section accepted")
	# Unknown key inside technique rejected.
	var bad: Dictionary = _make_config()
	var bad_tech: Dictionary = _technique_config()
	bad_tech["bogus"] = 1
	bad["technique"] = bad_tech
	var r2: Dictionary = GC.parse(bad)
	_check(not r2["ok"], "technique_cfg: unknown technique key rejected")
	# Config without technique section still valid (optional).
	var r3: Dictionary = GC.parse(_make_config())
	_check(bool(r3["ok"]), "technique_cfg: config without technique section still valid")


# --- (n) Technique effects ---

func _test_technique_effects() -> void:
	var cfg: Dictionary = _make_config()
	cfg["technique"] = _technique_config()
	var w := _create_world(cfg, 123)
	# 3 seconds in: both captains alive (bots spawn at 4s).
	w.run_ticks(60)
	w.get_snapshot()
	# Invalid input rejected.
	_check(w.trigger_technique(-1, 1) == false, "technique: rejects invalid faction")
	_check(w.trigger_technique(2, 1) == false, "technique: rejects faction index 2")
	_check(w.trigger_technique(0, 0) == false, "technique: rejects tier 0")
	_check(w.trigger_technique(0, 4) == false, "technique: rejects tier 4")
	# Tier 1 (finger heart): the casting team immediately launches one volley.
	_check(w.trigger_technique(0, 1) == true, "technique: tier 1 accepted")
	var s1: Dictionary = w.get_snapshot()
	_check(_events_contain(s1, "technique:0:1"), "technique: tier 1 sim event emitted")
	var attacking: bool = false
	for uid: int in w._unit_registry:
		var u: SimUnit = w._unit_registry[uid]
		if u.alive and u.faction_index == 0 and u.state == SimUnit.State.ATTACK:
			attacking = true
	_check(attacking, "technique: tier 1 makes faction 0 units strike immediately")
	# Volley pose ends and units go back to advancing (1s = 20 ticks).
	w.run_ticks(21)
	var still_attacking: bool = false
	for uid: int in w._unit_registry:
		var u: SimUnit = w._unit_registry[uid]
		if u.alive and u.faction_index == 0 and u.state == SimUnit.State.ATTACK:
			still_attacking = true
	_check(not still_attacking, "technique: tier 1 volley pose ends after 1 second")
	# Tier 2 (galaxy): meteorites damage every enemy of the casting team.
	var enemy_hp_before: float = _total_health(w, 1)
	_check(w.trigger_technique(0, 2) == true, "technique: tier 2 accepted")
	var s2: Dictionary = w.get_snapshot()
	_check(_events_contain(s2, "technique:0:2"), "technique: tier 2 sim event emitted")
	var enemy_hp_after: float = _total_health(w, 1)
	_check(enemy_hp_after < enemy_hp_before, "technique: tier 2 meteorites damage enemy faction")
	# Tier 3 (lion): wipes the enemy team, cripples the enemy fortress and
	# locks the enemy out of adding new characters for spawnLockSeconds.
	var fortress_before: float = float(w._fortress_health[0])
	_check(w.trigger_technique(1, 3) == true, "technique: tier 3 accepted")
	var s3: Dictionary = w.get_snapshot()
	_check(_events_contain(s3, "technique:1:3"), "technique: tier 3 sim event emitted")
	_check(_total_health(w, 0) <= 0.0, "technique: tier 3 wipes every faction 0 unit")
	_check(float(w._fortress_health[0]) < fortress_before, "technique: tier 3 damages the enemy fortress")
	_check(not w.add_viewer_unit(0, "Locked"), "technique: tier 3 spawn lock blocks enemy joins")
	# Lock expires after spawnLockSeconds (2s = 40 ticks).
	w.run_ticks(41)
	_check(w.add_viewer_unit(0, "BackIn"), "technique: tier 3 spawn lock expires")
	# World without technique config refuses to trigger.
	var bare := _create_world(_make_config(), 123)
	bare.run_ticks(60)
	_check(bare.trigger_technique(0, 1) == false, "technique: rejected when config has no technique section")


# --- (o) Technique determinism ---

func _test_technique_determinism() -> void:
	var cfg: Dictionary = _make_config()
	cfg["technique"] = _technique_config()
	var f: Array = _make_factions()
	var w1 := SimWorld.create(cfg, 777, f[0], f[1])
	var w2 := SimWorld.create(cfg, 777, f[0], f[1])
	for i in 80:
		w1.tick()
		w2.tick()
		if i == 59:
			w1.trigger_technique(0, 3)
			w2.trigger_technique(0, 3)
		w1.get_snapshot()
		w2.get_snapshot()
	var s1: Dictionary = w1.get_snapshot()
	var s2: Dictionary = w2.get_snapshot()
	_check(str(s1) == str(s2), "technique: identical snapshots with same seed + same technique input")


# --- (p) Celebration config validation ---

func _test_celebration_config() -> void:
	# Valid celebration section accepted.
	var cfg: Dictionary = _make_config()
	cfg["celebration"] = {"durationSeconds": 2.8, "staggerStepSeconds": 0.06, "cameraPushIn": true}
	var r1: Dictionary = GC.parse(cfg)
	_check(bool(r1["ok"]), "celebration_cfg: valid celebration section accepted")
	# Unknown key inside celebration rejected.
	var bad: Dictionary = _make_config()
	bad["celebration"] = {"durationSeconds": 2.8, "bogus": 1}
	var r2: Dictionary = GC.parse(bad)
	_check(not r2["ok"], "celebration_cfg: unknown celebration key rejected")
	# Negative duration rejected.
	var neg: Dictionary = _make_config()
	neg["celebration"] = {"durationSeconds": -1.0}
	var r3: Dictionary = GC.parse(neg)
	_check(not r3["ok"], "celebration_cfg: negative duration rejected")
	# Config without celebration section still valid (optional).
	var r4: Dictionary = GC.parse(_make_config())
	_check(bool(r4["ok"]), "celebration_cfg: config without celebration section still valid")


# --- (q) Victory celebration event ---

func _test_victory_event_emitted() -> void:
	# Force a fast fortress win (annihilation doctrine: wipe one side, the
	# survivors take the castle); the victory event is what drives the
	# arena-side celebration.
	var cfg: Dictionary = _make_config()
	cfg["fortressHealth"] = 10
	var w := _create_world(cfg, 55)
	w.run_ticks(20 * 5)
	w._deployment_done[0] = true
	w._wipe_faction(0, 1)
	var found_victory: bool = false
	var max_ticks: int = 20 * 60
	for i in max_ticks:
		w.tick()
		var snap: Dictionary = w.get_snapshot()
		for e: Variant in (snap.get("events", []) as Array):
			if str(e).begins_with("victory:"):
				found_victory = true
		if w.is_round_over():
			break
	_check(w.is_round_over(), "victory: round ends within budget")
	_check(found_victory, "victory: victory:<winner>:<type> event emitted (drives celebration)")


# --- (r) Roster cap + viewer joins (red/blue mid-battle) ---

func _test_roster_cap_and_viewer_join() -> void:
	var cfg: Dictionary = _make_config()
	cfg["maxUnitsPerSide"] = 3
	cfg["bots"] = {"spawnIntervalSeconds": 0.1, "initialSquadSize": 1, "unitCycle": ["champion"]}
	cfg["stages"] = {"opening": 30, "crisis": 30, "finalSurge": 30, "suddenDeath": 30}
	var w := _create_world(cfg, 101)
	# Viewer join before the cap is hit succeeds and emits unit_joined.
	_check(w.add_viewer_unit(0, "Viewer:One"), "roster: viewer join accepted below cap")
	var snap_join: Dictionary = w.get_snapshot()
	_check(_events_contain(snap_join, "unit_joined:0:Viewer One"), "roster: unit_joined event emitted with sanitized name")
	_check(not _events_contain(snap_join, "unit_joined:0:Viewer:One"), "roster: ':' stripped from viewer name")
	# Run long enough that bots would far exceed the cap without enforcement.
	w.run_ticks(20 * 20)
	var snap: Dictionary = w.get_snapshot()
	var alive: Array = snap["alive_counts"]
	_check(int(alive[0]) <= 3, "roster: faction 0 never exceeds maxUnitsPerSide")
	_check(int(alive[1]) <= 3, "roster: faction 1 never exceeds maxUnitsPerSide")
	_check(int(snap["max_units_per_side"]) == 3, "roster: snapshot reports the cap")
	# Join at capacity is rejected.
	while w.add_viewer_unit(1, "Filler"):
		pass
	_check(not w.add_viewer_unit(1, "Overflow"), "roster: join rejected at cap")
	# Invalid faction index rejected.
	_check(not w.add_viewer_unit(2, "Bad"), "roster: invalid faction rejected")


# --- (s) No elimination victory (the battle continues after a wipe) ---

func _test_no_elimination_victory() -> void:
	# Wiping one side does NOT end the battle — the survivors must take the
	# castle to win. With a huge fortress the round keeps running long after
	# the wipe instead of declaring an elimination victory.
	var cfg: Dictionary = _make_config()
	cfg["fortressHealth"] = 100000
	cfg["bots"] = {"spawnIntervalSeconds": 1.0, "unitCycle": ["champion"]}
	cfg["stages"] = {"opening": 20, "crisis": 20, "finalSurge": 20, "suddenDeath": 60}
	var w := _create_world(cfg, 31)
	w.run_ticks(20 * 5)  # let both sides field several units
	var snap_mid: Dictionary = w.get_snapshot()
	_check(int((snap_mid["alive_counts"] as Array)[0]) > 1, "no_elimination: faction 0 has a deployed army")
	# Full roster deployed, then every character of faction 0 falls.
	w._deployment_done[0] = true
	w._wipe_faction(0, 1)
	w.run_ticks(20 * 10)  # well beyond the old elimination grace period
	_check(not w.is_round_over(), "no_elimination: battle continues after one side is wiped")
	var snap: Dictionary = w.get_snapshot()
	_check(str(snap["victory_type"]) != "elimination", "no_elimination: no elimination victory type")
	_check(bool(w._sieging[1]), "no_elimination: surviving side marches on the empty castle")
	_check(int((snap["alive_counts"] as Array)[1]) > 0, "no_elimination: survivors still on the field")


# --- (t) Timer victory (fewer characters left loses at time-out) ---

func _test_timer_victory() -> void:
	var cfg: Dictionary = _make_config()
	cfg["stages"] = {"opening": 1, "crisis": 1, "finalSurge": 1, "suddenDeath": 1}
	cfg["fortressHealth"] = 100000
	cfg["bots"] = {"spawnIntervalSeconds": 999.0, "unitCycle": ["champion"]}
	var w := _create_world(cfg, 61)
	# Give faction 0 one extra character; captains can't reach each other in
	# 4 seconds, so the timer decides the battle by alive counts.
	_check(w.add_viewer_unit(0, "ExtraFighter"), "timer: extra fighter added to faction 0")
	w.run_ticks(20 * 8)
	_check(w.is_round_over(), "timer: round ends at battle timer")
	var snap: Dictionary = w.get_snapshot()
	_check(int(snap["winner"]) == 0, "timer: side with more characters wins")
	_check(str(snap["victory_type"]) == "timer", "timer: victory type is 'timer'")


# --- (u) General battle timer (battleDurationSeconds) ---

func _test_battle_duration() -> void:
	var cfg: Dictionary = _make_config()
	# battleDurationSeconds scales all four stages proportionally (1:1:1:2) so
	# the whole battle lasts exactly 60s, regardless of the stage values.
	cfg["battleDurationSeconds"] = 60
	var w := _create_world(cfg, 11)
	var snap0: Dictionary = w.get_snapshot()
	_check(absf(float(snap0["battle_time_left"]) - 60.0) < 0.01, "duration: battle starts with full 60s")
	w.run_ticks(20 * 10)  # 10 seconds
	var snap1: Dictionary = w.get_snapshot()
	_check(absf(float(snap1["battle_time_left"]) - 50.0) < 0.2, "duration: countdown tracks elapsed time")
	_check(not w.is_round_over(), "duration: battle still running before timer end")
	# Sub-minute runs: 20s total splits into 4/4/4/8s stages.
	cfg["battleDurationSeconds"] = 20
	var w2 := _create_world(cfg, 12)
	_check(absf(float(w2._stage_durations[SimWorld.STAGE_OPENING]) - 4.0) < 0.01, "duration: short opening stage")
	_check(absf(float(w2._stage_durations[SimWorld.STAGE_SUDDEN_DEATH]) - 8.0) < 0.01, "duration: short sudden death stage")
	var snap2: Dictionary = w2.get_snapshot()
	_check(absf(float(snap2["battle_time_left"]) - 20.0) < 0.01, "duration: sub-minute battle starts with full 20s")


func _total_health(w: SimWorld, faction: int) -> float:
	var total: float = 0.0
	for uid: int in w._unit_registry:
		var u: SimUnit = w._unit_registry[uid]
		if u.alive and u.faction_index == faction:
			total += u.health
	return total


func _events_contain(snapshot: Dictionary, prefix: String) -> bool:
	var events: Variant = snapshot.get("events", [])
	if typeof(events) != TYPE_ARRAY:
		return false
	for e: Variant in (events as Array):
		if str(e) == prefix:
			return true
	return false


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
