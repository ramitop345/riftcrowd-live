## Boss 3D visual — Meshy Rift Guardian, routed through the shared translation
## layer. Legacy BOSS_* clip names resolve via keyword fallback on old GLBs.
extends BaseUnit3D

func _ready() -> void:
	_class_name = "boss"
	_attack_anim = ANIM_MELEE
	_glb_path = "res://assets/models/characters/RC_Boss_Meshy.glb"
	_blue_glb_path = "res://assets/models/characters/RC_RiftGuardian_Boss.glb"
	_red_glb_path = "res://assets/models/characters/RC_RiftGuardian_Boss.glb"
	super._ready()
	# Override health bar height for the taller boss.
	if _health_bar != null:
		_health_bar.position.y = 3.5
	var bg: Node = get_node_or_null("HealthBarBg")
	if bg != null:
		bg.position = Vector3(0, 3.5, -0.01)
