## Pure, static validators mirroring the shared TypeScript protocol contract
## (shared/schemas/events.ts, commands.ts, messages.ts). These DTOs are the only
## ingress shape the game accepts; raw provider payloads never reach this layer.
##
## Every parse_* function is side-effect-free: it never mutates or sanitizes the
## input, it only reports whether the input matches the contract. Results are
## Dictionaries of the shape { "ok": bool, "value": Dictionary or null,
## "errors": Array[String] } where each error is "path.to.field: reason".
##
## Contract notes mirrored from Zod:
## - All object schemas are strict: unknown keys are validation errors.
## - schemaVersion / protocolVersion must be exactly the literal 1.
## - JSON numbers arrive as floats in Godot, so integer fields are accepted as
##   floats only when they are whole numbers (and never as bools or strings).
## - Datetimes must match ISO 8601 with an explicit Z or numeric UTC offset,
##   mirroring what Zod's z.string().datetime() accepts.
class_name ProtocolValidator
extends RefCounted

const EVENT_SCHEMA_VERSION: int = 1
const COMMAND_SCHEMA_VERSION: int = 7
const PROTOCOL_VERSION: int = 1

## Mirrors LiveEventTypeSchema in shared/schemas/events.ts.
const LIVE_EVENT_TYPES: PackedStringArray = [
	"chat",
	"like",
	"follow",
	"share",
	"gift",
	"subscribe",
	"join",
	"provider_status",
]

## Mirrors GameCommandTypeSchema in shared/schemas/commands.ts.
const GAME_COMMAND_TYPES: PackedStringArray = [
	"JOIN_FACTION",
	"SPAWN_CHAMPION",
	"ADD_ENERGY",
	"ADD_SHIELD",
	"SPAWN_SQUAD",
	"CAST_ABILITY",
	"START_WORLD_EVENT",
	"DISPLAY_SPOTLIGHT",
	"PAUSE_EVENTS",
	"END_ROUND",
	"GIFT_APPLY",
	"FOLLOW_GUARDIAN",
	"SHARE_SHIELD",
	"STRATEGY_VOTE",
	"FREE_ENERGY_ABILITY",
	"ADD_SCORE",
	"SPAWN_VFX",
	"SPOTLIGHT_CARD",
	"SUPPORTER_CALLOUT",
	"CAMERA_IMPULSE",
	"PLAY_AUDIO",
	"SET_WINDOW_MODE",
	"ACTIVATE_FALLBACK",
	"DEACTIVATE_FALLBACK",
	"SET_QUALITY_TIER",
	"CAST_TECHNIQUE",
]

## Mirrors ProtocolErrorCodeSchema in shared/schemas/messages.ts.
const PROTOCOL_ERROR_CODES: PackedStringArray = [
	"INVALID_MESSAGE",
	"UNSUPPORTED_VERSION",
	"UNAUTHORIZED",
	"QUEUE_FULL",
	"INTERNAL",
]

## Every `kind` the ProtocolMessage union discriminates on.
const MESSAGE_KINDS: PackedStringArray = [
	"event",
	"command",
	"ack",
	"error",
	"snapshot",
	"heartbeat",
]

## Date, "T", time, optional fractional seconds, then "Z" or a numeric UTC
## offset. Plain local datetimes (no timezone designator) are rejected.
const _ISO_DATETIME_PATTERN: String = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"

static var _iso_datetime_regex: RegEx = RegEx.create_from_string(_ISO_DATETIME_PATTERN)


## Validates one NormalizedLiveEvent. Accepts any Variant because parsed JSON
## can be any root type. Returns { ok, value, errors }.
static func parse_event(data: Variant) -> Dictionary:
	if typeof(data) != TYPE_DICTIONARY:
		return _reject_non_object()
	var object: Dictionary = data
	var errors: Array[String] = []
	_validate_event(object, "", errors)
	return _result(object, errors)


## Validates one GameCommand. Accepts any Variant because parsed JSON can be
## any root type. Returns { ok, value, errors }.
static func parse_command(data: Variant) -> Dictionary:
	if typeof(data) != TYPE_DICTIONARY:
		return _reject_non_object()
	var object: Dictionary = data
	var errors: Array[String] = []
	_validate_command(object, "", errors)
	return _result(object, errors)


