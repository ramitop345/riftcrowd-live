## Boss 3D visual — Rift Guardian, unique rig and animations.
extends BaseUnit3D

# Boss animation names differ from humanoids.
const BOSS_IDLE: String = "RC_ACT_BossIdle"
const BOSS_WALK: String = "RC_ACT_BossWalk"
const BOSS_MACE: String = "RC_ACT_BossMaceAttack"
const BOSS_SLAM: String = "RC_ACT_BossGroundSlam"
const BOSS_HIT: String = "RC_ACT_BossHitReact"
const BOSS_SPAWN: String = "RC_ACT_BossSpawn"
const BOSS_DEATH: String = "RC_ACT_BossDeath"

func _ready() -> void:
	_class_name = "boss"
	_attack_anim = BOSS_MACE
	_blue_glb_path = "res://assets/models/characters/RC_RiftGuardian_Boss.glb"
	_red_glb_path = "res://assets/models/characters/RC_RiftGuardian_Boss.glb"
	super._ready()
	# Override health bar height for the taller boss.
	if _health_bar != null:
		_health_bar.position.y = 3.5
	var bg: Node = get_node_or_null("HealthBarBg")
	if bg != null:
		bg.position = Vector3(0, 3.5, -0.01)


## Override to use boss-specific animation names.
func update_visual(unit_snapshot: Dictionary) -> void:
	var sx: float = float(unit_snapshot.get("x", 0.0))
	var sy: float = float(unit_snapshot.get("y", 0.0))
	position = Vector3(
		(sx / SIM_W) * ARENA_W - ARENA_W * 0.5,
		GROUND_Y,
		-((sy / SIM_H) * ARENA_H - ARENA_H * 0.5)
	)
	var new_faction: int = int(unit_snapshot.get("faction", -1))
	if new_faction != _faction_index:
		_faction_index = new_faction
		_swap_model(new_faction)
	var new_health: float = clampf(float(unit_snapshot.get("health_fraction", 1.0)), 0.0, 1.0)
	if new_health < _prev_health - 0.01:
		_hit_flash = 1.0
		_play_anim(BOSS_HIT)
	_prev_health = new_health
	_health_fraction = new_health
	_update_health_bar()
	var state: String = str(unit_snapshot.get("state", "")).to_lower()
	if state == "dead":
		if not _dead:
			_dead = true
			_play_anim(BOSS_DEATH)
	elif state == "spawning":
		if not _spawned:
			_spawned = true
			_play_anim(BOSS_SPAWN)
	elif state == "advance":
		_play_anim(BOSS_WALK)
	elif state == "attack":
		_play_anim(BOSS_MACE)
	else:
		_play_anim(BOSS_IDLE)
