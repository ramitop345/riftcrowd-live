## Content-pack preview screen (Phase 4).
##
## Read-only operator view of what the game loaded from content/packs: one button
## per loaded pack, the selected pack's factions as cards (colors, join keywords,
## pattern art), and every pack file that failed validation with its reasons.
##
## Everything below the heading is data-driven, so all of it is built in code from
## PackRegistry. Pack text is bounded by the schema, but it is still authored
## data: it is sanitized and truncated before it reaches a Label, and missing
## pattern art degrades to a message instead of an empty rectangle.
extends Control

const Ui := preload("res://scripts/ui/ui_config.gd")
const Loader := preload("res://scripts/packs/pack_loader.gd")
const Sanitizer := preload("res://autoload/error_overlay.gd")

## Display cap for any data-driven string, applied after control-character
## stripping. Well under the schema bounds; it only guards the layout.
const MAX_DISPLAY_LENGTH: int = 96

## Cards are built at runtime, so their sizing lives here rather than in the scene.
const CARD_PADDING: int = 16
const SWATCH_SIZE: Vector2 = Vector2(120, 48)
const PATTERN_HEIGHT: int = 160
const BUTTON_SIZE: Vector2 = Vector2(420, 64)
const PACK_ICON_SIZE: Vector2 = Vector2(48, 48)

@onready var _safe_area: MarginContainer = $SafeArea
@onready var _heading_label: Label = $SafeArea/Layout/HeadingLabel
@onready var _status_label: Label = $SafeArea/Layout/StatusLabel
@onready var _pack_buttons: VBoxContainer = $SafeArea/Layout/PackButtons
@onready var _faction_list: VBoxContainer = $SafeArea/Layout/FactionScroll/FactionList
@onready var _failures_label: Label = $SafeArea/Layout/FailuresLabel
@onready var _back_button: Button = $SafeArea/Layout/BackButton

var _pack_root: String = ""


func _ready() -> void:
	Ui.apply_safe_margins(_safe_area)
	_heading_label.add_theme_font_size_override("font_size", Ui.FONT_SIZE_HEADING)
	_status_label.add_theme_font_size_override("font_size", Ui.FONT_SIZE_BODY)
	_failures_label.add_theme_font_size_override("font_size", Ui.FONT_SIZE_SMALL)
	_pack_root = Loader.default_pack_root()
	_back_button.pressed.connect(_on_back_pressed)
	_build_pack_buttons()
	_show_failures()
	_back_button.grab_focus()


## One button per loaded pack, labelled with its display name and mode, with the
## pack's icon art beside it when it loads.
func _build_pack_buttons() -> void:
	_clear(_pack_buttons)
	var packs: Array = PackRegistry.packs
	if packs.is_empty():
		_status_label.text = "No content packs loaded — see the failures below."
		return
	_status_label.text = "%d pack(s) loaded — pick one to inspect its factions." % packs.size()
	for entry: Variant in packs:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var pack: Dictionary = entry
		# Bind the raw id (the schema already bounds it); only labels are sanitized.
		var pack_id := String(pack.get("id", ""))
		var button := Button.new()
		button.custom_minimum_size = BUTTON_SIZE
		button.text = "%s  (%s)" % [_display_text(pack.get("displayName", "")), _display_text(pack.get("mode", ""))]
		button.pressed.connect(_on_pack_pressed.bind(pack_id))
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		row.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		var icon := _build_pack_icon(String(pack.get("mode", "")))
		if icon != null:
			row.add_child(icon)
		row.add_child(button)
		_pack_buttons.add_child(row)


## Pack icon art comes from content/packs/<mode>/svg/pack_icon.svg, outside
## res://, so it is rasterized at runtime. A missing or broken icon is skipped
## silently — the button text already identifies the pack.
func _build_pack_icon(mode: String) -> TextureRect:
	var texture := Loader.load_svg_texture(Loader.pack_icon_path(_pack_root, mode))
	if texture == null:
		return null
	var rect := TextureRect.new()
	rect.texture = texture
	rect.custom_minimum_size = PACK_ICON_SIZE
	rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	return rect


func _on_pack_pressed(pack_id: String) -> void:
	if not PackRegistry.select_pack(pack_id):
		_status_label.text = "Pack \"%s\" is not loaded." % _display_text(pack_id)
		return
	var pack: Dictionary = PackRegistry.find_pack(pack_id)
	_status_label.text = "Selected: %s" % _display_text(pack.get("displayName", pack_id))
	_show_factions(pack)


## Rebuilds the faction card list for one pack. Defensive about shapes even
## though every pack here already passed PackValidator.
func _show_factions(pack: Dictionary) -> void:
	_clear(_faction_list)
	var mode := String(pack.get("mode", ""))
	var factions: Variant = pack.get("factions")
	if typeof(factions) != TYPE_ARRAY:
		_faction_list.add_child(_body_label("This pack has no factions to show."))
		return
	for entry: Variant in (factions as Array):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var faction: Dictionary = entry
		_faction_list.add_child(_build_faction_card(faction, mode))


