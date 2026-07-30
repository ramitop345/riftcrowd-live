# Headless protocol fixture test. Run from the game/ directory:
#   godot --headless --script res://tests/test_protocol.gd
# Parses the SHARED fixture files (same source of truth as the TypeScript
# tests) and exits 0 only when every valid fixture parses ok, every invalid
# fixture payload is rejected, and non-object JSON roots are rejected.
extends SceneTree

const Validator := preload("res://scripts/protocol/protocol_validator.gd")

const EXPECTED_VALID_EVENTS: int = 8
const EXPECTED_INVALID_EVENTS: int = 10
const EXPECTED_VALID_MESSAGES: int = 6
const EXPECTED_INVALID_MESSAGES: int = 7
const NON_OBJECT_ROOTS: PackedStringArray = ["42", "[]"]

var _passed: int = 0
var _failed: int = 0


func _initialize() -> void:
	_check_valid("valid-events.json", EXPECTED_VALID_EVENTS, "event")
	_check_invalid("invalid-events.json", EXPECTED_INVALID_EVENTS, "event")
	_check_valid("valid-messages.json", EXPECTED_VALID_MESSAGES, "message")
	_check_invalid("invalid-messages.json", EXPECTED_INVALID_MESSAGES, "message")
	_check_non_object_roots()
	print("PROTOCOL TESTS: %d passed, %d failed" % [_passed, _failed])
	quit(0 if _failed == 0 else 1)


## Every entry of a valid fixture must parse ok.
func _check_valid(fixture: String, expected_count: int, parse_kind: String) -> void:
	var entries: Variant = _load_fixture(fixture)
	if typeof(entries) != TYPE_ARRAY:
		_fail_case("%s: fixture failed to load or is not a JSON array" % fixture)
		return
	var list: Array = entries
	if list.size() != expected_count:
		_fail_case("%s: expected %d entries, found %d" % [fixture, expected_count, list.size()])
	for i in list.size():
		var entry: Variant = list[i]
		if typeof(entry) != TYPE_DICTIONARY:
			_fail_case("%s[%d]: entry is not an object" % [fixture, i])
			continue
		var result: Dictionary = _parse(parse_kind, entry)
		if result["ok"]:
			_passed += 1
		else:
			var reasons := ", ".join(PackedStringArray(result["errors"]))
			_fail_case("%s[%d]: expected valid, got errors: %s" % [fixture, i, reasons])


## Every wrapper's `.event` payload in an invalid fixture must be rejected.
func _check_invalid(fixture: String, expected_count: int, parse_kind: String) -> void:
	var entries: Variant = _load_fixture(fixture)
	if typeof(entries) != TYPE_ARRAY:
		_fail_case("%s: fixture failed to load or is not a JSON array" % fixture)
		return
	var list: Array = entries
	if list.size() != expected_count:
		_fail_case("%s: expected %d wrappers, found %d" % [fixture, expected_count, list.size()])
	for i in list.size():
		var wrapper: Variant = list[i]
		if typeof(wrapper) != TYPE_DICTIONARY:
			_fail_case("%s[%d]: wrapper is not an object" % [fixture, i])
			continue
		var label: String = str((wrapper as Dictionary).get("label", "entry %d" % i))
		var payload: Variant = (wrapper as Dictionary).get("event")
		if typeof(payload) != TYPE_DICTIONARY:
			_fail_case("%s[%s]: wrapper has no `event` object payload" % [fixture, label])
			continue
		var result: Dictionary = _parse(parse_kind, payload)
		if result["ok"]:
			_fail_case("%s[%s]: expected rejection but payload parsed ok" % [fixture, label])
		else:
			_passed += 1


## parse_message must reject JSON roots that are not objects (e.g. a bare
## number or an array) instead of crashing on a typed Dictionary parameter.
func _check_non_object_roots() -> void:
	for raw: String in NON_OBJECT_ROOTS:
		var result: Dictionary = Validator.parse_message(JSON.parse_string(raw))
		if result["ok"]:
			_fail_case("non-object root %s: expected rejection but payload parsed ok" % raw)
		else:
			_passed += 1


func _parse(parse_kind: String, data: Dictionary) -> Dictionary:
	match parse_kind:
		"event":
			return Validator.parse_event(data)
		"message":
			return Validator.parse_message(data)
	return {"ok": false, "value": null, "errors": ["unknown parse kind: " + parse_kind]}


## Reads a fixture from the shared location (never copied into game/).
## Returns the parsed JSON Variant, or null on any load/parse failure.
func _load_fixture(file_name: String) -> Variant:
	var path := ProjectSettings.globalize_path("res://").path_join("../shared/fixtures").path_join(file_name).simplify_path()
	if not FileAccess.file_exists(path):
		printerr("Fixture not found: " + path)
		return null
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		printerr("Fixture could not be opened: " + path)
		return null
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed == null:
		printerr("Fixture is not valid JSON: " + path)
	return parsed


func _fail_case(message: String) -> void:
	_failed += 1
	printerr("FAIL " + message)
