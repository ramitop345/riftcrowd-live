# Headless audit of unit model animation clips.
# Run: godot --headless --script res://tests/audit_anims.gd
# Prints every animation clip contained by each character GLB so we can see
# exactly which clips (tech1/2/3, victory/cheer/celebrate, ...) exist.
extends SceneTree

const GLBS: Array = [
	"res://assets/models/characters/RC_Blue_Champion.glb",
	"res://assets/models/characters/RC_Red_Champion.glb",
	"res://assets/models/characters/RC_Blue_Guardian.glb",
	"res://assets/models/characters/RC_Red_Guardian.glb",
	"res://assets/models/characters/RC_Blue_Striker.glb",
	"res://assets/models/characters/RC_Red_Striker.glb",
	"res://assets/models/characters/RC_Blue_Captain.glb",
	"res://assets/models/characters/RC_Red_Captain.glb",
	"res://assets/models/characters/RC_RiftGuardian_Boss.glb",
	"res://assets/models/characters/RC_Champion_Meshy_v2.glb",
	"res://assets/models/characters/RC_Guardian_Meshy_v2.glb",
	"res://assets/models/characters/RC_Striker_Meshy_v2.glb",
	"res://assets/models/characters/RC_Captain_Meshy_v2.glb",
	"res://assets/models/characters/RC_Boss_Meshy.glb",
]


func _initialize() -> void:
	for path: String in GLBS:
		var packed: PackedScene = load(path) as PackedScene
		if packed == null:
			print("AUDIT %s: FAILED TO LOAD" % path)
			continue
		var inst: Node = packed.instantiate()
		var clips: Array = []
		_collect_animations(inst, clips)
		print("AUDIT %s -> %s" % [path.get_file(), str(clips)])
		inst.free()
	quit(0)


func _collect_animations(node: Node, out: Array) -> void:
	if node is AnimationPlayer:
		for a in (node as AnimationPlayer).get_animation_list():
			out.append(str(a))
	for child in node.get_children():
		_collect_animations(child, out)
