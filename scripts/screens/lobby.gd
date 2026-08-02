## Lobby screen: staging area before a round. Viewer factions form here once
## Phase 6/7 land; for now it only navigates forward and back.
extends Control

const Ui := preload("res://scripts/ui/ui_config.gd")

@onready var _safe_area: MarginContainer = $SafeArea
@onready var _heading_label: Label = $SafeArea/Layout/HeadingLabel
@onready var _begin_button: Button = $SafeArea/Layout/BeginButton
@onready var _back_button: Button = $SafeArea/Layout/BackButton


func _ready() -> void:
	Ui.apply_safe_margins(_safe_area)
	_heading_label.add_theme_font_size_override("font_size", Ui.FONT_SIZE_HEADING)
	_begin_button.pressed.connect(_on_begin_pressed)
	_back_button.pressed.connect(_on_back_pressed)
	_begin_button.grab_focus()


func _on_begin_pressed() -> void:
	AppState.goto(AppState.Screen.BATTLE)


func _on_back_pressed() -> void:
	AppState.goto(AppState.Screen.MAIN_MENU)
