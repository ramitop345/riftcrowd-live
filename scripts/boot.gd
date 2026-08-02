## Boot screen: shows the title card, then hands off to the main menu through
## the AppState state machine. The auto-transition only fires when Boot is the
## active scene, so the headless shell test can instantiate it safely.
extends Control

const Ui := preload("res://scripts/ui/ui_config.gd")

const BOOT_DELAY_SECONDS: float = 0.5

@onready var _safe_area: MarginContainer = $SafeArea
@onready var _heading_label: Label = $SafeArea/Layout/HeadingLabel


func _ready() -> void:
	Ui.apply_safe_margins(_safe_area)
	_heading_label.add_theme_font_size_override("font_size", Ui.FONT_SIZE_HEADING)
	print("RiftCrowd LIVE — Boot OK (Phase 3 shell)")
	if get_tree().current_scene != self:
		return
	await get_tree().create_timer(BOOT_DELAY_SECONDS).timeout
	if not is_inside_tree():
		return
	AppState.goto(AppState.Screen.MAIN_MENU)
