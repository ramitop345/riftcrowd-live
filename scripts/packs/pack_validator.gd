## Pure, static content-pack validator mirroring the shared TypeScript contract
## (shared/schemas/packs.ts: ContentPackSchema, FactionSchema, buildKeywordIndex,
## matchJoinKeyword). Pack data is authored, but it still crosses a trust
## boundary into the game, so every field is bounded and shaped; anything else is
## rejected, not truncated.
##
## Every parse_* function is side-effect-free: it never mutates or sanitizes the
## input, it only reports whether the input matches the contract. Results are
## Dictionaries of the shape { "ok": bool, "value": Dictionary or null,
## "errors": Array[String] } where each error is "path.to.field: reason" and an
## array element is addressed as "factions[2].joinKeywords[1]" so callers (and
## tests) can point at the offending entry.
##
## Contract notes mirrored from Zod:
## - Pack and faction objects are strict: unknown keys are validation errors.
## - schemaVersion must be exactly the literal 1.
## - JSON numbers arrive as floats in Godot, so integer fields are accepted as
##   floats only when they are whole numbers (and never as bools or strings).
## - Cross-faction rules: faction ids are unique within a pack, and join keywords
##   are unique case-insensitively across ALL factions of a pack. The issue is
##   attached to the LATER (colliding) entry, exactly like superRefine does.
class_name PackValidator
extends RefCounted

const CONTENT_PACK_SCHEMA_VERSION: int = 1

## Mirrors ContentPackModeSchema in shared/schemas/packs.ts.
const CONTENT_PACK_MODES: PackedStringArray = [
	"countries",
	"animals",
	"fan_crews_original",
	"cities",
]

const MIN_FACTIONS: int = 2
const MAX_FACTIONS: int = 4
const MIN_JOIN_KEYWORDS: int = 1
const MAX_JOIN_KEYWORDS: int = 8
const MAX_ID_LENGTH: int = 64
const MAX_DISPLAY_NAME_LENGTH: int = 64
const MAX_KEYWORD_LENGTH: int = 32
const MAX_CAPTAIN_SCENE_LENGTH: int = 256
const CAPTAIN_SCENE_PREFIX: String = "res://"
const CAPTAIN_SCENE_SUFFIX: String = ".tscn"

## Comment text is untrusted provider input; only this many leading characters
## are ever inspected by match_join_keyword. Longer input is not an error, the
## tail is simply ignored. Mirrors MAX_JOIN_TEXT_INSPECT_LENGTH.
const MAX_JOIN_TEXT_INSPECT_LENGTH: int = 200

## Strict keys of a pack object (z.object().strict()).
const PACK_KEYS: PackedStringArray = [
	"schemaVersion",
	"id",
	"displayName",
	"mode",
	"factions",
]

## Strict keys of a faction object (z.object().strict()).
const FACTION_KEYS: PackedStringArray = [
	"id",
	"displayName",
	"joinKeywords",
	"primaryColor",
	"secondaryColor",
	"pattern",
	"captainScene",
	"ultimateId",
]

## Stable machine identifiers: lowercase snake_case (SNAKE_CASE_ID).
const _SNAKE_CASE_PATTERN: String = "^[a-z][a-z0-9_]*$"

## Flat `#RRGGBB` hex color, no alpha, no shorthand (HEX_COLOR).
const _HEX_COLOR_PATTERN: String = "^#[0-9A-Fa-f]{6}$"

## First whitespace-delimited token of an already trimmed string.
const _FIRST_TOKEN_PATTERN: String = "^\\S+"

const _SNAKE_CASE_REASON: String = "must be lowercase snake_case"
const _HEX_COLOR_REASON: String = "must be a #RRGGBB hex color"

static var _snake_case_regex: RegEx = RegEx.create_from_string(_SNAKE_CASE_PATTERN)
static var _hex_color_regex: RegEx = RegEx.create_from_string(_HEX_COLOR_PATTERN)
static var _first_token_regex: RegEx = RegEx.create_from_string(_FIRST_TOKEN_PATTERN)


## Validates one ContentPack. Accepts any Variant because parsed JSON can be any
## root type. Returns { ok, value, errors }.
static func parse_pack(data: Variant) -> Dictionary:
	if typeof(data) != TYPE_DICTIONARY:
		return _reject_non_object()
	var pack: Dictionary = data
	var errors: Array[String] = []
	_validate_pack(pack, "", errors)
	return _result(pack, errors)


## Validates one Faction on its own. Useful for pinpointing a single authored
## entry; parse_pack covers the same ground plus the cross-faction rules.
static func parse_faction(data: Variant) -> Dictionary:
	if typeof(data) != TYPE_DICTIONARY:
		return _reject_non_object()
	var faction: Dictionary = data
	var errors: Array[String] = []
	_validate_faction(faction, "", errors)
	return _result(faction, errors)