## Validates one ProtocolMessage envelope, discriminating on `kind` and
## recursively validating an embedded event or command. Accepts any Variant
## because parsed JSON can be any root type. Returns { ok, value, errors }.
static func parse_message(raw: Variant) -> Dictionary:
	if typeof(raw) != TYPE_DICTIONARY:
		return _reject_non_object()
	var data: Dictionary = raw
	var errors: Array[String] = []
	if not data.has("kind"):
		errors.append("kind: required")
		return _result(data, errors)
	var kind: Variant = data["kind"]
	if typeof(kind) != TYPE_STRING or not MESSAGE_KINDS.has(kind):
		errors.append("kind: unknown message kind")
		return _result(data, errors)
	_check_version_literal(data, "protocolVersion", PROTOCOL_VERSION, "", errors)
	match kind:
		"event":
			_check_unknown_keys(data, ["protocolVersion", "kind", "event"], "", errors)
			if not data.has("event"):
				errors.append("event: required")
			elif typeof(data["event"]) != TYPE_DICTIONARY:
				errors.append("event: expected an object")
			else:
				_validate_event(data["event"], "event", errors)
		"command":
			_check_unknown_keys(data, ["protocolVersion", "kind", "command"], "", errors)
			if not data.has("command"):
				errors.append("command: required")
			elif typeof(data["command"]) != TYPE_DICTIONARY:
				errors.append("command: expected an object")
			else:
				_validate_command(data["command"], "command", errors)
		"ack":
			_check_unknown_keys(data, ["protocolVersion", "kind", "commandId", "receivedAt"], "", errors)
			_check_string(data, "commandId", 1, 128, true, "", errors)
			_check_datetime(data, "receivedAt", true, "", errors)
		"error":
			_check_unknown_keys(data, ["protocolVersion", "kind", "code", "message", "relatedId"], "", errors)
			_check_enum(data, "code", PROTOCOL_ERROR_CODES, "", errors)
			_check_string(data, "message", 1, 500, true, "", errors)
			_check_string(data, "relatedId", 1, 128, false, "", errors)
		"snapshot":
			_check_unknown_keys(data, ["protocolVersion", "kind", "sentAt", "state"], "", errors)
			_check_datetime(data, "sentAt", true, "", errors)
			if not data.has("state"):
				errors.append("state: required")
			elif typeof(data["state"]) != TYPE_DICTIONARY:
				errors.append("state: expected an object")
			else:
				var state: Dictionary = data["state"]
				for key: Variant in state.keys():
					if typeof(key) != TYPE_STRING:
						errors.append("state: keys must be strings")
						break
		"heartbeat":
			_check_unknown_keys(data, ["protocolVersion", "kind", "sentAt", "sequence"], "", errors)
			_check_datetime(data, "sentAt", true, "", errors)
			_check_int(data, "sequence", 0.0, INF, true, "", errors)
	return _result(data, errors)


## Strict NormalizedLiveEvent body, shared between parse_event and the `event` envelope.
static func _validate_event(data: Dictionary, prefix: String, errors: Array[String]) -> void:
	_check_unknown_keys(
		data,
		["schemaVersion", "id", "provider", "type", "receivedAt", "user", "comment", "likeCount", "gift", "rawHash"],
		prefix,
		errors
	)
	_check_version_literal(data, "schemaVersion", EVENT_SCHEMA_VERSION, prefix, errors)
	_check_string(data, "id", 1, 128, true, prefix, errors)
	_check_string(data, "provider", 1, 128, true, prefix, errors)
	_check_enum(data, "type", LIVE_EVENT_TYPES, prefix, errors)
	_check_datetime(data, "receivedAt", true, prefix, errors)
	var user_path := _field_path(prefix, "user")
	if not data.has("user"):
		errors.append(user_path + ": required")
	elif typeof(data["user"]) != TYPE_DICTIONARY:
		errors.append(user_path + ": expected an object")
	else:
		_validate_user(data["user"], user_path, errors)
	_check_string(data, "comment", 0, 500, false, prefix, errors)
	_check_int(data, "likeCount", 0.0, 1_000_000.0, false, prefix, errors)
	var gift_path := _field_path(prefix, "gift")
	if data.has("gift"):
		if typeof(data["gift"]) != TYPE_DICTIONARY:
			errors.append(gift_path + ": expected an object")
		else:
			_validate_gift(data["gift"], gift_path, errors)
	_check_string(data, "rawHash", 1, 128, true, prefix, errors)


