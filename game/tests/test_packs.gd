# Headless content-pack test. Run from the repository root:
#   godot --headless --path game --script tests/test_packs.gd
# Exercises the GDScript mirror of shared/schemas/packs.ts against the SAME
# sources of truth the TypeScript tests use: the shared fixtures
# (../shared/fixtures/valid-packs.json, invalid-packs.json) and the four
# shipping launch packs under ../content/packs. Also covers the loader
# (directory scan, mode/directory match, failure reporting), the keyword
# helpers (case-insensitivity, numeric shortcuts, first-token rule, 200-char
# inspection cap, non-string guard), and the presence of every pack's
# svg/pack_icon.svg on the loader-provided path. SVG rasterization is NOT
# exercised here by design: the SVG module is unavailable headlessly, so
# load_svg_texture is left to the interactive PackPreview run. Exit code 0 on
# success, 1 on any failure.
extends SceneTree

const Validator := preload("res://scripts/packs/pack_validator.gd")
const Loader := preload("res://scripts/packs/pack_loader.gd")

const EXPECTED_VALID_PACKS: int = 2
const EXPECTED_INVALID_PACKS: int = 10
const EXPECTED_LAUNCH_PACKS: int = 4
const EXPECTED_FACTIONS_PER_LAUNCH_PACK: int = 4

## The animals pack ships 4 factions x 3 join keywords.
const EXPECTED_KEYWORD_INDEX_SIZE: int = 12

## Launch pack directory (which must equal the pack's mode) -> pack file name.
const LAUNCH_PACKS: Dictionary = {
	"animals": "animals_launch.json",
	"cities": "cities_launch.json",
	"countries": "countries_launch.json",
	"fan_crews_original": "fan_crews_original_launch.json",
}

## Pack ids the loader must return for the real content root, sorted.
const EXPECTED_PACK_IDS: PackedStringArray = [
	"animals_launch",
	"cities_launch",
	"countries_launch",
	"fan_crews_launch",
]

## [comment text, expected faction id] mirroring gateway/test/packs.test.ts.
const MATCH_CASES: Array = [
	["LION", "lions"],
	["DrAgOnS", "dragons"],
	["lions forever", "lions"],
	["  wolves\tare cool ", "wolves"],
	["go lions", ""],
	["1", "lions"],
	["4 all the way", "dragons"],
	["bears", ""],
	["", ""],
	["   \t  ", ""],
]

const NON_OBJECT_ROOTS: PackedStringArray = ["42", "[]", "\"animals_launch\""]

var _passed: int = 0
var _failed: int = 0


func _initialize() -> void:
	_check_valid_fixtures()
	_check_invalid_fixtures()
	_check_launch_packs()
	_check_pack_icons()
	_check_loader()
	_check_keyword_index()
	_check_keyword_matching()
	_check_non_object_roots()
	print("PACK TESTS: %d passed, %d failed" % [_passed, _failed])
	quit(0 if _failed == 0 else 1)


## Every entry of shared/fixtures/valid-packs.json must parse ok.
func _check_valid_fixtures() -> void:
	var entries: Variant = _load_fixture("valid-packs.json")
	if typeof(entries) != TYPE_ARRAY:
		_fail_case("valid-packs.json: fixture failed to load or is not a JSON array")
		return
	var list: Array = entries
	if list.size() != EXPECTED_VALID_PACKS:
		_fail_case(
			"valid-packs.json: expected %d entries, found %d" % [EXPECTED_VALID_PACKS, list.size()]
		)
	for i in list.size():
		var result: Dictionary = Validator.parse_pack(list[i])
		_check(
			bool(result["ok"]),
			"valid-packs.json[%d]: expected valid, got errors: %s" % [i, _join_errors(result)]
		)


## Every wrapper's `.pack` payload in shared/fixtures/invalid-packs.json must be
## rejected, and (when the fixture documents a field path) at least one error must
## name that path.
func _check_invalid_fixtures() -> void:
	var entries: Variant = _load_fixture("invalid-packs.json")
	if typeof(entries) != TYPE_ARRAY:
		_fail_case("invalid-packs.json: fixture failed to load or is not a JSON array")
		return
	var list: Array = entries
	if list.size() != EXPECTED_INVALID_PACKS:
		_fail_case(
			"invalid-packs.json: expected %d wrappers, found %d"
			% [EXPECTED_INVALID_PACKS, list.size()]
		)
	for i in list.size():
		var raw: Variant = list[i]
		if typeof(raw) != TYPE_DICTIONARY:
			_fail_case("invalid-packs.json[%d]: wrapper is not an object" % i)
			continue
		var wrapper: Dictionary = raw
		var label: String = str(wrapper.get("label", "entry %d" % i))
		if not wrapper.has("pack"):
			_fail_case("invalid-packs.json[%s]: wrapper has no `pack` payload" % label)
			continue
		var result: Dictionary = Validator.parse_pack(wrapper.get("pack"))
		_check(
			not result["ok"],
			"invalid-packs.json[%s]: expected rejection but the pack parsed ok" % label
		)
		if result["ok"]:
			continue
		# The root-level `strict()` rejection carries an empty Zod path, so there
		# is no field name to look for in that one case.
		var expected_path := _fixture_path(wrapper.get("expectedInvalidPath"))
		if expected_path.is_empty():
			continue
		var errors: Array = result["errors"]
		_check(
			_has_error_for_path(errors, expected_path),
			"invalid-packs.json[%s]: expected an error at %s, got: %s"
			% [label, expected_path, _join_errors(result)]
		)


