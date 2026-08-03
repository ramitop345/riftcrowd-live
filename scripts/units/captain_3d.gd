## Captain 3D visual — dual cannons, ranged attack.
extends BaseUnit3D

func _ready() -> void:
	_class_name = "captain"
	_attack_anim = ANIM_CANNON
	_blue_glb_path = "res://assets/models/characters/RC_Blue_Captain.glb"
	_red_glb_path = "res://assets/models/characters/RC_Red_Captain.glb"
	super._ready()
