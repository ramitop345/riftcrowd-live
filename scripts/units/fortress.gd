## Fortress visual — multi-tower castle.
## Three towers connected by walls, faction banner, health bar.
extends Node2D

const FACTION_COLORS: Array = [
	Color(0.2, 0.6, 1.0),
	Color(1.0, 0.25, 0.3),
]
const FACTION_OUTLINES: Array = [
	Color(0.1, 0.3, 0.6),
	Color(0.6, 0.1, 0.15),
]

var _body: ColorRect
var _bar_bg: ColorRect
var _health_bar: TextureProgressBar
var _faction_color: Color = FACTION_COLORS[0]
var _outline_color: Color = FACTION_OUTLINES[0]
var _health_fraction: float = 1.0
var _faction_index: int = 0
var _time: float = 0.0


func _ready() -> void:
	_body = $Body
	_bar_bg = $BarBg
	_health_bar = $HealthBar
	_body.visible = false
	_create_fallback_textures()
	# Reposition health bar below the fortress structure
	_bar_bg.position = Vector2(-50.0, 70.0)
	_bar_bg.size = Vector2(100.0, 8.0)
	_health_bar.position = _bar_bg.position
	_health_bar.size = Vector2(100.0, 8.0)


func _create_fallback_textures() -> void:
	var img_bg := Image.create(1, 1, false, Image.FORMAT_RGBA8)
	img_bg.fill(Color(0.15, 0.15, 0.15, 0.6))
	_health_bar.texture_under = ImageTexture.create_from_image(img_bg)
	var img_fill := Image.create(1, 1, false, Image.FORMAT_RGBA8)
	img_fill.fill(Color(0.1, 0.9, 0.1, 1.0))
	_health_bar.texture_progress = ImageTexture.create_from_image(img_fill)


func _process(delta: float) -> void:
	_time += delta
	queue_redraw()


func update_visual(health_fraction: float, faction_index: int) -> void:
	_faction_index = faction_index
	if faction_index >= 0 and faction_index < FACTION_COLORS.size():
		_faction_color = FACTION_COLORS[faction_index]
		_outline_color = FACTION_OUTLINES[faction_index]
	_health_fraction = clampf(health_fraction, 0.0, 1.0)
	_health_bar.value = _health_fraction * 100.0
	# Update health bar fill color
	var bar_fill: Color = Color(0.1, 0.9, 0.1) if _health_fraction > 0.5 else Color(0.9, 0.7, 0.1) if _health_fraction > 0.25 else Color(0.9, 0.2, 0.1)
	var img := Image.create(1, 1, false, Image.FORMAT_RGBA8)
	img.fill(bar_fill)
	_health_bar.texture_progress = ImageTexture.create_from_image(img)


func _draw() -> void:
	var damage: float = 1.0 - _health_fraction
	# Base glow
	_draw_glow_at(Vector2.ZERO, 60.0, _faction_color, 0.08)
	# Left tower
	_draw_tower(Vector2(-38, 0), 18.0, 55.0, damage)
	# Right tower
	_draw_tower(Vector2(38, 0), 18.0, 55.0, damage)
	# Center tower (taller)
	_draw_tower(Vector2(0, -10), 24.0, 75.0, damage)
	# Connecting walls
	var wall_color := _outline_color.lerp(Color(0.15, 0.12, 0.18), 0.3)
	draw_colored_polygon(PackedVector2Array([
		Vector2(-38, 25), Vector2(-20, 25),
		Vector2(-20, 10), Vector2(-38, 10),
	]), wall_color)
	draw_colored_polygon(PackedVector2Array([
		Vector2(20, 25), Vector2(38, 25),
		Vector2(38, 10), Vector2(20, 10),
	]), wall_color)
	# Faction banner (triangle above center tower)
	var banner_y: float = -55.0 + sin(_time * 2.0) * 2.0
	var banner := PackedVector2Array([
		Vector2(0, banner_y - 15),
		Vector2(-8, banner_y),
		Vector2(8, banner_y),
	])
	draw_colored_polygon(banner, _faction_color)
	# Banner pole
	draw_line(Vector2(0, banner_y), Vector2(0, -45), Color(0.5, 0.5, 0.5, 0.6), 1.5)
	# Damage cracks
	if damage > 0.3:
		var crack_alpha: float = (damage - 0.3) * 1.2
		var crack_color := Color(0.3, 0.2, 0.15, crack_alpha)
		draw_line(Vector2(-10, -20), Vector2(-18, -35), crack_color, 1.5)
		draw_line(Vector2(12, 0), Vector2(22, -15), crack_color, 1.5)
	if damage > 0.6:
		var crack_alpha: float = (damage - 0.6) * 2.0
		var crack_color := Color(0.4, 0.15, 0.1, crack_alpha)
		draw_line(Vector2(-35, 10), Vector2(-42, -5), crack_color, 2.0)
		draw_line(Vector2(30, -10), Vector2(40, -25), crack_color, 2.0)
		draw_line(Vector2(5, 15), Vector2(-5, 30), crack_color, 1.5)
	# Low health warning pulse
	if _health_fraction < 0.3:
		var warn: float = 0.1 + 0.1 * sin(_time * 5.0)
		_draw_glow_at(Vector2.ZERO, 70.0, Color(1, 0.2, 0.1, warn), 0.15)


