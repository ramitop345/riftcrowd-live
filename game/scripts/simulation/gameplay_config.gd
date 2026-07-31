## Data-driven gameplay configuration loader and validator.
## Reads res://config/gameplay.json and validates every field against strict
## allow-lists, type checks, and range constraints. Returns the same
## { ok, value, errors } shape used by ProtocolValidator and PackValidator.
##
## Tests may inject a modified config Dictionary (e.g. short stage durations)
## by calling parse() directly with a hand-built Dictionary.
class_name GameplayConfig
extends RefCounted

const CONFIG_SCHEMA_VERSION: int = 1
const CONFIG_PATH: String = "res://config/gameplay.json"

const STAGE_KEYS: PackedStringArray = ["opening", "crisis", "finalSurge", "suddenDeath"]
const UNIT_TYPES: PackedStringArray = ["champion", "guardian", "striker", "captain", "boss"]
const UNIT_STAT_KEYS: PackedStringArray = [
	"maxHealth", "attackDamage", "attackIntervalSeconds",
	"moveSpeed", "attackRange", "retreatHealthFraction",
]
const TOP_LEVEL_KEYS: PackedStringArray = [
	"schemaVersion", "tickRate", "stages", "arena", "fortressHealth",
	"capturePressureWeights", "dominion", "unitStats", "pools",
	"bots", "finalSurge", "suddenDeath", "crisis", "projectile",
]
const ARENA_KEYS: PackedStringArray = ["width", "height", "captureZoneRadius"]
const DOMINION_KEYS: PackedStringArray = ["ratePerSecondAtFullAdvantage", "smoothing"]
const POOL_KEYS: PackedStringArray = ["champion", "guardian", "striker", "projectile"]
const BOTS_KEYS: PackedStringArray = ["spawnIntervalSeconds", "unitCycle"]
const FINAL_SURGE_KEYS: PackedStringArray = ["spawnIntervalMultiplier"]
const SUDDEN_DEATH_KEYS: PackedStringArray = ["dominionRateMultiplier", "healingAllowed"]
const CRISIS_KEYS: PackedStringArray = ["bossEnabled", "bossCaptureBonus", "bossCaptureBonusSeconds"]
const PROJECTILE_KEYS: PackedStringArray = ["speed"]
const CAPTURE_WEIGHT_KEYS: PackedStringArray = ["champion", "guardian", "striker", "captain"]
const BOT_UNIT_CYCLE: PackedStringArray = ["champion", "guardian", "striker"]


## Loads and validates the default gameplay.json from res://config/.
static func load_default() -> Dictionary:
	if not FileAccess.file_exists(CONFIG_PATH):
		return _reject(["config file not found at " + CONFIG_PATH])
	var file := FileAccess.open(CONFIG_PATH, FileAccess.READ)
	if file == null:
		return _reject(["could not open config file (error %d)" % FileAccess.get_open_error()])
	var raw: Variant = JSON.parse_string(file.get_as_text())
	return parse(raw)


## Validates a raw config Dictionary. Tests call this directly with overrides.
static func parse(data: Variant) -> Dictionary:
	if typeof(data) != TYPE_DICTIONARY:
		return _reject(["root: expected an object"])
	var cfg: Dictionary = data
	var errors: Array[String] = []
	_check_unknown_keys(cfg, TOP_LEVEL_KEYS, "", errors)
	_check_version_literal(cfg, "schemaVersion", CONFIG_SCHEMA_VERSION, "", errors)
	_check_positive_int(cfg, "tickRate", 1.0, 120.0, "", errors)
	_validate_stages(cfg, errors)
	_validate_arena(cfg, errors)
	_check_positive_number(cfg, "fortressHealth", 1.0, "", errors)
	_validate_capture_weights(cfg, errors)
	_validate_dominion(cfg, errors)
	_validate_unit_stats(cfg, errors)
	_validate_pools(cfg, errors)
	_validate_bots(cfg, errors)
	_validate_final_surge(cfg, errors)
	_validate_sudden_death(cfg, errors)
	_validate_crisis(cfg, errors)
	_validate_projectile(cfg, errors)
	if errors.is_empty():
		return {"ok": true, "value": cfg, "errors": errors}
	return {"ok": false, "value": null, "errors": errors}


static func _validate_stages(cfg: Dictionary, errors: Array[String]) -> void:
	var path := "stages"
	if not cfg.has("stages"):
		errors.append(path + ": required")
		return
	if typeof(cfg["stages"]) != TYPE_DICTIONARY:
		errors.append(path + ": expected an object")
		return
	var stages: Dictionary = cfg["stages"]
	_check_unknown_keys(stages, STAGE_KEYS, path, errors)
	for key: String in STAGE_KEYS:
		_check_positive_number(stages, key, 0.1, path, errors)


