## Striker 3D visual — crossbow, ranged attack.
extends BaseUnit3D

func _ready() -> void:
	_class_name = "striker"
	_attack_anim = ANIM_CROSSBOW
	_glb_path = "res://assets/models/characters/RC_Striker_Meshy_v2.glb"
	_blue_glb_path = "res://assets/models/characters/RC_Blue_Striker.glb"
	_red_glb_path = "res://assets/models/characters/RC_Red_Striker.glb"
	super._ready()
