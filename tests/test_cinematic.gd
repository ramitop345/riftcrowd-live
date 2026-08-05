# Headless cinematic-director test. Run from the project root:
#   godot --headless --script res://tests/test_cinematic.gd
# Drives real frames so the director's marks, tweens, FX spawns and camera
# choreography all run exactly as in-game — no GPU rendering needed.
# Verifies both gift cutscenes (tier 2 galaxy, tier 3 lion) end cleanly,
# spawn and free their FX, move the camera away and back to the master
# framing, call play_technique on the right units, and that the director
# rejects overlapping plays and empty teams. Exit 0 on success, 1 on failure.
extends SceneTree

const DirectorScript := preload("res://scripts/arena/cinematic_director.gd")

## Pump-loop safety cap: no cinematic should need anywhere near this many
## frames (galaxy 5.6 s, lion 6.4 s).
const MAX_FRAMES: int = 400000


## Stand-in for a live unit visual (the BaseUnit3D surface the director uses).
class FakeUnit extends Node3D:
	var faction: int = 0
	var dead: bool = false
	var last_tier: int = 0

	func get_faction_index() -> int:
		return faction

	func is_dead() -> bool:
		return dead

	func play_technique(tier: int) -> void:
		last_tier = tier


var _passed: int = 0
var _failed: int = 0


func _initialize() -> void:
	_run()


func _run() -> void:
	# Let the tree finish booting so global transforms resolve cleanly.
	await process_frame
	var director: Node = DirectorScript.new()
	root.add_child(director)
	var arena := Node3D.new()
	root.add_child(arena)
	var camera := Camera3D.new()
	camera.position = DirectorScript.MASTER_POS
	camera.fov = DirectorScript.MASTER_FOV
	root.add_child(camera)
	director.call("setup", arena, camera)
	director.connect("finished", _on_finished)

	var u1 := FakeUnit.new()
	u1.faction = 0
	u1.position = Vector3(-4.0, 1.0, 0.0)
	root.add_child(u1)
	var u2 := FakeUnit.new()
	u2.faction = 1
	u2.position = Vector3(4.0, 1.0, 0.0)
	root.add_child(u2)
	var visuals: Dictionary = {101: u1, 202: u2}
	var fx_container: Node3D = director.get("_fx_container")

	# --- Tier 2 galaxy: faction 0 caster channels a meteor rain. ---
	director.call("play_galaxy", 0, visuals)
	_check(bool(director.call("is_playing")), "galaxy: starts playing")
	_check(u1.last_tier == 2, "galaxy: caster plays tier-2 technique anim")
	_check(u2.last_tier == 0, "galaxy: enemy untouched")
	# Overlapping play must be ignored (the first scene keeps running).
	director.call("play_galaxy", 1, visuals)
	var galaxy_stats: Dictionary = await _pump_until_done(director, fx_container)
	_check(not bool(director.call("is_playing")), "galaxy: stops playing")
	_check(_finished_count == 1, "galaxy: finished emitted exactly once")
	_check(int(galaxy_stats["max_fx"]) > 0, "galaxy: meteors/flashes spawned mid-scene")
	_check(bool(galaxy_stats["cam_moved"]), "galaxy: camera leaves master framing")
	_check(bool(galaxy_stats["fov_changed"]), "galaxy: fov animated (close-up / wide cuts)")
	_check(camera.position.distance_to(DirectorScript.MASTER_POS) < 0.5, "galaxy: camera returns to master")
	_check(absf(camera.fov - DirectorScript.MASTER_FOV) < 0.5, "galaxy: fov returns to master")
	await _drain_frames(3)
	_check(fx_container.get_child_count() == 0, "galaxy: all FX freed after the scene")

	# --- Tier 3 lion: faction 1 builds and drops the energy ball. ---
	u1.last_tier = 0
	u2.last_tier = 0
	director.call("play_lion", 1, visuals)
	_check(bool(director.call("is_playing")), "lion: starts playing")
	_check(u2.last_tier == 3, "lion: whole team plays tier-3 technique anim")
	_check(u1.last_tier == 0, "lion: enemy untouched")
	var lion_stats: Dictionary = await _pump_until_done(director, fx_container)
	_check(not bool(director.call("is_playing")), "lion: stops playing")
	_check(_finished_count == 2, "lion: finished emitted exactly once")
	_check(int(lion_stats["max_fx"]) > 0, "lion: energy ball/explosion spawned mid-scene")
	_check(bool(lion_stats["cam_moved"]), "lion: camera leaves master framing")
	_check(camera.position.distance_to(DirectorScript.MASTER_POS) < 0.5, "lion: camera returns to master")
	await _drain_frames(3)
	_check(fx_container.get_child_count() == 0, "lion: all FX freed after the scene")

	# --- Edge cases: empty teams must finish immediately without playing. ---
	director.call("play_lion", 0, {})
	_check(_finished_count == 3, "lion: empty team emits finished immediately")
	_check(not bool(director.call("is_playing")), "lion: empty team never starts")
	u1.dead = true
	director.call("play_galaxy", 0, visuals)
	_check(_finished_count == 4, "galaxy: all-dead team emits finished immediately")
	_check(not bool(director.call("is_playing")), "galaxy: all-dead team never starts")
	u1.dead = false

	print("CINEMATIC TESTS: %d passed, %d failed" % [_passed, _failed])
	quit(0 if _failed == 0 else 1)


var _finished_count: int = 0


func _on_finished() -> void:
	_finished_count += 1


## Pump real frames until the director finishes; sample FX load, camera travel
## and fov animation on the way. Returns the collected stats.
func _pump_until_done(director: Node, fx_container: Node3D) -> Dictionary:
	var max_fx: int = 0
	var cam_moved := false
	var fov_changed := false
	var frames: int = 0
	while bool(director.call("is_playing")) and frames < MAX_FRAMES:
		await process_frame
		frames += 1
		max_fx = maxi(max_fx, fx_container.get_child_count())
		if director.get("_camera") != null:
			var cam: Camera3D = director.get("_camera")
			if cam.position.distance_to(DirectorScript.MASTER_POS) > 1.0:
				cam_moved = true
			if absf(cam.fov - DirectorScript.MASTER_FOV) > 2.0:
				fov_changed = true
	if frames >= MAX_FRAMES:
		_fail_case("pump: cinematic never finished within %d frames" % MAX_FRAMES)
	# Let the closing marks (return-to-master tween, impact FX frees) settle.
	await _drain_frames(60)
	return {"max_fx": max_fx, "cam_moved": cam_moved, "fov_changed": fov_changed}


func _drain_frames(count: int) -> void:
	for _i in count:
		await process_frame


func _check(condition: bool, message: String) -> void:
	if condition:
		_passed += 1
	else:
		_fail_case(message)


func _fail_case(message: String) -> void:
	_failed += 1
	printerr("FAIL " + message)
