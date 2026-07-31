## Battle screen: portrait layout budget stubs (top status, battlefield,
## event spotlight, instruction bar). The simulation arrives in Phase 5.
extends Control

const Ui := preload("res://scripts/ui/ui_config.gd")

@onready var _safe_area: MarginContainer = $SafeArea
@onready var _heading_label: Label = $SafeArea/Layout/HeadingLabel
@onready var _end_battle_button: Button = $SafeArea/Layout/InstructionRegion/InstructionContent/InstructionLayout/EndBattleButton


func _ready() -> void:
	Ui.apply_safe_margins(_safe_area)
	_heading_label.add_theme_font_size_override("font_size", Ui.FONT_SIZE_HEADING)
	_end_battle_button.pressed.connect(_on_end_battle_pressed)
	_end_battle_button.grab_focus()


func _on_end_battle_pressed() -> void:
	AppState.goto(AppState.Screen.RESULTS)