## Strict LiveUser object.
static func _validate_user(data: Dictionary, prefix: String, errors: Array[String]) -> void:
	_check_unknown_keys(data, ["id", "handle", "displayName"], prefix, errors)
	_check_string(data, "id", 1, 128, true, prefix, errors)
	_check_string(data, "handle", 1, 128, true, prefix, errors)
	_check_string(data, "displayName", 1, 64, true, prefix, errors)


## Strict LiveGift object.
static func _validate_gift(data: Dictionary, prefix: String, errors: Array[String]) -> void:
	_check_unknown_keys(
		data,
		["id", "name", "repeatCount", "streakId", "streakEnded", "providerValue"],
		prefix,
		errors
	)
	_check_string(data, "id", 1, 128, true, prefix, errors)
	_check_string(data, "name", 1, 128, true, prefix, errors)
	_check_int(data, "repeatCount", 1.0, 100_000.0, true, prefix, errors)
	_check_string(data, "streakId", 1, 128, false, prefix, errors)
	_check_bool(data, "streakEnded", prefix, errors)
	_check_number(data, "providerValue", 0.0, false, prefix, errors)


## Strict GameCommand body, shared between parse_command and the `command` envelope.
static func _validate_command(data: Dictionary, prefix: String, errors: Array[String]) -> void:
	_check_unknown_keys(
		data,
		[
			"schemaVersion",
			"id",
			"type",
			"createdAt",
			"factionId",
			"viewerId",
			"displayName",
			"amount",
			"abilityId",
			"sourceEventIds",
			"expiresAt",
			"metadata"
		],
		prefix,
		errors
	)
	_check_version_literal(data, "schemaVersion", COMMAND_SCHEMA_VERSION, prefix, errors)
	_check_string(data, "id", 1, 128, true, prefix, errors)
	_check_enum(data, "type", GAME_COMMAND_TYPES, prefix, errors)
	_check_datetime(data, "createdAt", true, prefix, errors)
	_check_string(data, "factionId", 1, 128, false, prefix, errors)
	_check_string(data, "viewerId", 1, 128, false, prefix, errors)
	_check_string(data, "displayName", 1, 64, false, prefix, errors)
	_check_number(data, "amount", -INF, false, prefix, errors)
	_check_string(data, "abilityId", 1, 128, false, prefix, errors)
	var ids_path := _field_path(prefix, "sourceEventIds")
	if not data.has("sourceEventIds"):
		errors.append(ids_path + ": required")
	elif typeof(data["sourceEventIds"]) != TYPE_ARRAY:
		errors.append(ids_path + ": expected an array")
	else:
		var ids: Array = data["sourceEventIds"]
		if ids.size() > 1000:
			errors.append(ids_path + ": too many entries (max 1000)")
		for i in ids.size():
			_check_string_value(ids[i], "%s[%d]" % [ids_path, i], 1, 128, errors)
	_check_datetime(data, "expiresAt", false, prefix, errors)
	var metadata_path := _field_path(prefix, "metadata")
	if data.has("metadata"):
		if typeof(data["metadata"]) != TYPE_DICTIONARY:
			errors.append(metadata_path + ": expected an object")
		else:
			_validate_metadata(data["metadata"], metadata_path, errors)


## Flat record of bounded primitives: string(max 500) | finite number | bool.
static func _validate_metadata(data: Dictionary, prefix: String, errors: Array[String]) -> void:
	for key: Variant in data.keys():
		var path := _field_path(prefix, str(key))
		if typeof(key) != TYPE_STRING:
			errors.append(path + ": keys must be strings")
			continue
		var key_string: String = key
		if key_string.length() < 1 or key_string.length() > 128:
			errors.append(path + ": key length must be 1..128")
		var value: Variant = data[key]
		match typeof(value):
			TYPE_STRING:
				if (value as String).length() > 500:
					errors.append(path + ": too long (max 500)")
			TYPE_BOOL:
				pass
			TYPE_INT:
				pass
			TYPE_FLOAT:
				if not is_finite(value):
					errors.append(path + ": must be a finite number")
			_:
				errors.append(path + ": must be a string, finite number, or boolean")


static func _result(data: Dictionary, errors: Array[String]) -> Dictionary:
	if errors.is_empty():
		return {"ok": true, "value": data, "errors": errors}
	return {"ok": false, "value": null, "errors": errors}


## Standard rejection for JSON roots that are not objects (numbers, arrays,
## strings, null): same result shape as _result with a single root error.
static func _reject_non_object() -> Dictionary:
	var errors: Array[String] = ["root: expected an object"]
	return _result({}, errors)