## Builds the lookup used to resolve a viewer comment to a faction: lowercased
## join keyword -> faction id. Mirrors buildKeywordIndex, except that GDScript
## has no exceptions: a collision (only reachable for an unvalidated or
## hand-built pack, since parse_pack rejects it) is reported through push_error
## and the FIRST claimant is kept, so the result is never silently ambiguous.
## Malformed entries are skipped instead of crashing.
static func build_keyword_index(pack: Dictionary) -> Dictionary:
	var index: Dictionary = {}
	var factions: Variant = pack.get("factions")
	if typeof(factions) != TYPE_ARRAY:
		return index
	for entry: Variant in (factions as Array):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var faction: Dictionary = entry
		var faction_id: Variant = faction.get("id")
		var keywords: Variant = faction.get("joinKeywords")
		if typeof(faction_id) != TYPE_STRING or typeof(keywords) != TYPE_ARRAY:
			continue
		for keyword: Variant in (keywords as Array):
			if typeof(keyword) != TYPE_STRING:
				continue
			var lowered: String = (keyword as String).to_lower()
			if index.has(lowered) and index[lowered] != faction_id:
				push_error(
					"PackValidator: join keyword \"%s\" claimed by both \"%s\" and \"%s\"; keeping \"%s\""
					% [lowered, index[lowered], faction_id, index[lowered]]
				)
				continue
			index[lowered] = faction_id
	return index


## Resolves untrusted comment text to a faction id, or "" when the comment is
## not a join. Mirrors matchJoinKeyword: the text is capped at
## MAX_JOIN_TEXT_INSPECT_LENGTH characters, trimmed, lowercased, and only the
## FIRST whitespace-delimited token is compared against the keyword index. So
## "lions forever" joins the lions, but "go lions" does not — a join must lead
## with its keyword. Never fails on weird input: non-string, empty,
## whitespace-only, and multi-kilobyte values all return "" (raw_text is a
## Variant so a non-string payload is refused, mirroring the TS guard).
static func match_join_keyword(pack: Dictionary, raw_text: Variant) -> String:
	if typeof(raw_text) != TYPE_STRING:
		return ""
	var inspected := (raw_text as String).substr(0, MAX_JOIN_TEXT_INSPECT_LENGTH).strip_edges()
	if inspected.is_empty():
		return ""
	var token_match := _first_token_regex.search(inspected.to_lower())
	if token_match == null:
		return ""
	var token := token_match.get_string()
	var index := build_keyword_index(pack)
	if not index.has(token):
		return ""
	return String(index[token])


## Strict ContentPack body.
static func _validate_pack(data: Dictionary, prefix: String, errors: Array[String]) -> void:
	_check_unknown_keys(data, PACK_KEYS, prefix, errors)
	_check_version_literal(data, "schemaVersion", CONTENT_PACK_SCHEMA_VERSION, prefix, errors)
	_check_pattern_string(data, "id", MAX_ID_LENGTH, _snake_case_regex, _SNAKE_CASE_REASON, prefix, errors)
	_check_string(data, "displayName", 1, MAX_DISPLAY_NAME_LENGTH, true, prefix, errors)
	_check_enum(data, "mode", CONTENT_PACK_MODES, prefix, errors)
	var factions_path := _field_path(prefix, "factions")
	if not data.has("factions"):
		errors.append(factions_path + ": required")
		return
	if typeof(data["factions"]) != TYPE_ARRAY:
		errors.append(factions_path + ": expected an array")
		return
	var factions: Array = data["factions"]
	if factions.size() < MIN_FACTIONS:
		errors.append(factions_path + ": too few entries (min %d)" % MIN_FACTIONS)
	elif factions.size() > MAX_FACTIONS:
		errors.append(factions_path + ": too many entries (max %d)" % MAX_FACTIONS)
	for i in factions.size():
		var entry: Variant = factions[i]
		var entry_path := _index_path(factions_path, i)
		if typeof(entry) != TYPE_DICTIONARY:
			errors.append(entry_path + ": expected an object")
			continue
		_validate_faction(entry, entry_path, errors)
	_check_cross_faction_rules(factions, factions_path, errors)


## Strict Faction body.
static func _validate_faction(data: Dictionary, prefix: String, errors: Array[String]) -> void:
	_check_unknown_keys(data, FACTION_KEYS, prefix, errors)
	_check_pattern_string(data, "id", MAX_ID_LENGTH, _snake_case_regex, _SNAKE_CASE_REASON, prefix, errors)
	_check_string(data, "displayName", 1, MAX_DISPLAY_NAME_LENGTH, true, prefix, errors)
	_check_join_keywords(data, prefix, errors)
	_check_pattern_string(data, "primaryColor", 0, _hex_color_regex, _HEX_COLOR_REASON, prefix, errors)
	_check_pattern_string(data, "secondaryColor", 0, _hex_color_regex, _HEX_COLOR_REASON, prefix, errors)
	_check_pattern_string(data, "pattern", MAX_ID_LENGTH, _snake_case_regex, _SNAKE_CASE_REASON, prefix, errors)
	_check_captain_scene(data, prefix, errors)
	_check_pattern_string(data, "ultimateId", MAX_ID_LENGTH, _snake_case_regex, _SNAKE_CASE_REASON, prefix, errors)


