# Headless sandbox test. Run from the game/ directory:
#   godot --headless --script res://tests/test_sandbox.gd
# Exercises the SimulationSandbox wrapper around SimWorld: tick counts at
# different playback speeds (1x, 2x, 4x), pause behaviour, reset cleanliness,
# and speed validation. Uses the same SHORT config override as test_simulation.
# Exit code 0 on success, 1 on any failure.
extends SceneTree

const GC := preload("res://scripts/simulation/gameplay_config.gd")

var _passed: int = 0
var _failed: int = 0


func _initialize() -> void:
	_test_sandbox_creation()
	_test_speed_values()
	_test_ticks_at_1x()
	_test_ticks_at_2x()
	_test_ticks_at_4x()
	_test_pause_zero_ticks()
	_test_toggle_pause()
	_test_reset_clean()
	_test_multiple_resets()
	_test_speed_change()
	if _passed < 15:
		_fail_case("expected >= 15 assertions, got %d" % _passed)
	print("SANDBOX TESTS: %d passed, %d failed" % [_passed, _failed])
	quit(0 if _failed == 0 else 1)


# --- Test config helpers (same SHORT config as test_simulation) ---

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


# --- Helper: advance sandbox for real_seconds using frame_size steps ---

func _advance_for(sandbox: SimulationSandbox, real_seconds: float, frame_size: float = 0.016) -> int:
	var remaining: float = real_seconds
	while remaining > 0.0:
		var step: float = minf(frame_size, remaining)
		sandbox.advance(step)
		remaining -= step
	return sandbox.get_tick_count()


# --- Tests ---

func _test_sandbox_creation() -> void:
	var sandbox := SimulationSandbox.new()
	_check(sandbox != null, "creation: sandbox instantiated")
	_check(sandbox.world == null, "creation: world is null before start")
	var cfg: Dictionary = _make_config()
	var f: Array = _make_factions()
	sandbox.start(cfg, 42, f[0], f[1])
	_check(sandbox.world != null, "creation: world created after start")
	_check(sandbox.playback_speed == 1.0, "creation: default speed is 1.0")
	_check(not sandbox.paused, "creation: not paused by default")


func _test_speed_values() -> void:
	var speeds: Array = SimulationSandbox.SPEED_VALUES
	_check(speeds.size() == 5, "speeds: 5 allowed values")
	_check(float(speeds[0]) == 0.0, "speeds: index 0 is 0.0")
	_check(float(speeds[1]) == 0.5, "speeds: index 1 is 0.5")
	_check(float(speeds[2]) == 1.0, "speeds: index 2 is 1.0")
	_check(float(speeds[3]) == 2.0, "speeds: index 3 is 2.0")
	_check(float(speeds[4]) == 4.0, "speeds: index 4 is 4.0")


func _test_ticks_at_1x() -> void:
	var sandbox := SimulationSandbox.new()
	var cfg: Dictionary = _make_config()
	var f: Array = _make_factions()
	sandbox.start(cfg, 42, f[0], f[1])
	sandbox.set_playback_speed(1.0)
	# Increase tick_budget for long runs.
	sandbox.tick_budget = 10000
	var ticks: int = _advance_for(sandbox, 60.0, 0.016)
	# At 1x, 60 real seconds → 60 * 20 = 1200 ticks. Allow ±5% tolerance.
	_check(ticks >= 1140 and ticks <= 1260, "1x: ~1200 ticks in 60s (got %d)" % ticks)


func _test_ticks_at_2x() -> void:
	var sandbox := SimulationSandbox.new()
	var cfg: Dictionary = _make_config()
	var f: Array = _make_factions()
	sandbox.start(cfg, 42, f[0], f[1])
	sandbox.set_playback_speed(2.0)
	sandbox.tick_budget = 10000
	var ticks: int = _advance_for(sandbox, 60.0, 0.016)
	# At 2x, 60 real seconds → 120 * 20 = 2400 ticks.
	_check(ticks >= 2280 and ticks <= 2520, "2x: ~2400 ticks in 60s (got %d)" % ticks)


func _test_ticks_at_4x() -> void:
	var sandbox := SimulationSandbox.new()
	var cfg: Dictionary = _make_config()
	var f: Array = _make_factions()
	sandbox.start(cfg, 42, f[0], f[1])
	sandbox.set_playback_speed(4.0)
	sandbox.tick_budget = 10000
	var ticks: int = _advance_for(sandbox, 60.0, 0.016)
	# At 4x, 60 real seconds → 240 * 20 = 4800 ticks.
	_check(ticks >= 4560 and ticks <= 5040, "4x: ~4800 ticks in 60s (got %d)" % ticks)