static func _field_path(prefix: String, key: String) -> String:
	if prefix.is_empty():
		return key
	return prefix + "." + key


## Strict-object guard: any key outside `allowed` is a validation error.
static func _check_unknown_keys(data: Dictionary, allowed: PackedStringArray, prefix: String, errors: Array[String]) -> void:
	for key: Variant in data.keys():
		if typeof(key) != TYPE_STRING or not allowed.has(key):
			errors.append(_field_path(prefix, str(key)) + ": unknown key")


## Exact version literal (z.literal). Bools and non-whole numbers are rejected.
static func _check_version_literal(data: Dictionary, key: String, expected: int, prefix: String, errors: Array[String]) -> void:
	var path := _field_path(prefix, key)
	if not data.has(key):
		errors.append(path + ": required")
		return
	var value: Variant = data[key]
	if not _is_whole_number(value) or int(value) != expected:
		errors.append(path + ": must be the literal %d" % expected)


static func _check_string(data: Dictionary, key: String, min_length: int, max_length: int, required: bool, prefix: String, errors: Array[String]) -> void:
	var path := _field_path(prefix, key)
	if not data.has(key):
		if required:
			errors.append(path + ": required")
		return
	_check_string_value(data[key], path, min_length, max_length, errors)


static func _check_string_value(value: Variant, path: String, min_length: int, max_length: int, errors: Array[String]) -> void:
	if typeof(value) != TYPE_STRING:
		errors.append(path + ": expected a string")
		return
	var text: String = value
	if text.length() < min_length:
		errors.append(path + ": too short (min %d)" % min_length)
	elif text.length() > max_length:
		errors.append(path + ": too long (max %d)" % max_length)


static func _check_enum(data: Dictionary, key: String, options: PackedStringArray, prefix: String, errors: Array[String]) -> void:
	var path := _field_path(prefix, key)
	if not data.has(key):
		errors.append(path + ": required")
		return
	var value: Variant = data[key]
	if typeof(value) != TYPE_STRING or not options.has(value):
		errors.append(path + ": not an allowed value")


static func _check_datetime(data: Dictionary, key: String, required: bool, prefix: String, errors: Array[String]) -> void:
	var path := _field_path(prefix, key)
	if not data.has(key):
		if required:
			errors.append(path + ": required")
		return
	var value: Variant = data[key]
	if typeof(value) != TYPE_STRING or _iso_datetime_regex.search(value) == null:
		errors.append(path + ": not an ISO 8601 datetime")


## Integer field (z.number().int()). JSON numbers parse as floats in Godot, so
## whole-valued floats are accepted; bools, strings, and fractions are not.
static func _check_int(data: Dictionary, key: String, min_value: float, max_value: float, required: bool, prefix: String, errors: Array[String]) -> void:
	var path := _field_path(prefix, key)
	if not data.has(key):
		if required:
			errors.append(path + ": required")
		return
	var value: Variant = data[key]
	if not _is_whole_number(value):
		errors.append(path + ": expected a whole number")
		return
	var number := float(value)
	if number < min_value:
		errors.append(path + ": below minimum (%d)" % int(min_value))
	elif number > max_value:
		errors.append(path + ": above maximum (%d)" % int(max_value))


## Finite number field (z.number().finite()), optionally bounded below.
static func _check_number(data: Dictionary, key: String, min_value: float, required: bool, prefix: String, errors: Array[String]) -> void:
	var path := _field_path(prefix, key)
	if not data.has(key):
		if required:
			errors.append(path + ": required")
		return
	var value: Variant = data[key]
	if not _is_finite_number(value):
		errors.append(path + ": expected a finite number")
		return
	if float(value) < min_value:
		errors.append(path + ": must not be negative")


static func _check_bool(data: Dictionary, key: String, prefix: String, errors: Array[String]) -> void:
	if data.has(key) and typeof(data[key]) != TYPE_BOOL:
		errors.append(_field_path(prefix, key) + ": expected a boolean")


static func _is_whole_number(value: Variant) -> bool:
	if typeof(value) == TYPE_INT:
		return true
	if typeof(value) == TYPE_FLOAT:
		var number: float = value
		return is_finite(number) and is_equal_approx(floorf(number), number)
	return false


static func _is_finite_number(value: Variant) -> bool:
	if typeof(value) == TYPE_INT:
		return true
	if typeof(value) == TYPE_FLOAT:
		return is_finite(value)
	return false
