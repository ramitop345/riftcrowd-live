# Headless application-shell smoke test. Run from the game/ directory:
#   godot --headless --script res://tests/test_shell.gd
# Verifies that every shell scene loads and instantiates with a Control root,
# that the AppState transition table matches the Phase 3 design plus the Phase 4
# pack-preview side trip (allowed and forbidden pairs), that every screen
# registered in SCENE_PATHS points at an existing scene file, that the UiConfig
# safe-zone margins and typography sizes are sane, that ErrorOverlay message
# sanitization strips control characters and enforces the length cap,
# that the Arena and all unit scenes load, that all 16 captain faction scenes
# load with Node2D roots, and that the SimulationSandbox speed values match.
# Exit code 0 on success, 1 on any failure.
extends SceneTree

const AppStateScript := preload("res://autoload/app_state.gd")
const UiConfigScript := preload("res://scripts/ui/ui_config.gd")
const ErrorOverlayScript := preload("res://autoload/error_overlay.gd")
const SandboxScript := preload("res://scripts/simulation/simulation_sandbox.gd")

## Readability floor for any font size shipped in the portrait shell.
const MIN_READABLE_FONT_SIZE: int = 20

const SCENE_FILES: PackedStringArray = [
	"res://scenes/Boot.tscn",
	"res://scenes/MainMenu.tscn",
	"res://scenes/Lobby.tscn",
	"res://scenes/Battle.tscn",
	"res://scenes/Results.tscn",
	"res://scenes/PackPreview.tscn",
	"res://scenes/ErrorOverlay.tscn",
]

const UNIT_SCENE_FILES: PackedStringArray = [
	"res://scenes/units/Fortress.tscn",
	"res://scenes/units/Crown.tscn",
	"res://scenes/units/CaptureZone.tscn",
	"res://scenes/units/Champion.tscn",
	"res://scenes/units/Guardian.tscn",
	"res://scenes/units/Striker.tscn",
	"res://scenes/units/Captain.tscn",
	"res://scenes/units/Projectile.tscn",
	"res://scenes/units/Boss.tscn",
]

const CAPTAIN_SCENE_FILES: PackedStringArray = [
	"res://scenes/units/captain_lions.tscn",
	"res://scenes/units/captain_wolves.tscn",
	"res://scenes/units/captain_eagles.tscn",
	"res://scenes/units/captain_dragons.tscn",
	"res://scenes/units/captain_germany.tscn",
	"res://scenes/units/captain_france.tscn",
	"res://scenes/units/captain_brazil.tscn",
	"res://scenes/units/captain_nigeria.tscn",
	"res://scenes/units/captain_solaris_bay.tscn",
	"res://scenes/units/captain_ironspire.tscn",
	"res://scenes/units/captain_verdant_heights.tscn",
	"res://scenes/units/captain_mistral_harbor.tscn",
	"res://scenes/units/captain_crimson_forge.tscn",
	"res://scenes/units/captain_royal_comets.tscn",
	"res://scenes/units/captain_harbor_kings.tscn",
	"res://scenes/units/captain_northern_ravens.tscn",
]

var _passed: int = 0
var _failed: int = 0


func _initialize() -> void:
	_check_scenes()
	_check_transitions()
	_check_scene_paths_registered()
	_check_ui_config()
	_check_typography()
	_check_sanitize()
	_check_arena_scene()
	_check_unit_scenes()
	_check_captain_scenes()
	_check_sandbox_speeds()
	if _passed < 74:
		_fail_case("expected >= 74 assertions, got %d" % _passed)
	print("SHELL TESTS: %d passed, %d failed" % [_passed, _failed])
	quit(0 if _failed == 0 else 1)


## Every shell scene must load as a PackedScene and instantiate a Control root.
func _check_scenes() -> void:
	for path: String in SCENE_FILES:
		var packed: Resource = ResourceLoader.load(path)
		if packed == null or not (packed is PackedScene):
			_fail_case("%s: failed to load as a PackedScene" % path)
			continue
		_passed += 1
		var instance: Node = (packed as PackedScene).instantiate()
		if instance == null:
			_fail_case("%s: failed to instantiate" % path)
			continue
		if instance is Control:
			_passed += 1
		else:
			_fail_case("%s: root is %s, expected Control" % [path, instance.get_class()])
		instance.free()


## The static transition table must match the Phase 3 design plus the Phase 4
## pack-preview side trip (menu <-> preview only).
func _check_transitions() -> void:
	var allowed: Array = [
		[AppStateScript.Screen.BOOT, AppStateScript.Screen.MAIN_MENU],
		[AppStateScript.Screen.MAIN_MENU, AppStateScript.Screen.LOBBY],
		[AppStateScript.Screen.LOBBY, AppStateScript.Screen.BATTLE],
		[AppStateScript.Screen.LOBBY, AppStateScript.Screen.MAIN_MENU],
		[AppStateScript.Screen.BATTLE, AppStateScript.Screen.RESULTS],
		[AppStateScript.Screen.RESULTS, AppStateScript.Screen.LOBBY],
		[AppStateScript.Screen.RESULTS, AppStateScript.Screen.MAIN_MENU],
		[AppStateScript.Screen.MAIN_MENU, AppStateScript.Screen.PACK_PREVIEW],
		[AppStateScript.Screen.PACK_PREVIEW, AppStateScript.Screen.MAIN_MENU],
	]
	var forbidden: Array = [
		[AppStateScript.Screen.BOOT, AppStateScript.Screen.BATTLE],
		[AppStateScript.Screen.BATTLE, AppStateScript.Screen.MAIN_MENU],
		[AppStateScript.Screen.MAIN_MENU, AppStateScript.Screen.RESULTS],
		[AppStateScript.Screen.PACK_PREVIEW, AppStateScript.Screen.BATTLE],
	]
	for pair: Array in allowed:
		if AppStateScript.can_transition(pair[0], pair[1]):
			_passed += 1
		else:
			_fail_case("transition %d -> %d: expected allowed" % [pair[0], pair[1]])
	for pair: Array in forbidden:
		if AppStateScript.can_transition(pair[0], pair[1]):
			_fail_case("transition %d -> %d: expected forbidden" % [pair[0], pair[1]])
		else:
			_passed += 1