func _test_pause_zero_ticks() -> void:
	var sandbox := SimulationSandbox.new()
	var cfg: Dictionary = _make_config()
	var f: Array = _make_factions()
	sandbox.start(cfg, 42, f[0], f[1])
	# Record initial ticks (captains spawned, tick 0).
	var before: int = sandbox.get_tick_count()
	# Pause and advance.
	sandbox.set_playback_speed(0.0)
	var ticks_after: int = _advance_for(sandbox, 5.0, 0.016)
	_check(ticks_after == before, "pause: 0 new ticks while paused (before=%d, after=%d)" % [before, ticks_after])


func _test_toggle_pause() -> void:
	var sandbox := SimulationSandbox.new()
	var cfg: Dictionary = _make_config()
	var f: Array = _make_factions()
	sandbox.start(cfg, 42, f[0], f[1])
	_check(not sandbox.paused, "toggle: starts unpaused")
	sandbox.toggle_pause()
	_check(sandbox.paused, "toggle: paused after first toggle")
	_check(sandbox.playback_speed == 0.0, "toggle: speed is 0.0 when paused")
	sandbox.toggle_pause()
	_check(not sandbox.paused, "toggle: unpaused after second toggle")
	_check(sandbox.playback_speed == 1.0, "toggle: speed restored to 1.0")


func _test_reset_clean() -> void:
	var sandbox := SimulationSandbox.new()
	var cfg: Dictionary = _make_config()
	var f: Array = _make_factions()
	sandbox.start(cfg, 42, f[0], f[1])
	sandbox.tick_budget = 10000
	# Advance significantly.
	_advance_for(sandbox, 10.0, 0.016)
	_check(sandbox.get_tick_count() > 0, "reset: ticks > 0 before reset")
	# Reset.
	sandbox.reset(99)
	var snap: Dictionary = sandbox.world.get_snapshot()
	_check(int(snap["tick"]) == 0, "reset: tick is 0 after reset")
	_check(float(snap["elapsed"]) == 0.0, "reset: elapsed is 0 after reset")
	# Pools should be clean: only captains active (2 captains in captain pool).
	var ps: Dictionary = snap["pool_stats"]
	_check(int(ps["champion"]["active"]) == 0, "reset: champion active=0")
	_check(int(ps["guardian"]["active"]) == 0, "reset: guardian active=0")
	_check(int(ps["striker"]["active"]) == 0, "reset: striker active=0")
	_check(int(ps["projectile"]["active"]) == 0, "reset: projectile active=0")
	# Units should be 2 captains.
	_check((snap["units"] as Array).size() == 2, "reset: 2 captains after reset")


func _test_multiple_resets() -> void:
	var sandbox := SimulationSandbox.new()
	var cfg: Dictionary = _make_config()
	var f: Array = _make_factions()
	sandbox.start(cfg, 42, f[0], f[1])
	sandbox.tick_budget = 10000
	# Run 3 consecutive rounds.
	for round_idx in 3:
		_advance_for(sandbox, 10.0, 0.016)
		sandbox.reset(100 + round_idx)
		var snap: Dictionary = sandbox.world.get_snapshot()
		_check(int(snap["tick"]) == 0, "multi_reset[%d]: tick=0 after reset" % round_idx)
		var ps: Dictionary = snap["pool_stats"]
		_check(int(ps["champion"]["active"]) == 0, "multi_reset[%d]: champion=0" % round_idx)
		_check(int(ps["projectile"]["active"]) == 0, "multi_reset[%d]: projectile=0" % round_idx)


func _test_speed_change() -> void:
	var sandbox := SimulationSandbox.new()
	var cfg: Dictionary = _make_config()
	var f: Array = _make_factions()
	sandbox.start(cfg, 42, f[0], f[1])
	# Start at 1x, advance a bit.
	sandbox.set_playback_speed(1.0)
	sandbox.tick_budget = 10000
	_advance_for(sandbox, 2.0, 0.016)
	var ticks_1x: int = sandbox.get_tick_count()
	_check(ticks_1x > 0, "speed_change: some ticks at 1x")
	# Switch to 4x.
	sandbox.set_playback_speed(4.0)
	_advance_for(sandbox, 2.0, 0.016)
	var ticks_after: int = sandbox.get_tick_count()
	# At 4x, 2 seconds adds ~160 ticks. Total should be much more than 1x only.
	_check(ticks_after > ticks_1x + 100, "speed_change: 4x adds significantly more ticks (got %d, was %d)" % [ticks_after, ticks_1x])


# --- Helpers ---

func _check(condition: bool, message: String) -> void:
	if condition:
		_passed += 1
	else:
		_fail_case(message)


func _fail_case(message: String) -> void:
	_failed += 1
	printerr("FAIL " + message)
