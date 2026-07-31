## Base visual unit — shared by Champion, Guardian, Striker, Captain, Boss.
## Subclass scripts override BODY_SIZE in their _ready.
extends Node2D

const FACTION_COLORS: Array = [
	Color(0.2, 0.5, 0.9),
	Color(0.9, 0.2, 0.2),
]
const NEUTRAL_COLOR: Color = Color(0.5, 0.5, 0.5)

## Overridden by subclasses (Champion=40, Guardian=50, Striker=30, Captain=50).
var body_size: float = 40.0

var display_name: String = ""
var _body: ColorRect
var _bar_bg: ColorRect
var _health_bar: TextureProgressBar


func _ready() -> void:
	_body = $Body
	_bar_bg = $BarBg
	_health_bar = $HealthBar
	_center_visuals()
	_create_fallback_textures()


func _center_visuals() -> void:
	_body.position = Vector2(-body_size * 0.5, -body_size * 0.5)
	_body.size = Vector2(body_size, body_size)
	_bar_bg.position = Vector2(-body_size * 0.5, -body_size * 0.5 - 10.0)
	_bar_bg.size = Vector2(body_size, 5.0)
	_health_bar.position = _bar_bg.position
	_health_bar.size = Vector2(body_size, 5.0)


func _create_fallback_textures() -> void:
	var img_bg := Image.create(1, 1, false, Image.FORMAT_RGBA8)
	img_bg.fill(Color(0.15, 0.15, 0.15, 0.6))
	_health_bar.texture_under = ImageTexture.create_from_image(img_bg)
	var img_fill := Image.create(1, 1, false, Image.FORMAT_RGBA8)
	img_fill.fill(Color(0.1, 0.9, 0.1, 1.0))
	_health_bar.texture_progress = ImageTexture.create_from_image(img_fill)


## Updates visual state from a snapshot unit dictionary.
func update_visual(unit_snapshot: Dictionary) -> void:
	position = Vector2(float(unit_snapshot.get("x", 0.0)), float(unit_snapshot.get("y", 0.0)))
	var faction: int = int(unit_snapshot.get("faction", -1))
	if faction >= 0 and faction < FACTION_COLORS.size():
		_body.color = FACTION_COLORS[faction]
	else:
		_body.color = NEUTRAL_COLOR
	var hf: float = clampf(float(unit_snapshot.get("health_fraction", 1.0)), 0.0, 1.0)
	_health_bar.value = hf * 100.0
	var state: String = str(unit_snapshot.get("state", ""))
	if state == "DEAD" or state == "dead":
		visible = false
	else:
		visible = true


## Static factory for creating instances from a packed scene.
static func create(scene_path: String, config: Dictionary) -> Node:
	var packed: PackedScene = load(scene_path) as PackedScene
	if packed == null:
		return null
	var node: Node = packed.instantiate()
	if node.has_method("setup"):
		node.call("setup", config)
	return node


func setup(config: Dictionary) -> void:
	pass