## Card: name, primary/secondary swatches, join keywords, pattern art.
func _build_faction_card(faction: Dictionary, mode: String) -> PanelContainer:
	var card := PanelContainer.new()
	var padding := MarginContainer.new()
	padding.add_theme_constant_override("margin_left", CARD_PADDING)
	padding.add_theme_constant_override("margin_top", CARD_PADDING)
	padding.add_theme_constant_override("margin_right", CARD_PADDING)
	padding.add_theme_constant_override("margin_bottom", CARD_PADDING)
	card.add_child(padding)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	padding.add_child(column)

	var name_label := Label.new()
	name_label.add_theme_font_size_override("font_size", Ui.FONT_SIZE_BODY)
	name_label.text = _display_text(faction.get("displayName", ""))
	column.add_child(name_label)

	var swatches := HBoxContainer.new()
	swatches.add_theme_constant_override("separation", 12)
	swatches.add_child(_build_swatch(faction.get("primaryColor", "")))
	swatches.add_child(_build_swatch(faction.get("secondaryColor", "")))
	swatches.add_child(
		_small_label(
			"%s / %s"
			% [_display_text(faction.get("primaryColor", "")), _display_text(faction.get("secondaryColor", ""))]
		)
	)
	column.add_child(swatches)

	column.add_child(_small_label("Join: " + _keywords_text(faction.get("joinKeywords"))))

	var pattern := String(faction.get("pattern", ""))
	column.add_child(_build_pattern_node(mode, pattern))
	return card


## Flat color chip. An unparseable hex is shown as a neutral chip rather than
## failing the card; the validator is what rejects bad colors.
func _build_swatch(hex_color: Variant) -> ColorRect:
	var swatch := ColorRect.new()
	swatch.custom_minimum_size = SWATCH_SIZE
	var text := String(hex_color)
	swatch.color = Color.html(text) if Color.html_is_valid(text) else Color.DIM_GRAY
	return swatch


## Pattern art comes from content/packs/<mode>/svg/<pattern>.svg, outside res://,
## so it is rasterized at runtime. A missing or broken file becomes a label.
func _build_pattern_node(mode: String, pattern: String) -> Control:
	var path := Loader.pattern_svg_path(_pack_root, mode, pattern)
	var texture := Loader.load_svg_texture(path)
	if texture == null:
		return _small_label("Pattern art unavailable: svg/%s.svg" % _display_text(pattern))
	var rect := TextureRect.new()
	rect.texture = texture
	rect.custom_minimum_size = Vector2(0, PATTERN_HEIGHT)
	rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	return rect


## Failure section: one line per pack file that did not load, with its reasons.
func _show_failures() -> void:
	var failures: Array = PackRegistry.failures
	if failures.is_empty():
		_failures_label.text = "All pack files loaded cleanly."
		return
	var lines: PackedStringArray = ["%d pack file(s) failed to load:" % failures.size()]
	for entry: Variant in failures:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var failure: Dictionary = entry
		var reasons: Array = failure.get("errors", [])
		lines.append(
			"- %s: %s"
			% [_display_text(failure.get("file", "?")), _display_text(", ".join(PackedStringArray(reasons)))]
		)
	_failures_label.text = "\n".join(lines)


func _on_back_pressed() -> void:
	AppState.goto(AppState.Screen.MAIN_MENU)


func _keywords_text(keywords: Variant) -> String:
	if typeof(keywords) != TYPE_ARRAY:
		return "(none)"
	var parts: PackedStringArray = []
	for keyword: Variant in (keywords as Array):
		parts.append(_display_text(keyword))
	if parts.is_empty():
		return "(none)"
	return ", ".join(parts)


func _body_label(text: String) -> Label:
	var label := Label.new()
	label.add_theme_font_size_override("font_size", Ui.FONT_SIZE_BODY)
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label


func _small_label(text: String) -> Label:
	var label := Label.new()
	label.add_theme_font_size_override("font_size", Ui.FONT_SIZE_SMALL)
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label


func _clear(container: Node) -> void:
	for child: Node in container.get_children():
		container.remove_child(child)
		child.queue_free()


## Authored pack text is treated like any other external text: control characters
## are stripped (shared with ErrorOverlay so there is one rule) and the result is
## capped so a long value cannot break the card layout.
static func _display_text(value: Variant) -> String:
	var cleaned: String = Sanitizer._sanitize(str(value))
	if cleaned.length() > MAX_DISPLAY_LENGTH:
		return cleaned.substr(0, MAX_DISPLAY_LENGTH)
	return cleaned