## Every screen in SCENE_PATHS must point at a scene file that exists.
func _check_scene_paths_registered() -> void:
	for screen: int in AppStateScript.SCENE_PATHS.keys():
		var path: String = AppStateScript.SCENE_PATHS[screen]
		if ResourceLoader.exists(path):
			_passed += 1
		else:
			_fail_case("SCENE_PATHS[%d]: %s does not exist" % [screen, path])


## Safe-zone margins must all be positive pixel values.
func _check_ui_config() -> void:
	var margins: Dictionary = {
		"SAFE_TOP": UiConfigScript.SAFE_TOP,
		"SAFE_RIGHT": UiConfigScript.SAFE_RIGHT,
		"SAFE_BOTTOM": UiConfigScript.SAFE_BOTTOM,
		"SAFE_LEFT": UiConfigScript.SAFE_LEFT,
	}
	for margin_name: String in margins.keys():
		var value: int = margins[margin_name]
		if value > 0:
			_passed += 1
		else:
			_fail_case("UiConfigScript.%s: expected a positive value, got %d" % [margin_name, value])


## Typography constants must be positive and stay above the readability floor,
## since screen scripts apply them as font-size overrides.
func _check_typography() -> void:
	var sizes: Dictionary = {
		"FONT_SIZE_HEADING": UiConfigScript.FONT_SIZE_HEADING,
		"FONT_SIZE_BODY": UiConfigScript.FONT_SIZE_BODY,
		"FONT_SIZE_SMALL": UiConfigScript.FONT_SIZE_SMALL,
	}
	for size_name: String in sizes.keys():
		var value: int = sizes[size_name]
		if value >= MIN_READABLE_FONT_SIZE:
			_passed += 1
		else:
			_fail_case(
				"UiConfigScript.%s: expected >= %d, got %d"
				% [size_name, MIN_READABLE_FONT_SIZE, value]
			)


## ErrorOverlay._sanitize is a pure static function, so untrusted-text handling
## can be verified here without building the overlay scene.
func _check_sanitize() -> void:
	var hostile := "Hello" + char(10) + "World" + char(13) + char(127)
	var cleaned: String = ErrorOverlayScript._sanitize(hostile)
	if cleaned == "HelloWorld":
		_passed += 1
	else:
		_fail_case("_sanitize: control characters not stripped, got %s" % cleaned)

	var cap: int = ErrorOverlayScript.MAX_MESSAGE_LENGTH
	var truncated: String = ErrorOverlayScript._sanitize("a".repeat(400))
	if truncated.length() == cap:
		_passed += 1
	else:
		_fail_case("_sanitize: expected truncation to %d chars, got %d" % [cap, truncated.length()])

	var plain := "Battle failed to start."
	if ErrorOverlayScript._sanitize(plain) == plain:
		_passed += 1
	else:
		_fail_case("_sanitize: plain message was altered")


## Arena scene loads and has a Node2D root.
func _check_arena_scene() -> void:
	var packed: Resource = ResourceLoader.load("res://scenes/Arena.tscn")
	if packed != null and (packed is PackedScene):
		_passed += 1
		var instance: Node = (packed as PackedScene).instantiate()
		if instance is Node2D:
			_passed += 1
		else:
			_fail_case("Arena.tscn: root is %s, expected Node2D" % instance.get_class())
		instance.free()
	else:
		_fail_case("Arena.tscn: failed to load as PackedScene")


## All 9 unit scenes load successfully.
func _check_unit_scenes() -> void:
	for path: String in UNIT_SCENE_FILES:
		var packed: Resource = ResourceLoader.load(path)
		if packed != null and (packed is PackedScene):
			_passed += 1
			var instance: Node = (packed as PackedScene).instantiate()
			instance.free()
		else:
			_fail_case("%s: failed to load" % path)


## All 16 captain faction scenes load and have Node2D roots.
func _check_captain_scenes() -> void:
	for path: String in CAPTAIN_SCENE_FILES:
		var packed: Resource = ResourceLoader.load(path)
		if packed == null or not (packed is PackedScene):
			_fail_case("%s: failed to load" % path)
			continue
		_passed += 1
		var instance: Node = (packed as PackedScene).instantiate()
		if instance is Node2D:
			_passed += 1
		else:
			_fail_case("%s: root is %s, expected Node2D" % [path, instance.get_class()])
		instance.free()


## SimulationSandbox SPEED_VALUES must be exactly [0.0, 0.5, 1.0, 2.0, 4.0].
func _check_sandbox_speeds() -> void:
	var speeds: Array = SandboxScript.SPEED_VALUES
	if speeds.size() == 5:
		_passed += 1
	else:
		_fail_case("SPEED_VALUES: expected 5 entries, got %d" % speeds.size())
	var expected: Array = [0.0, 0.5, 1.0, 2.0, 4.0]
	for i in expected.size():
		if i < speeds.size() and float(speeds[i]) == float(expected[i]):
			_passed += 1
		else:
			_fail_case("SPEED_VALUES[%d]: expected %.1f" % [i, float(expected[i])])


func _fail_case(message: String) -> void:
	_failed += 1
	printerr("FAIL " + message)
