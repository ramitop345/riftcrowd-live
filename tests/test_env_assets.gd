# Headless environment-asset test. Run from the project root:
#   godot --headless --script res://tests/test_env_assets.gd
# Loads each Meshy environment GLB (Phase 4), confirms the packed scene
# resolves, and checks MeshyLod.apply() keeps only the requested distance tier
# visible so LOD0/1/2 siblings never render stacked. Exits 0 on success.
extends SceneTree

const MeshyLod := preload("res://scripts/units/meshy_lod.gd")

var _passed: int = 0
var _failed: int = 0


func _initialize() -> void:
	# asset path, requested LOD tier (mirrors the tier each consumer uses)
	_check_asset("res://assets/models/environment/env_arena_v1.glb", 1)
	_check_asset("res://assets/models/environment/env_castle_blue_v1.glb", 1)
	_check_asset("res://assets/models/environment/env_dungeon_keep_v1.glb", 1)
	_check_asset("res://assets/models/objectives/env_crown_v1.glb", 1)
	_check_asset("res://assets/models/vfx/env_capture_zone_v1.glb", 1)
	_check_asset("res://assets/models/vfx/env_projectile_v1.glb", 3)
	print("ENV ASSET TESTS: %d passed, %d failed" % [_passed, _failed])
	quit(0 if _failed == 0 else 1)


func _check_asset(path: String, tier: int) -> void:
	var packed: PackedScene = load(path) as PackedScene
	if packed == null:
		_fail(path + ": failed to load packed scene")
		return
	_passed += 1
	var root: Node = packed.instantiate()
	if root == null:
		_fail(path + ": instantiate returned null")
		return
	var all_meshes: Array = []
	_collect(root, all_meshes)
	_check(all_meshes.size() >= 2, path + ": has multiple LOD meshes (found %d)" % all_meshes.size())
	# Apply LOD selection and confirm exactly one tier stays visible.
	var kept: int = MeshyLod.apply(root, tier)
	_check(kept == 1, path + ": MeshyLod.apply(tier %d) kept exactly 1 visible mesh (got %d)" % [tier, kept])
	var visible_count: int = 0
	for m: Variant in all_meshes:
		if (m as MeshInstance3D).visible:
			visible_count += 1
	_check(visible_count == 1, path + ": only 1 mesh visible after selection (got %d)" % visible_count)
	root.queue_free()


func _collect(node: Node, out: Array) -> void:
	for child in node.get_children():
		if child is MeshInstance3D:
			out.append(child)
		_collect(child, out)


func _check(condition: bool, message: String) -> void:
	if condition:
		_passed += 1
	else:
		_fail(message)


func _fail(message: String) -> void:
	_failed += 1
	printerr("FAIL " + message)
