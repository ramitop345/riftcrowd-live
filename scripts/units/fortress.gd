## Fortress visual placeholder. Phase 5 — ColorRect body + TextureProgressBar health bar.
extends Node2D

const BODY_WIDTH: float = 80.0
const BODY_HEIGHT: float = 120.0

const FACTION_COLORS: Array = [
	Color(0.2, 0.5, 0.9),
	Color(0.9, 0.2, 0.2),
]

var _body: ColorRect
var _bar_bg: ColorRect
var _health_bar: TextureProgressBar


func _ready() -> void:
	_body = $Body
	_bar_bg = $BarBg
	_health_bar = $HealthBar
	_create_fallback_textures()


func _create_fallback_textures() -> void:
	var img_bg := Image.create(1, 1, false, Image.FORMAT_RGBA8)
	img_bg.fill(Color(0.15, 0.15, 0.15, 0.6))
	_health_bar.texture_under = ImageTexture.create_from_image(img_bg)
	var img_fill := Image.create(1, 1, false, Image.FORMAT_RGBA8)
	img_fill.fill(Color(0.1, 0.9, 0.1, 1.0))
	_health_bar.texture_progress = ImageTexture.create_from_image(img_fill)


func update_visual(health_fraction: float, faction_index: int) -> void:
	if faction_index >= 0 and faction_index < FACTION_COLORS.size():
		_body.color = FACTION_COLORS[faction_index]
	var hf: float = clampf(health_fraction, 0.0, 1.0)
	_health_bar.value = hf * 100.0


func setup(config: Dictionary) -> void:
	pass
