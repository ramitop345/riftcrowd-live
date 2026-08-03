## Guardian 3D visual — mace + shield, melee/defend.
extends BaseUnit3D

func _ready() -> void:
	_class_name = "guardian"
	_attack_anim = ANIM_MELEE
	_glb_path = "res://assets/models/characters/RC_Guardian_Meshy_v2.glb"
	_blue_glb_path = "res://assets/models/characters/RC_Blue_Guardian.glb"
	_red_glb_path = "res://assets/models/characters/RC_Red_Guardian.glb"
	super._ready()