func _draw_tower(center: Vector2, half_w: float, height: float, damage: float) -> void:
	var top: float = center.y - height * 0.5
	var bot: float = center.y + height * 0.5
	var left: float = center.x - half_w
	var right: float = center.x + half_w
	# Tower body (outline)
	draw_colored_polygon(PackedVector2Array([
		Vector2(left - 2, top - 2), Vector2(right + 2, top - 2),
		Vector2(right + 2, bot), Vector2(left - 2, bot),
	]), _outline_color)
	# Tower body (fill — darkens with damage)
	var fill_color := _faction_color.lerp(Color(0.15, 0.1, 0.1), damage * 0.6)
	draw_colored_polygon(PackedVector2Array([
		Vector2(left, top), Vector2(right, top),
		Vector2(right, bot), Vector2(left, bot),
	]), fill_color)
	# Crenellations (3 notches at top)
	var notch_w: float = half_w * 0.35
	var notch_h: float = 6.0
	for i in 3:
		var nx: float = left + (float(i) + 0.5) * (half_w * 2.0 / 3.0) - notch_w * 0.5
		draw_colored_polygon(PackedVector2Array([
			Vector2(nx, top - notch_h),
			Vector2(nx + notch_w, top - notch_h),
			Vector2(nx + notch_w, top),
			Vector2(nx, top),
		]), _outline_color)
	# Window slit
	var window_y: float = center.y - height * 0.1
	var window_color := Color(0.05, 0.05, 0.1, 0.8)
	draw_colored_polygon(PackedVector2Array([
		Vector2(center.x - 3, window_y - 5),
		Vector2(center.x + 3, window_y - 5),
		Vector2(center.x + 3, window_y + 5),
		Vector2(center.x - 3, window_y + 5),
	]), window_color)
	# Window glow
	var glow_alpha: float = 0.15 + 0.1 * sin(_time * 1.5 + center.x)
	draw_colored_polygon(PackedVector2Array([
		Vector2(center.x - 2, window_y - 4),
		Vector2(center.x + 2, window_y - 4),
		Vector2(center.x + 2, window_y + 4),
		Vector2(center.x - 2, window_y + 4),
	]), Color(_faction_color.r, _faction_color.g, _faction_color.b, glow_alpha))


func _draw_glow_at(center: Vector2, radius: float, color: Color, alpha: float) -> void:
	for i in 4:
		var t: float = float(i) / 4.0
		var r: float = radius * (1.0 + t * 0.5)
		var a: float = alpha * (1.0 - t)
		_draw_circle_filled(center, r, Color(color.r, color.g, color.b, a))


func _draw_circle_filled(center: Vector2, radius: float, color: Color) -> void:
	var pts := PackedVector2Array()
	var segs: int = maxi(int(radius * 0.6), 10)
	for i in range(segs + 1):
		var angle: float = (float(i) / float(segs)) * TAU
		pts.append(center + Vector2(cos(angle), sin(angle)) * radius)
	if pts.size() >= 3:
		draw_colored_polygon(pts, color)


func setup(config: Dictionary) -> void:
	pass
