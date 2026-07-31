## Results screen: placeholder round summary with replay/menu navigation.
extends Control

const Ui := preload("res://scripts/ui/ui_config.gd")

@onready var _safe_area: MarginContainer = $SafeArea
@onready var _heading_label: Label = $SafeArea/Layout/HeadingLabel
@onready var _play_again_button: Button = $SafeArea/Layout/PlayAgainButton
@onready var _main_menu_button: Button = $SafeArea/Layout/MainMenuButton


func _ready() -> void:
	Ui.apply_safe_margins(_safe_area)
	_heading_label.add_theme_font_size_override("font_size", Ui.FONT_SIZE_HEADING)
	_play_again_button.pressed.connect(_on_play_again_pressed)
	_main_menu_button.pressed.connect(_on_main_menu_pressed)
	_play_again_button.grab_focus()


func _on_play_again_pressed() -> void:
	AppState.goto(AppState.Screen.LOBBY)


func _on_main_menu_pressed() -> void:
	AppState.goto(AppState.Screen.MAIN_MENU)
