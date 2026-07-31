## Main menu screen: entry point after boot; starts a session (lobby).
extends Control

const Ui := preload("res://scripts/ui/ui_config.gd")

@onready var _safe_area: MarginContainer = $SafeArea
@onready var _heading_label: Label = $SafeArea/Layout/HeadingLabel
@onready var _start_button: Button = $SafeArea/Layout/StartButton


func _ready() -> void:
	Ui.apply_safe_margins(_safe_area)
	_heading_label.add_theme_font_size_override("font_size", Ui.FONT_SIZE_HEADING)
	_start_button.pressed.connect(_on_start_pressed)
	_start_button.grab_focus()


func _on_start_pressed() -> void:
	AppState.goto(AppState.Screen.LOBBY)