## Every shipping launch pack must parse, ship exactly 4 factions, and declare
## the mode its directory is named after.
func _check_launch_packs() -> void:
	for mode_dir: String in LAUNCH_PACKS.keys():
		var file_name: String = LAUNCH_PACKS[mode_dir]
		var path := Loader.default_pack_root().path_join(mode_dir).path_join(file_name)
		var raw: Variant = _load_json(path)
		var result: Dictionary = Validator.parse_pack(raw)
		_check(bool(result["ok"]), "%s: expected valid, got errors: %s" % [file_name, _join_errors(result)])
		if not result["ok"]:
			continue
		var pack: Dictionary = result["value"]
		var factions: Array = pack["factions"]
		_check(
			factions.size() == EXPECTED_FACTIONS_PER_LAUNCH_PACK,
			"%s: expected %d factions, found %d"
			% [file_name, EXPECTED_FACTIONS_PER_LAUNCH_PACK, factions.size()]
		)
		_check(
			String(pack["mode"]) == mode_dir,
			"%s: mode \"%s\" does not match directory \"%s\""
			% [file_name, String(pack["mode"]), mode_dir]
		)


## Every launch pack directory must ship its icon art at the loader-provided
## path. Existence only: load_svg_texture needs the SVG module, which headless
## runs do not exercise — rasterization is covered by the interactive preview.
func _check_pack_icons() -> void:
	for mode_dir: String in LAUNCH_PACKS.keys():
		var path := Loader.pack_icon_path(Loader.default_pack_root(), mode_dir)
		_check(
			FileAccess.file_exists(path),
			"%s: missing pack icon at %s" % [mode_dir, path]
		)


## The loader must find exactly the four launch packs in the real content root,
## with no failures, and no pack may be silently dropped.
func _check_loader() -> void:
	var root := Loader.default_pack_root()
	var outcome := Loader.load_packs_from_dir(root)
	var packs: Array = outcome["packs"]
	var failures: Array = outcome["failures"]
	_check(
		packs.size() == EXPECTED_LAUNCH_PACKS,
		"load_packs_from_dir(%s): expected %d packs, got %d"
		% [root, EXPECTED_LAUNCH_PACKS, packs.size()]
	)
	_check(
		failures.is_empty(),
		"load_packs_from_dir(%s): expected no failures, got %s" % [root, _describe_failures(failures)]
	)
	var ids: Array = []
	for entry: Variant in packs:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		ids.append(String((entry as Dictionary).get("id", "")))
	ids.sort()
	var found := ", ".join(PackedStringArray(ids))
	var expected := ", ".join(EXPECTED_PACK_IDS)
	_check(found == expected, "load_packs_from_dir: expected ids [%s], got [%s]" % [expected, found])


## build_keyword_index maps every lowercased keyword to its faction id.
func _check_keyword_index() -> void:
	var animals := _load_launch_pack("animals")
	if animals.is_empty():
		return
	var index := Validator.build_keyword_index(animals)
	_check(
		index.size() == EXPECTED_KEYWORD_INDEX_SIZE,
		"build_keyword_index: expected %d entries, got %d" % [EXPECTED_KEYWORD_INDEX_SIZE, index.size()]
	)
	var expectations: Dictionary = {"lion": "lions", "wolves": "wolves", "3": "eagles"}
	for keyword: String in expectations.keys():
		var expected: String = expectations[keyword]
		_check(
			String(index.get(keyword, "")) == expected,
			"build_keyword_index[%s]: expected %s, got %s"
			% [keyword, expected, String(index.get(keyword, "<missing>"))]
		)


