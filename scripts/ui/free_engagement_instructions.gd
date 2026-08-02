## FreeEngagementInstructions (Phase 12) — non-intrusive HUD element displaying
## free participation instructions. Displayed as prominently as gift actions.
##
## Shows:
##   - "Follow for Guardian (60s cooldown)"
##   - "Share for Shield (30s cooldown)"
##   - "!strategy <option> to vote"
##   - "!ability for free energy"
##   - "Like milestones: 10/50/100/500"
class_name FreeEngagementInstructions
extends VBoxContainer

@onready var title_label: Label = $TitleLabel
@onready var follow_label: Label = $FollowLabel
@onready var share_label: Label = $ShareLabel
@onready var strategy_label: Label = $StrategyLabel
@onready var ability_label: Label = $AbilityLabel
@onready var milestones_label: Label = $MilestonesLabel

## Configuration for instruction text (can be updated from config hot-reload)
var _follow_cooldown: int = 60
var _share_cooldown: int = 30
var _milestones: Array = [10, 50, 100, 500]

func _ready() -> void:
	_update_text()

## Updates instruction text from config values
func update_config(follow_cooldown_s: int, share_cooldown_s: int, milestones: Array) -> void:
	_follow_cooldown = follow_cooldown_s
	_share_cooldown = share_cooldown_s
	_milestones = milestones
	_update_text()

func _update_text() -> void:
	if title_label:
		title_label.text = "FREE ENGAGEMENT"
	if follow_label:
		follow_label.text = "Follow for Guardian (%ds cooldown)" % _follow_cooldown
	if share_label:
		share_label.text = "Share for Shield (%ds cooldown)" % _share_cooldown
	if strategy_label:
		strategy_label.text = "!strategy <option> to vote"
	if ability_label:
		ability_label.text = "!ability for free energy"
	if milestones_label:
		var milestone_strs: Array = []
		for m in _milestones:
			milestone_strs.append(str(m))
		milestones_label.text = "Like milestones: %s" % "/".join(milestone_strs)