static func _validate_arena(cfg: Dictionary, errors: Array[String]) -> void:
	var path := "arena"
	if not cfg.has("arena"):
		errors.append(path + ": required")
		return
	if typeof(cfg["arena"]) != TYPE_DICTIONARY:
		errors.append(path + ": expected an object")
		return
	var arena: Dictionary = cfg["arena"]
	_check_unknown_keys(arena, ARENA_KEYS, path, errors)
	_check_positive_number(arena, "width", 100.0, path, errors)
	_check_positive_number(arena, "height", 100.0, path, errors)
	_check_positive_number(arena, "captureZoneRadius", 10.0, path, errors)


static func _validate_capture_weights(cfg: Dictionary, errors: Array[String]) -> void:
	var path := "capturePressureWeights"
	if not cfg.has("capturePressureWeights"):
		errors.append(path + ": required")
		return
	if typeof(cfg["capturePressureWeights"]) != TYPE_DICTIONARY:
		errors.append(path + ": expected an object")
		return
	var weights: Dictionary = cfg["capturePressureWeights"]
	_check_unknown_keys(weights, CAPTURE_WEIGHT_KEYS, path, errors)
	for key: String in CAPTURE_WEIGHT_KEYS:
		_check_non_negative_number(weights, key, path, errors)


static func _validate_dominion(cfg: Dictionary, errors: Array[String]) -> void:
	var path := "dominion"
	if not cfg.has("dominion"):
		errors.append(path + ": required")
		return
	if typeof(cfg["dominion"]) != TYPE_DICTIONARY:
		errors.append(path + ": expected an object")
		return
	var dom: Dictionary = cfg["dominion"]
	_check_unknown_keys(dom, DOMINION_KEYS, path, errors)
	_check_positive_number(dom, "ratePerSecondAtFullAdvantage", 0.01, path, errors)
	_check_non_negative_number(dom, "smoothing", path, errors)


static func _validate_unit_stats(cfg: Dictionary, errors: Array[String]) -> void:
	var path := "unitStats"
	if not cfg.has("unitStats"):
		errors.append(path + ": required")
		return
	if typeof(cfg["unitStats"]) != TYPE_DICTIONARY:
		errors.append(path + ": expected an object")
		return
	var stats: Dictionary = cfg["unitStats"]
	var allowed: PackedStringArray = UNIT_TYPES
	_check_unknown_keys(stats, allowed, path, errors)
	for utype: String in UNIT_TYPES:
		if not stats.has(utype):
			errors.append(path + "." + utype + ": required")
			continue
		if typeof(stats[utype]) != TYPE_DICTIONARY:
			errors.append(path + "." + utype + ": expected an object")
			continue
		var us: Dictionary = stats[utype]
		var upath := path + "." + utype
		_check_unknown_keys(us, UNIT_STAT_KEYS, upath, errors)
		_check_positive_number(us, "maxHealth", 1.0, upath, errors)
		_check_positive_number(us, "attackDamage", 0.1, upath, errors)
		_check_positive_number(us, "attackIntervalSeconds", 0.05, upath, errors)
		_check_positive_number(us, "moveSpeed", 1.0, upath, errors)
		_check_positive_number(us, "attackRange", 1.0, upath, errors)
		_check_non_negative_number(us, "retreatHealthFraction", upath, errors)


static func _validate_pools(cfg: Dictionary, errors: Array[String]) -> void:
	var path := "pools"
	if not cfg.has("pools"):
		errors.append(path + ": required")
		return
	if typeof(cfg["pools"]) != TYPE_DICTIONARY:
		errors.append(path + ": expected an object")
		return
	var pools: Dictionary = cfg["pools"]
	_check_unknown_keys(pools, POOL_KEYS, path, errors)
	for key: String in POOL_KEYS:
		_check_positive_int(pools, key, 1.0, 10000.0, path, errors)


static func _validate_bots(cfg: Dictionary, errors: Array[String]) -> void:
	var path := "bots"
	if not cfg.has("bots"):
		errors.append(path + ": required")
		return
	if typeof(cfg["bots"]) != TYPE_DICTIONARY:
		errors.append(path + ": expected an object")
		return
	var bots: Dictionary = cfg["bots"]
	_check_unknown_keys(bots, BOTS_KEYS, path, errors)
	_check_positive_number(bots, "spawnIntervalSeconds", 0.1, path, errors)
	var cycle_path := path + ".unitCycle"
	if not bots.has("unitCycle"):
		errors.append(cycle_path + ": required")
	elif typeof(bots["unitCycle"]) != TYPE_ARRAY:
		errors.append(cycle_path + ": expected an array")
	else:
		var cycle: Array = bots["unitCycle"]
		for i in cycle.size():
			var v: Variant = cycle[i]
			if typeof(v) != TYPE_STRING or not BOT_UNIT_CYCLE.has(v):
				errors.append(cycle_path + "[%d]: not an allowed unit type" % i)


