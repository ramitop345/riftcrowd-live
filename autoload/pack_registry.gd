## Loaded content packs (autoload "PackRegistry").
##
## Thin data holder: on startup it asks PackLoader for every authored pack under
## content/packs and keeps the validated results, the per-file failures, and the
## currently selected pack id. No gameplay logic lives here — screens read the
## packs, and Phase 6/7 systems will resolve factions from the selected pack.
##
## Invalid pack files are never dropped silently: each one is reported once
## through push_error and stays visible in `failures` for the preview screen.
extends Node

## Emitted once after every load pass (startup and reload) with the outcome.
signal packs_loaded(pack_count: int, failure_count: int)

const Loader := preload("res://scripts/packs/pack_loader.gd")

## Validated packs, in loader order. Entries are Dictionaries matching
## PackValidator's contract; treat them as read-only.
var packs: Array = []

## Pack files that failed to load: { "file": String, "errors": Array }.
var failures: Array = []

## Id of the pack the operator picked, or "" when nothing is selected.
var selected_pack_id: String = ""


func _ready() -> void:
	reload()


## Re-scans the pack root. Clears the selection, because pack ids may have
## changed underneath it.
func reload() -> void:
	var outcome := Loader.load_packs_from_dir(Loader.default_pack_root())
	var loaded_packs: Array = outcome["packs"]
	var loaded_failures: Array = outcome["failures"]
	packs = loaded_packs
	failures = loaded_failures
	selected_pack_id = ""
	for failure: Variant in failures:
		if typeof(failure) != TYPE_DICTIONARY:
			continue
		var entry: Dictionary = failure
		var reasons: Array = entry.get("errors", [])
		push_error(
			"PackRegistry: %s failed to load: %s"
			% [String(entry.get("file", "?")), ", ".join(PackedStringArray(reasons))]
		)
	packs_loaded.emit(packs.size(), failures.size())


## Returns the loaded pack with this id, or an empty Dictionary when unknown.
func find_pack(id: String) -> Dictionary:
	for entry: Variant in packs:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var pack: Dictionary = entry
		if String(pack.get("id", "")) == id:
			return pack
	return {}


## Selects one of the loaded packs. Unknown ids are refused (the selection is
## left untouched) so the id can never point at a pack that failed validation.
func select_pack(id: String) -> bool:
	if find_pack(id).is_empty():
		push_warning("PackRegistry: unknown pack id " + id)
		return false
	selected_pack_id = id
	return true


## The selected pack, or an empty Dictionary when nothing is selected.
func selected_pack() -> Dictionary:
	if selected_pack_id.is_empty():
		return {}
	return find_pack(selected_pack_id)
