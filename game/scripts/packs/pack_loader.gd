## Content-pack discovery and loading (static, side-effect-free apart from
## reading files and reporting problems).
##
## Packs are authored under `content/packs/<mode>/<pack>.json` at the repository
## root, outside `res://`, so they can be edited and validated by the Node
## tooling (`npm run validate:packs`) without duplicating them into the Godot
## project. The loader resolves that root from `res://` the same way the headless
## tests resolve `shared/fixtures`.
##
## Loading never crashes and never silently drops a pack: a file that cannot be
## read, is not JSON, fails PackValidator, or whose `mode` does not match its
## directory is reported in `failures` with its path and the reasons.
class_name PackLoader
extends RefCounted

const Validator := preload("res://scripts/packs/pack_validator.gd")

## Repository-relative location of the pack root, resolved from res:// (the
## Godot project lives in game/, the packs live in content/packs/).
const PACK_ROOT_FROM_PROJECT: String = "../content/packs"

## Pattern art lives next to the pack file: <mode>/svg/<pattern>.svg.
const SVG_DIR_NAME: String = "svg"
const SVG_EXTENSION: String = ".svg"
const PACK_ICON_NAME: String = "pack_icon"

## Rasterization scale for placeholder SVGs (authored at viewBox 0 0 256 256).
const SVG_RENDER_SCALE: float = 1.0


## Absolute path of the authored pack root (content/packs), derived from the
## project directory so it works for editor, headless, and exported dev runs.
static func default_pack_root() -> String:
	return ProjectSettings.globalize_path("res://").path_join(PACK_ROOT_FROM_PROJECT).simplify_path()


## Scans every subdirectory of `base_dir` for pack JSON files and validates them.
## Returns { "packs": Array of validated pack Dictionaries (sorted by directory
## then file name), "failures": Array of { "file": String, "errors": Array } }.
static func load_packs_from_dir(base_dir: String) -> Dictionary:
	var packs: Array = []
	var failures: Array = []
	var root := DirAccess.open(base_dir)
	if root == null:
		failures.append(
			_failure(base_dir, ["pack root could not be opened (error %d)" % DirAccess.get_open_error()])
		)
		return {"packs": packs, "failures": failures}
	var mode_dirs: Array = []
	for dir_name: String in root.get_directories():
		mode_dirs.append(dir_name)
	mode_dirs.sort()
	for mode_dir: String in mode_dirs:
		var pack_dir := base_dir.path_join(mode_dir)
		var sub := DirAccess.open(pack_dir)
		if sub == null:
			failures.append(
				_failure(pack_dir, ["pack directory could not be opened (error %d)" % DirAccess.get_open_error()])
			)
			continue
		var file_names: Array = []
		for file_name: String in sub.get_files():
			if not _is_pack_file(file_name):
				continue
			file_names.append(file_name)
		file_names.sort()
		for file_name: String in file_names:
			var file_path := pack_dir.path_join(file_name)
			var outcome := load_pack_file(file_path, mode_dir)
			if outcome["ok"]:
				var pack: Dictionary = outcome["pack"]
				packs.append(pack)
			else:
				var errors: Array = outcome["errors"]
				failures.append(_failure(file_path, errors))
	return {"packs": packs, "failures": failures}


## Reads and validates one pack file. `expected_mode` is the directory name the
## pack's `mode` must equal; pass "" to skip that cross-check. Returns
## { "ok": bool, "pack": Dictionary, "errors": Array }.
static func load_pack_file(file_path: String, expected_mode: String) -> Dictionary:
	if not FileAccess.file_exists(file_path):
		return _load_failure(["file does not exist"])
	var file := FileAccess.open(file_path, FileAccess.READ)
	if file == null:
		return _load_failure(["file could not be opened (error %d)" % FileAccess.get_open_error()])
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		return _load_failure(["root: not a JSON object"])
	var result := Validator.parse_pack(parsed)
	if not result["ok"]:
		var errors: Array = result["errors"]
		return _load_failure(errors)
	var pack: Dictionary = result["value"]
	if not expected_mode.is_empty() and String(pack["mode"]) != expected_mode:
		return _load_failure(
			[
				"mode: \"%s\" does not match pack directory \"%s\"" % [String(pack["mode"]), expected_mode]
			]
		)
	return {"ok": true, "pack": pack, "errors": []}


## Absolute path of a faction's pattern art inside the pack root.
static func pattern_svg_path(base_dir: String, mode: String, pattern: String) -> String:
	return base_dir.path_join(mode).path_join(SVG_DIR_NAME).path_join(pattern + SVG_EXTENSION)


## Absolute path of a pack's icon art inside the pack root.
static func pack_icon_path(base_dir: String, mode: String) -> String:
	return pattern_svg_path(base_dir, mode, PACK_ICON_NAME)


## Rasterizes an SVG file from an absolute (non-res://) path into a texture.
## Returns null and reports the reason instead of crashing when the file is
## missing, unreadable, or not loadable as SVG, so a missing placeholder degrades
## to a message in the UI.
static func load_svg_texture(path: String) -> Texture2D:
	if not FileAccess.file_exists(path):
		push_error("PackLoader: SVG not found: " + path)
		return null
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_error("PackLoader: SVG could not be opened (error %d): %s" % [FileAccess.get_open_error(), path])
		return null
	var svg_text := file.get_as_text()
	if svg_text.strip_edges().is_empty():
		push_error("PackLoader: SVG is empty: " + path)
		return null
	var image := Image.new()
	var error := image.load_svg_from_string(svg_text, SVG_RENDER_SCALE)
	if error != OK:
		push_error("PackLoader: SVG could not be rasterized (error %d): %s" % [error, path])
		return null
	if image.is_empty():
		push_error("PackLoader: SVG rasterized to an empty image: " + path)
		return null
	return ImageTexture.create_from_image(image)


## Pack candidates are plain *.json files; documentation is skipped explicitly so
## a future content/packs/<mode>/README.json cannot be read as a pack.
static func _is_pack_file(file_name: String) -> bool:
	var lowered := file_name.to_lower()
	if not lowered.ends_with(".json"):
		return false
	return not lowered.begins_with("readme")


static func _failure(file_path: String, errors: Array) -> Dictionary:
	return {"file": file_path, "errors": errors}


static func _load_failure(errors: Array) -> Dictionary:
	return {"ok": false, "pack": {}, "errors": errors}