static func _validate_final_surge(cfg: Dictionary, errors: Array[String]) -> void:
	var path := "finalSurge"
	if not cfg.has("finalSurge"):
		errors.append(path + ": required")
		return
	if typeof(cfg["finalSurge"]) != TYPE_DICTIONARY:
		errors.append(path + ": expected an object")
		return
	var fs: Dictionary = cfg["finalSurge"]
	_check_unknown_keys(fs, FINAL_SURGE_KEYS, path, errors)
	_check_positive_number(fs, "spawnIntervalMultiplier", 0.01, path, errors)


static func _validate_sudden_death(cfg: Dictionary, errors: Array[String]) -> void:
	var path := "suddenDeath"
	if not cfg.has("suddenDeath"):
		errors.append(path + ": required")
		return
	if typeof(cfg["suddenDeath"]) != TYPE_DICTIONARY:
		errors.append(path + ": expected an object")
		return
	var sd: Dictionary = cfg["suddenDeath"]
	_check_unknown_keys(sd, SUDDEN_DEATH_KEYS, path, errors)
	_check_positive_number(sd, "dominionRateMultiplier", 0.01, path, errors)
	_check_bool(sd, "healingAllowed", path, errors)


static func _validate_crisis(cfg: Dictionary, errors: Array[String]) -> void:
	var path := "crisis"
	if not cfg.has("crisis"):
		errors.append(path + ": required")
		return
	if typeof(cfg["crisis"]) != TYPE_DICTIONARY:
		errors.append(path + ": expected an object")
		return
	var cr: Dictionary = cfg["crisis"]
	_check_unknown_keys(cr, CRISIS_KEYS, path, errors)
	_check_bool(cr, "bossEnabled", path, errors)
	_check_non_negative_number(cr, "bossCaptureBonus", path, errors)
	_check_non_negative_number(cr, "bossCaptureBonusSeconds", path, errors)


static func _validate_projectile(cfg: Dictionary, errors: Array[String]) -> void:
	var path := "projectile"
	if not cfg.has("projectile"):
		errors.append(path + ": required")
		return
	if typeof(cfg["projectile"]) != TYPE_DICTIONARY:
		errors.append(path + ": expected an object")
		return
	var proj: Dictionary = cfg["projectile"]
	_check_unknown_keys(proj, PROJECTILE_KEYS, path, errors)
	_check_positive_number(proj, "speed", 1.0, path, errors)


# --- Primitive check helpers ---

static func _check_unknown_keys(data: Dictionary, allowed: PackedStringArray, prefix: String, errors: Array[String]) -> void:
	for key: Variant in data.keys():
		if typeof(key) != TYPE_STRING or not allowed.has(key):
			errors.append(_field_path(prefix, str(key)) + ": unknown key")


static func _check_version_literal(data: Dictionary, key: String, expected: int, prefix: String, errors: Array[String]) -> void:
	var path := _field_path(prefix, key)
	if not data.has(key):
		errors.append(path + ": required")
		return
	var value: Variant = data[key]
	if not _is_whole_number(value) or int(value) != expected:
		errors.append(path + ": must be the literal %d" % expected)


static func _check_positive_int(data: Dictionary, key: String, min_val: float, max_val: float, prefix: String, errors: Array[String]) -> void:
	var path := _field_path(prefix, key)
	if not data.has(key):
		errors.append(path + ": required")
		return
	var value: Variant = data[key]
	if not _is_whole_number(value):
		errors.append(path + ": expected a whole number")
		return
	var n: float = float(value)
	if n < min_val:
		errors.append(path + ": below minimum (%d)" % int(min_val))
	elif n > max_val:
		errors.append(path + ": above maximum (%d)" % int(max_val))


static func _check_positive_number(data: Dictionary, key: String, min_val: float, prefix: String, errors: Array[String]) -> void:
	var path := _field_path(prefix, key)
	if not data.has(key):
		errors.append(path + ": required")
		return
	var value: Variant = data[key]
	if not _is_finite_number(value):
		errors.append(path + ": expected a finite number")
		return
	if float(value) < min_val:
		errors.append(path + ": below minimum (%.4f)" % min_val)


static func _check_non_negative_number(data: Dictionary, key: String, prefix: String, errors: Array[String]) -> void:
	var path := _field_path(prefix, key)
	if not data.has(key):
		errors.append(path + ": required")
		return
	var value: Variant = data[key]
	if not _is_finite_number(value):
		errors.append(path + ": expected a finite number")
		return
	if float(value) < 0.0:
		errors.append(path + ": must not be negative")


static func _check_bool(data: Dictionary, key: String, prefix: String, errors: Array[String]) -> void:
	var path := _field_path(prefix, key)
	if not data.has(key):
		errors.append(path + ": required")
		return
	if typeof(data[key]) != TYPE_BOOL:
		errors.append(path + ": expected a boolean")


static func _field_path(prefix: String, key: String) -> String:
	if prefix.is_empty():
		return key
	return prefix + "." + key


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


static func _reject(errors: Array[String]) -> Dictionary:
	return {"ok": false, "value": null, "errors": errors}
