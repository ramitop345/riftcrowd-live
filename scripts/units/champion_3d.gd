## Champion 3D visual — sword, melee attack.
extends BaseUnit3D

func _ready() -> void:
	_class_name = "champion"
	_attack_anim = ANIM_MELEE
	_glb_path = "res://assets/models/characters/RC_Champion_Meshy_v2.glb"
	_blue_glb_path = "res://assets/models/characters/RC_Blue_Champion.glb"
	_red_glb_path = "res://assets/models/characters/RC_Red_Champion.glb"
	super._ready()