## joinKeywords: 1..8 strings of 1..32 characters each.
static func _check_join_keywords(data: Dictionary, prefix: String, errors: Array[String]) -> void:
	var path := _field_path(prefix, "joinKeywords")
	if not data.has("joinKeywords"):
		errors.append(path + ": required")
		return
	if typeof(data["joinKeywords"]) != TYPE_ARRAY:
		errors.append(path + ": expected an array")
		return
	var keywords: Array = data["joinKeywords"]
	if keywords.size() < MIN_JOIN_KEYWORDS:
		errors.append(path + ": too few entries (min %d)" % MIN_JOIN_KEYWORDS)
	elif keywords.size() > MAX_JOIN_KEYWORDS:
		errors.append(path + ": too many entries (max %d)" % MAX_JOIN_KEYWORDS)
	for i in keywords.size():
		_check_string_value(keywords[i], _index_path(path, i), 1, MAX_KEYWORD_LENGTH, errors)


## captainScene: bounded string that must start with res:// and end with .tscn.
static func _check_captain_scene(data: Dictionary, prefix: String, errors: Array[String]) -> void:
	var path := _field_path(prefix, "captainScene")
	if not data.has("captainScene"):
		errors.append(path + ": required")
		return
	var value: Variant = data["captainScene"]
	if typeof(value) != TYPE_STRING:
		errors.append(path + ": expected a string")
		return
	var text: String = value
	if text.length() > MAX_CAPTAIN_SCENE_LENGTH:
		errors.append(path + ": too long (max %d)" % MAX_CAPTAIN_SCENE_LENGTH)
	if not text.begins_with(CAPTAIN_SCENE_PREFIX):
		errors.append(path + ": must start with " + CAPTAIN_SCENE_PREFIX)
	if not text.ends_with(CAPTAIN_SCENE_SUFFIX):
		errors.append(path + ": must end with " + CAPTAIN_SCENE_SUFFIX)


## Cross-faction rules from superRefine: faction ids unique within the pack, and
## join keywords unique case-insensitively across every faction. Both issues are
## attached to the later (colliding) entry so the fix location is unambiguous.
## Entries that already failed the per-faction shape checks are skipped.
static func _check_cross_faction_rules(factions: Array, prefix: String, errors: Array[String]) -> void:
	var seen_ids: Dictionary = {}
	var seen_keywords: Dictionary = {}
	for i in factions.size():
		var entry: Variant = factions[i]
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var faction: Dictionary = entry
		var faction_id: Variant = faction.get("id")
		if typeof(faction_id) != TYPE_STRING:
			continue
		var id_text: String = faction_id
		var entry_path := _index_path(prefix, i)
		if seen_ids.has(id_text):
			errors.append(
				"%s.id: duplicate faction id \"%s\" within pack" % [entry_path, id_text]
			)
		else:
			seen_ids[id_text] = i
		var keywords: Variant = faction.get("joinKeywords")
		if typeof(keywords) != TYPE_ARRAY:
			continue
		var keyword_list: Array = keywords
		var keywords_path := _field_path(entry_path, "joinKeywords")
		for j in keyword_list.size():
			var keyword: Variant = keyword_list[j]
			if typeof(keyword) != TYPE_STRING:
				continue
			var lowered: String = (keyword as String).to_lower()
			if seen_keywords.has(lowered):
				errors.append(
					"%s: duplicate join keyword \"%s\" (already claimed by faction \"%s\")"
					% [_index_path(keywords_path, j), keyword, seen_keywords[lowered]]
				)
			else:
				seen_keywords[lowered] = id_text


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


## Array element path, e.g. "factions[2]".
static func _index_path(prefix: String, index: int) -> String:
	return "%s[%d]" % [prefix, index]


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


## Bounded string that must also match a regex (z.string().max(n).regex(...)).
## A max_length of 0 means the schema sets no explicit length bound and the
## regex alone fixes the shape, as for the hex colors.
static func _check_pattern_string(data: Dictionary, key: String, max_length: int, regex: RegEx, reason: String, prefix: String, errors: Array[String]) -> void:
	var path := _field_path(prefix, key)
	if not data.has(key):
		errors.append(path + ": required")
		return
	var value: Variant = data[key]
	if typeof(value) != TYPE_STRING:
		errors.append(path + ": expected a string")
		return
	var text: String = value
	if max_length > 0 and text.length() > max_length:
		errors.append(path + ": too long (max %d)" % max_length)
		return
	if regex.search(text) == null:
		errors.append(path + ": " + reason)


## Integer literal support: JSON numbers parse as floats in Godot, so
## whole-valued floats are accepted; bools, strings, and fractions are not.
static func _is_whole_number(value: Variant) -> bool:
	if typeof(value) == TYPE_INT:
		return true
	if typeof(value) == TYPE_FLOAT:
		var number: float = value
		return is_finite(number) and is_equal_approx(floorf(number), number)
	return false