## Matching rules mirrored from matchJoinKeyword: case-insensitive, numeric
## shortcuts, first token only, capped inspection window, never a crash.
func _check_keyword_matching() -> void:
	var animals := _load_launch_pack("animals")
	if animals.is_empty():
		return
	for pair: Array in MATCH_CASES:
		var text: String = pair[0]
		var expected: String = pair[1]
		var actual := Validator.match_join_keyword(animals, text)
		_check(
			actual == expected,
			"match_join_keyword(%s): expected \"%s\", got \"%s\"" % [_quote(text), expected, actual]
		)
	# Hostile input: a huge string never matches and never crashes.
	_check(
		Validator.match_join_keyword(animals, "x".repeat(100_000)) == "",
		"match_join_keyword: 100k-character input should not match"
	)
	# A keyword pushed past the 200-character inspection window is ignored.
	_check(
		Validator.match_join_keyword(animals, " ".repeat(250) + "lion") == "",
		"match_join_keyword: keyword beyond the inspection window should not match"
	)
	# A keyword inside the window still matches even when the tail is huge.
	_check(
		Validator.match_join_keyword(animals, "lion " + "y".repeat(50_000)) == "lions",
		"match_join_keyword: leading keyword with a huge tail should match lions"
	)
	# Non-string input is refused by the Variant guard, mirroring the TS guard.
	_check(
		Validator.match_join_keyword(animals, 42) == "",
		"match_join_keyword: non-string input should return \"\""
	)


## parse_pack must reject JSON roots that are not objects instead of crashing on
## a typed Dictionary parameter.
func _check_non_object_roots() -> void:
	for raw: String in NON_OBJECT_ROOTS:
		var result: Dictionary = Validator.parse_pack(JSON.parse_string(raw))
		_check(
			not result["ok"],
			"non-object root %s: expected rejection but the payload parsed ok" % raw
		)


## Loads and validates one launch pack, reporting a failure and returning {} when
## it cannot be used as a fixture for the keyword tests.
func _load_launch_pack(mode_dir: String) -> Dictionary:
	var file_name: String = LAUNCH_PACKS[mode_dir]
	var path := Loader.default_pack_root().path_join(mode_dir).path_join(file_name)
	var outcome := Loader.load_pack_file(path, mode_dir)
	if not outcome["ok"]:
		var errors: Array = outcome["errors"]
		_fail_case("%s: could not be loaded: %s" % [file_name, ", ".join(PackedStringArray(errors))])
		return {}
	var pack: Dictionary = outcome["pack"]
	return pack


## Renders a fixture's expectedInvalidPath as this validator's error path, e.g.
## ["factions", 1, "joinKeywords", 0] -> "factions[1].joinKeywords[0]".
func _fixture_path(raw: Variant) -> String:
	if typeof(raw) != TYPE_ARRAY:
		return ""
	var path := ""
	for segment: Variant in (raw as Array):
		if typeof(segment) == TYPE_STRING:
			var key := String(segment)
			path = key if path.is_empty() else "%s.%s" % [path, key]
		else:
			path = "%s[%d]" % [path, int(segment)]
	return path


func _has_error_for_path(errors: Array, path: String) -> bool:
	for error: Variant in errors:
		if str(error).begins_with(path + ":"):
			return true
	return false


func _join_errors(result: Dictionary) -> String:
	var errors: Array = result["errors"]
	return ", ".join(PackedStringArray(errors))


func _describe_failures(failures: Array) -> String:
	var lines: PackedStringArray = []
	for entry: Variant in failures:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var failure: Dictionary = entry
		var errors: Array = failure.get("errors", [])
		lines.append(
			"%s (%s)" % [String(failure.get("file", "?")), ", ".join(PackedStringArray(errors))]
		)
	return "; ".join(lines)


## Keeps whitespace-only and empty test inputs readable in failure output.
func _quote(text: String) -> String:
	if text.length() > 40:
		return "\"%s...\" (%d chars)" % [text.substr(0, 40), text.length()]
	return "\"%s\"" % text


## Reads a fixture from the shared location (never copied into game/).
## Returns the parsed JSON Variant, or null on any load/parse failure.
func _load_fixture(file_name: String) -> Variant:
	var path := ProjectSettings.globalize_path("res://").path_join("../shared/fixtures").path_join(file_name).simplify_path()
	return _load_json(path)


## Reads and parses a JSON file from an absolute path outside res://.
func _load_json(path: String) -> Variant:
	if not FileAccess.file_exists(path):
		printerr("File not found: " + path)
		return null
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		printerr("File could not be opened: " + path)
		return null
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed == null:
		printerr("File is not valid JSON: " + path)
	return parsed


## Single assertion helper so the printed totals equal the number of checks.
func _check(condition: bool, message: String) -> void:
	if condition:
		_passed += 1
	else:
		_fail_case(message)


func _fail_case(message: String) -> void:
	_failed += 1
	printerr("FAIL " + message)
