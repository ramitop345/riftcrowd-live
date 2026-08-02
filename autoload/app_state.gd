## Application screen state machine (autoload "AppState").
##
## Owns the current screen and the validated transition table. Screens never
## call change_scene_to_file directly; they call AppState.goto so every
## transition is checked against ALLOWED. can_transition is a pure static
## function so the headless shell test can exercise the table without a
## scene tree.
extends Node

signal screen_changed(from_screen: int, to_screen: int)

## PACK_PREVIEW is appended so the existing screen values stay stable.
enum Screen { BOOT, MAIN_MENU, LOBBY, BATTLE, RESULTS, PACK_PREVIEW }

const SCENE_PATHS: Dictionary = {
	Screen.BOOT: "res://scenes/Boot.tscn",
	Screen.MAIN_MENU: "res://scenes/MainMenu.tscn",
	Screen.LOBBY: "res://scenes/Lobby.tscn",
	Screen.BATTLE: "res://scenes/Battle.tscn",
	Screen.RESULTS: "res://scenes/Results.tscn",
	Screen.PACK_PREVIEW: "res://scenes/PackPreview.tscn",
}

## Allowed transitions: source screen -> array of reachable screens. The pack
## preview is a menu side trip: it is reachable only from the main menu and only
## returns there, so it can never be entered from or exit into a live round.
const ALLOWED: Dictionary = {
	Screen.BOOT: [Screen.MAIN_MENU],
	Screen.MAIN_MENU: [Screen.LOBBY, Screen.PACK_PREVIEW],
	Screen.LOBBY: [Screen.BATTLE, Screen.MAIN_MENU],
	Screen.BATTLE: [Screen.RESULTS],
	Screen.RESULTS: [Screen.LOBBY, Screen.MAIN_MENU],
	Screen.PACK_PREVIEW: [Screen.MAIN_MENU],
}

var current: Screen = Screen.BOOT


## Pure transition-table lookup. Unknown source screens allow nothing.
static func can_transition(from_screen: int, to_screen: int) -> bool:
	if not ALLOWED.has(from_screen):
		return false
	var targets: Array = ALLOWED[from_screen]
	return targets.has(to_screen)


## Validates the transition, then swaps the active scene. Returns false (and
## surfaces the problem in debug builds) when the transition is not allowed
## or the target scene fails to load.
func goto(to_screen: Screen) -> bool:
	if not can_transition(current, to_screen):
		push_warning("Invalid screen transition: %d -> %d" % [current, to_screen])
		if OS.is_debug_build():
			var overlay: Node = get_node_or_null("/root/ErrorOverlay")
			if overlay != null and overlay.has_method("show_error"):
				overlay.call("show_error", "Invalid transition")
		return false
	var from_screen := current
	var scene_path: String = SCENE_PATHS[to_screen]
	current = to_screen
	var error := get_tree().change_scene_to_file(scene_path)
	if error != OK:
		push_error("Failed to change scene to %s (error %d)" % [scene_path, error])
		current = from_screen
		return false
	screen_changed.emit(from_screen, to_screen)
	return true
