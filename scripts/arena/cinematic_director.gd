## Cinematic director — pre-choreographed "pre-recorded" cutscenes played
## every time a gift technique of tier 2+ fires. Takes over the arena camera
## for the duration of the scene (battle.gd pauses the sandbox meanwhile),
## then hands control back to the regular camera director.
##
## Tier 2 (galaxy): hard close-up on a caster of the gifting team channeling
## a hand aura, then a sky angle showing big burning meteorites (glowing
## tails, sparks, impact flashes and shockwaves) raining onto the field.
## Tier 3 (lion): the whole team raises their hands, energy streams up from
## every character into a massive crackling energy ball that drops onto the
## enemy position and detonates in a huge flash, shockwaves and spark burst.
##
## All FX readability over camera cleverness: effects are oversized, lit and
## particle-backed so they read clearly on low-end GPUs and small captures.
class_name CinematicDirector
extends Node

signal finished()

## Faction tint used for casters' banners / energy effects.
const FACTION_COLORS: Array = [Color(0.3, 0.55, 1.0), Color(1.0, 0.3, 0.3)]
const GROUND_Y: float = 1.0
## Master framing the arena director returns to (matches arena_3d defaults).
const MASTER_POS: Vector3 = Vector3(0.0, 16.0, -22.0)
const MASTER_LOOK: Vector3 = Vector3(0.0, 1.5, 0.0)
const MASTER_FOV: float = 50.0

var _arena: Node3D = null
var _camera: Camera3D = null
var _playing: bool = false
var _time: float = 0.0
var _duration: float = 0.0
## Absolute-time marks fired once each: [{"t": float, "fn": Callable}]
var _marks: Array = []
var _mark_index: int = 0
## Smoothed look-at target (tweened; applied every frame while playing).
var _look_target: Vector3 = MASTER_LOOK
## Camera shake amount (world units), decays over time.
var _shake_amount: float = 0.0
var _shake_decay: float = 2.0
## Shake offset applied THIS frame. Removed again next frame before the
## tweens re-position the camera — shake never accumulates into drift.
var _shake_offset: Vector3 = Vector3.ZERO
## Container for all temporary FX nodes (freed when the scene ends).
var _fx_container: Node3D = null
var _active_tweens: Array = []
var _lion_ball: Node3D = null


func setup(arena: Node3D, camera: Camera3D) -> void:
	_arena = arena
	_camera = camera
	_fx_container = Node3D.new()
	_fx_container.name = "CinematicFX"
	add_child(_fx_container)


func is_playing() -> bool:
	return _playing


func _process(delta: float) -> void:
	if not _playing:
		return
	_time += delta
	# Fire scheduled marks.
	while _mark_index < _marks.size() and float(_marks[_mark_index]["t"]) <= _time:
		var fn: Callable = _marks[_mark_index]["fn"]
		_mark_index += 1
		fn.call()
	# Camera: apply shake on top of the tweened position, then aim.
	if _camera != null and is_instance_valid(_camera):
		# Undo last frame's shake first so camera tweens never random-walk.
		if _shake_offset != Vector3.ZERO:
			_camera.position -= _shake_offset
			_shake_offset = Vector3.ZERO
		if _shake_amount > 0.001:
			_shake_offset = Vector3(
				randf_range(-1.0, 1.0) * _shake_amount,
				randf_range(-1.0, 1.0) * _shake_amount * 0.6,
				randf_range(-1.0, 1.0) * _shake_amount
			)
			_camera.position += _shake_offset
		_camera.look_at(_look_target, Vector3.UP)
		_shake_amount = maxf(_shake_amount - _shake_decay * delta, 0.0)
	if _time >= _duration:
		_finish()


# ===========================================================================
# Tier 2 — Galaxy: meteor summoning cutscene (~5.6 s)
# ===========================================================================

func play_galaxy(faction: int, unit_visuals: Dictionary) -> void:
	if _playing:
		print("[Cinematic] play_galaxy IGNORED (already playing)")
		return
	var caster: Node3D = _pick_caster(faction, unit_visuals)
	if caster == null:
		# The gift must still pay off when the faction has no living units:
		# borrow any living unit, else stage the scene on empty ground.
		caster = _pick_caster(1 - faction, unit_visuals)
		if caster != null:
			print("[Cinematic] play_galaxy: no living caster for faction %d — borrowing a unit" % faction)
	var caster_pos: Vector3 = _fortress_pos(faction)
	if caster != null:
		caster_pos = caster.global_position
	else:
		print("[Cinematic] play_galaxy: no living units at all — fortress fallback position")
	print("[Cinematic] play_galaxy START (galaxy meteor rain) faction=%d camera=%s" % [faction, "ok" if _camera != null else "NULL"])
	_start(faction)
	# The caster raises their hand and channels the meteor rain.
	if caster != null and caster.has_method("play_technique"):
		caster.call("play_technique", 2)
	var color: Color = FACTION_COLORS[clampi(faction, 0, 1)]
	# Energy gathers in the caster's raised hand while the camera pushes in.
	_spawn_channel_aura(caster_pos + Vector3(0.0, 2.3, 0.0), color)
	# Shot 1 — hard close-up on the caster (Street-Fighter style punch-in).
	_tween_cam(caster_pos + Vector3(2.4, 2.0, -3.0), caster_pos + Vector3(0.0, 1.6, 0.0), 34.0, 0.5)
	_mark(0.5, _galaxy_push_in.bind(caster_pos))
	# Shot 2 — sky angle: meteorites fall onto the battlefield.
	_mark(2.1, _galaxy_sky_cut)
	for i in 10:
		_mark(2.2 + 0.15 * float(i), _spawn_meteor)
	# Shot 3 — back to the wide arena framing for the aftermath.
	_mark(3.9, _return_to_master.bind(1.3))
	_duration = 5.6


## Slow dramatic push-in on the caster's face while they channel the spell.
func _galaxy_push_in(caster_pos: Vector3) -> void:
	_tween_cam(caster_pos + Vector3(1.5, 1.7, -1.9), caster_pos + Vector3(0.0, 1.7, 0.0), 28.0, 1.5)
	_shake_amount = 0.05
	_shake_decay = 0.2


## Hard cut to a low angle on the far edge of the field, staring up into the
## meteor path (meteors spawn across the whole battlefield in front of it).
func _galaxy_sky_cut() -> void:
	_tween_cam(Vector3(0.0, 2.2, 12.0), Vector3(0.0, 26.0, -2.0), 68.0, 0.08)
	_shake_amount = 0.1
	_shake_decay = 0.5


func _spawn_meteor() -> void:
	var meteor := Node3D.new()
	meteor.name = "Meteor"
	var size: float = randf_range(0.5, 0.9)
	# Burning core.
	var core := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = size
	mesh.height = size * 2.0
	core.mesh = mesh
	core.material_override = _emit_mat(Color(1.0, 0.5, 0.15), Color(1.0, 0.45, 0.1), 4.0)
	meteor.add_child(core)
	# Long glowing tail pointing back along the fall direction.
	var tail := MeshInstance3D.new()
	var tail_mesh := CylinderMesh.new()
	tail_mesh.top_radius = size * 0.12
	tail_mesh.bottom_radius = size * 0.55
	tail_mesh.height = 5.0
	tail.mesh = tail_mesh
	tail.material_override = _emit_mat(Color(1.0, 0.6, 0.2, 0.45), Color(1.0, 0.5, 0.15), 2.0, true)
	tail.position = Vector3(0.0, 3.0, 0.0)
	meteor.add_child(tail)
	# The meteor lights the ground as it comes in.
	var light := OmniLight3D.new()
	light.light_color = Color(1.0, 0.55, 0.2)
	light.light_energy = 3.0
	light.omni_range = 9.0
	meteor.add_child(light)
	_fx_container.add_child(meteor)
	var start := Vector3(randf_range(-14.0, 14.0), randf_range(26.0, 34.0), randf_range(-10.0, 8.0))
	var impact := Vector3(start.x + randf_range(-2.0, 2.0), GROUND_Y, start.z + randf_range(-2.0, 2.0))
	meteor.position = start
	var tw := create_tween()
	tw.tween_property(meteor, "position", impact, 0.9).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.tween_callback(_meteor_impact.bind(impact, meteor))
	_active_tweens.append(tw)


func _meteor_impact(pos: Vector3, meteor: Node) -> void:
	print("[Cinematic] galaxy meteor impact at (%.0f, %.0f)" % [pos.x, pos.z])
	if meteor != null and is_instance_valid(meteor):
		meteor.queue_free()
	_spawn_impact_flash(pos, Color(1.0, 0.55, 0.15), 6.0)
	_spawn_shockwave(pos, Color(1.0, 0.6, 0.2, 0.7), 9.0, 0.6)
	_spawn_burst(pos + Vector3(0.0, 0.6, 0.0), Color(1.0, 0.6, 0.2), 24, 7.0)
	_spawn_impact_light(pos + Vector3(0.0, 1.5, 0.0), Color(1.0, 0.55, 0.2), 6.0, 12.0)
	_shake_amount = maxf(_shake_amount, 0.15)
	_shake_decay = 2.5


# ===========================================================================
# Tier 3 — Lion: supreme energy-ball cutscene (~6.4 s)
# ===========================================================================

func play_lion(faction: int, unit_visuals: Dictionary) -> void:
	if _playing:
		print("[Cinematic] play_lion IGNORED (already playing)")
		return
	var team: Array = _collect_team(faction, unit_visuals)
	# The gift must still pay off when the faction has no living units:
	# stage the energy ball over the faction's fortress instead of skipping.
	var centroid := _fortress_pos(faction)
	if team.is_empty():
		print("[Cinematic] play_lion: empty team for faction %d — fortress fallback" % faction)
	else:
		centroid = Vector3.ZERO
	print("[Cinematic] play_lion START (supreme energy ball) faction=%d team=%d camera=%s" % [faction, team.size(), "ok" if _camera != null else "NULL"])
	_start(faction)
	var color: Color = FACTION_COLORS[clampi(faction, 0, 1)]
	# Every character of the team raises their hands to build the ball.
	for node: Node in team:
		if node.has_method("play_technique"):
			node.call("play_technique", 3)
		var p: Vector3 = (node as Node3D).global_position
		centroid += p
		# Energy streams up from every raised hand while the ball forms.
		_spawn_channel_aura(p + Vector3(0.0, 2.2, 0.0), color)
	if not team.is_empty():
		centroid /= float(team.size())
	# Shot 1 — heroic wide on the whole team, low and close.
	_tween_cam(centroid + Vector3(0.0, 4.2, -9.5), centroid + Vector3(0.0, 2.4, 0.0), 46.0, 0.7)
	_mark(0.8, _lion_ball_rise.bind(centroid, faction))
	# Shot 2 — the drop. Impact on the enemy cluster (or their fortress).
	var impact: Vector3 = _enemy_focus(1 - faction, unit_visuals)
	_mark(3.0, _lion_drop.bind(centroid, impact))
	_mark(3.7, _lion_impact.bind(impact))
	# Shot 3 — pull back to the master framing over the devastation.
	_mark(4.4, _return_to_master.bind(1.5))
	_duration = 6.4


## A massive energy ball condenses above the team and swells for 2.2 s while
## the camera pushes in on it with a rising rumble.
func _lion_ball_rise(centroid: Vector3, faction: int) -> void:
	var color: Color = FACTION_COLORS[clampi(faction, 0, 1)]
	var ball := Node3D.new()
	ball.name = "EnergyBall"
	ball.position = centroid + Vector3(0.0, 5.5, 0.0)
	var core := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = 1.0
	mesh.height = 2.0
	core.mesh = mesh
	core.material_override = _emit_mat(color.lerp(Color.WHITE, 0.35), color.lerp(Color(1.0, 0.9, 0.5), 0.4), 5.0)
	ball.add_child(core)
	var halo := MeshInstance3D.new()
	var halo_mesh := SphereMesh.new()
	halo_mesh.radius = 1.4
	halo_mesh.height = 2.8
	halo.mesh = halo_mesh
	halo.material_override = _emit_mat(Color(color.r, color.g, color.b, 0.22), color, 2.5, true)
	ball.add_child(halo)
	var light := OmniLight3D.new()
	light.light_color = color
	light.light_energy = 0.6
	light.omni_range = 18.0
	ball.add_child(light)
	# Crackling sparks swirling inside the growing sphere.
	var crackle := GPUParticles3D.new()
	var crackle_mat := ParticleProcessMaterial.new()
	crackle_mat.direction = Vector3(0.0, 1.0, 0.0)
	crackle_mat.spread = 180.0
	crackle_mat.initial_velocity_min = 2.0
	crackle_mat.initial_velocity_max = 5.0
	crackle_mat.gravity = Vector3.ZERO
	crackle_mat.scale_min = 0.5
	crackle_mat.scale_max = 1.2
	crackle_mat.color = color.lerp(Color.WHITE, 0.5)
	crackle.process_material = crackle_mat
	crackle.amount = 48
	crackle.lifetime = 0.5
	ball.add_child(crackle)
	_fx_container.add_child(ball)
	ball.scale = Vector3.ONE * 0.15
	_lion_ball = ball
	# Light pillar binding the team to the forming ball.
	_spawn_beam(centroid + Vector3(0.0, 2.75, 0.0), 5.5, 0.5, color, 2.2)
	var tw := create_tween().set_parallel(true)
	tw.tween_property(ball, "scale", Vector3.ONE * 4.2, 2.2).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(light, "light_energy", 9.0, 2.2)
	_active_tweens.append(tw)
	# Slow push-in on the growing ball + rising rumble.
	_tween_cam(centroid + Vector3(0.0, 3.6, -8.5), centroid + Vector3(0.0, 5.5, 0.0), 42.0, 2.2)
	_shake_amount = 0.1
	_shake_decay = 0.12


## The ball drops onto the enemy position; the camera tracks it down.
func _lion_drop(centroid: Vector3, impact: Vector3) -> void:
	if _lion_ball != null and is_instance_valid(_lion_ball):
		var tw := create_tween()
		tw.tween_property(_lion_ball, "position", impact + Vector3(0.0, 1.2, 0.0), 0.7) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		_active_tweens.append(tw)
	_tween_cam(impact + Vector3(7.0, 5.5, -8.0), impact + Vector3(0.0, 1.5, 0.0), 50.0, 0.7)
	_shake_amount = 0.2
	_shake_decay = 0.5


## Massive explosion: flash, expanding shockwave rings, a vertical blast
## pillar, spark bursts, a blinding light pop and a hard (bounded) shake.
func _lion_impact(impact: Vector3) -> void:
	print("[Cinematic] lion energy ball DETONATES at (%.0f, %.0f)" % [impact.x, impact.z])
	if _lion_ball != null and is_instance_valid(_lion_ball):
		_lion_ball.queue_free()
		_lion_ball = null
	_spawn_impact_flash(impact + Vector3(0.0, 1.2, 0.0), Color(1.0, 0.92, 0.6), 14.0)
	_spawn_shockwave(impact, Color(1.0, 0.85, 0.4, 0.85), 18.0, 0.8)
	_spawn_shockwave(impact, Color(1.0, 0.95, 0.7, 0.6), 10.0, 0.45)
	_spawn_beam(impact + Vector3(0.0, 9.0, 0.0), 18.0, 1.2, Color(1.0, 0.9, 0.5), 0.5)
	_spawn_burst(impact + Vector3(0.0, 1.0, 0.0), Color(1.0, 0.85, 0.4), 64, 12.0)
	_spawn_impact_light(impact + Vector3(0.0, 2.0, 0.0), Color(1.0, 0.9, 0.6), 14.0, 22.0)
	_shake_amount = 0.8
	_shake_decay = 1.1


# ===========================================================================
# Shared helpers
# ===========================================================================

func _start(faction: int) -> void:
	_playing = true
	_time = 0.0
	_mark_index = 0
	_marks = []
	_duration = 0.0
	_lion_ball = null
	_shake_amount = 0.0
	_shake_decay = 2.0
	_shake_offset = Vector3.ZERO
	_look_target = MASTER_LOOK


func _finish() -> void:
	print("[Cinematic] cutscene finished at t=%.1f/%.1f" % [_time, _duration])
	_playing = false
	# Never leave residual shake on the camera when the scene ends.
	if _camera != null and is_instance_valid(_camera) and _shake_offset != Vector3.ZERO:
		_camera.position -= _shake_offset
	_shake_offset = Vector3.ZERO
	for tw: Tween in _active_tweens:
		if tw != null and tw.is_valid():
			tw.kill()
	_active_tweens.clear()
	if _fx_container != null:
		for child in _fx_container.get_children():
			child.queue_free()
	finished.emit()


## Schedules a callback at an absolute time inside the cutscene.
func _mark(t: float, fn: Callable) -> void:
	_marks.append({"t": t, "fn": fn})


## Tweens camera position / look target / fov over `dur` seconds.
func _tween_cam(pos: Vector3, look: Vector3, fov: float, dur: float) -> void:
	if _camera == null or not is_instance_valid(_camera):
		return
	var tw := create_tween().set_parallel(true)
	tw.tween_property(_camera, "position", pos, maxf(dur, 0.01)) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(self, "_look_target", look, maxf(dur, 0.01)) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(_camera, "fov", fov, maxf(dur, 0.01))
	_active_tweens.append(tw)


func _return_to_master(dur: float) -> void:
	_tween_cam(MASTER_POS, MASTER_LOOK, MASTER_FOV, dur)


## First living unit visual of the faction — the galaxy caster.
func _pick_caster(faction: int, unit_visuals: Dictionary) -> Node3D:
	for uid: int in unit_visuals.keys():
		var node: Node = unit_visuals[uid]
		if node == null or not is_instance_valid(node):
			continue
		if not node.has_method("get_faction_index") or int(node.call("get_faction_index")) != faction:
			continue
		if node.has_method("is_dead") and bool(node.call("is_dead")):
			continue
		if node is Node3D:
			return node
	return null


## All living unit visuals of the faction.
func _collect_team(faction: int, unit_visuals: Dictionary) -> Array:
	var team: Array = []
	for uid: int in unit_visuals.keys():
		var node: Node = unit_visuals[uid]
		if node == null or not is_instance_valid(node):
			continue
		if not node.has_method("get_faction_index") or int(node.call("get_faction_index")) != faction:
			continue
		if node.has_method("is_dead") and bool(node.call("is_dead")):
			continue
		team.append(node)
	return team


## Where the lion ball lands: centroid of the living enemies, or their
## fortress if the field is already clear.
func _enemy_focus(enemy_faction: int, unit_visuals: Dictionary) -> Vector3:
	var enemies: Array = _collect_team(enemy_faction, unit_visuals)
	if not enemies.is_empty():
		var centroid := Vector3.ZERO
		for node: Node in enemies:
			centroid += (node as Node3D).global_position
		return centroid / float(enemies.size())
	# Fortresses sit at x = ±21 (faction 0 = west, faction 1 = east).
	return _fortress_pos(enemy_faction)


## Fortress anchor of a faction (x = ±21, faction 0 = west).
func _fortress_pos(faction: int) -> Vector3:
	var side: float = -21.0 if faction == 0 else 21.0
	return Vector3(side, GROUND_Y, 0.0)


## Bright expanding sphere used for impacts and explosions.
func _spawn_impact_flash(pos: Vector3, color: Color, max_scale: float) -> void:
	var flash := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = 0.5
	mesh.height = 1.0
	flash.mesh = mesh
	var mat := _emit_mat(Color(color.r, color.g, color.b, 0.9), color, 4.0, true)
	flash.material_override = mat
	flash.position = pos
	flash.scale = Vector3.ONE * 0.3
	_fx_container.add_child(flash)
	var tw := create_tween().set_parallel(true)
	tw.tween_property(flash, "scale", Vector3.ONE * max_scale, 0.5).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(mat, "albedo_color:a", 0.0, 0.5)
	tw.chain().tween_callback(flash.queue_free)
	_active_tweens.append(tw)


## Expanding ground ring for explosions.
func _spawn_shockwave(pos: Vector3, color: Color, max_radius: float, dur: float) -> void:
	var ring := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = 1.0
	mesh.bottom_radius = 1.0
	mesh.height = 0.1
	ring.mesh = mesh
	var mat := _emit_mat(color, Color(color.r, color.g, color.b), 3.0, true)
	ring.material_override = mat
	ring.position = pos + Vector3(0.0, 0.1, 0.0)
	ring.scale = Vector3.ONE
	_fx_container.add_child(ring)
	var tw := create_tween().set_parallel(true)
	tw.tween_property(ring, "scale", Vector3(max_radius, 1.0, max_radius), dur) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(mat, "albedo_color:a", 0.0, dur)
	tw.chain().tween_callback(ring.queue_free)
	_active_tweens.append(tw)


## Vertical translucent light pillar (channel beam / blast column).
func _spawn_beam(pos: Vector3, height: float, radius: float, color: Color, life: float) -> void:
	var beam := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius
	mesh.bottom_radius = radius * 1.6
	mesh.height = height
	beam.mesh = mesh
	var mat := _emit_mat(Color(color.r, color.g, color.b, 0.5), color, 2.5, true)
	beam.material_override = mat
	beam.position = pos
	_fx_container.add_child(beam)
	var tw := create_tween()
	tw.tween_interval(life)
	tw.tween_property(mat, "albedo_color:a", 0.0, 0.5)
	tw.tween_callback(beam.queue_free)
	_active_tweens.append(tw)


## One-shot radial spark burst (explosions and meteor impacts).
func _spawn_burst(pos: Vector3, color: Color, amount: int, speed: float) -> void:
	var p := GPUParticles3D.new()
	p.position = pos
	var proc := ParticleProcessMaterial.new()
	proc.direction = Vector3(0.0, 1.0, 0.0)
	proc.spread = 180.0
	proc.initial_velocity_min = speed * 0.4
	proc.initial_velocity_max = speed
	proc.gravity = Vector3(0.0, -9.8, 0.0)
	proc.scale_min = 0.5
	proc.scale_max = 1.5
	proc.color = color
	p.process_material = proc
	p.amount = amount
	p.lifetime = 0.8
	p.one_shot = true
	p.explosiveness = 1.0
	p.emitting = true
	_fx_container.add_child(p)
	var tw := create_tween()
	tw.tween_interval(p.lifetime + 0.3)
	tw.tween_callback(p.queue_free)
	_active_tweens.append(tw)


## Looping embers rising from a channeling character's hands (freed with
## the rest of the FX when the cutscene ends).
func _spawn_embers(pos: Vector3, color: Color) -> void:
	var p := GPUParticles3D.new()
	p.position = pos
	var proc := ParticleProcessMaterial.new()
	proc.direction = Vector3(0.0, 1.0, 0.0)
	proc.spread = 25.0
	proc.initial_velocity_min = 1.5
	proc.initial_velocity_max = 3.5
	proc.gravity = Vector3(0.0, 2.0, 0.0)
	proc.scale_min = 0.6
	proc.scale_max = 1.4
	proc.color = color
	p.process_material = proc
	p.amount = 24
	p.lifetime = 0.9
	p.emitting = true
	_fx_container.add_child(p)


## Short-lived bright light at an impact point (fades and frees itself).
func _spawn_impact_light(pos: Vector3, color: Color, energy: float, light_range: float) -> void:
	var light := OmniLight3D.new()
	light.position = pos
	light.light_color = color
	light.light_energy = energy
	light.omni_range = light_range
	_fx_container.add_child(light)
	var tw := create_tween()
	tw.tween_property(light, "light_energy", 0.0, 0.45)
	tw.tween_callback(light.queue_free)
	_active_tweens.append(tw)


## Growing faction-colored energy orb + rising embers — the visible
## "power gathering in the raised hand" beat for channeling characters.
func _spawn_channel_aura(pos: Vector3, color: Color) -> void:
	var orb := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = 0.3
	mesh.height = 0.6
	orb.mesh = mesh
	orb.material_override = _emit_mat(Color(color.r, color.g, color.b, 0.85), color, 3.5, true)
	orb.position = pos
	orb.scale = Vector3.ONE * 0.2
	_fx_container.add_child(orb)
	var tw := create_tween().set_parallel(true)
	tw.tween_property(orb, "scale", Vector3.ONE * 1.6, 1.6).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(orb, "position", pos + Vector3(0.0, 1.2, 0.0), 1.6)
	_active_tweens.append(tw)
	_spawn_embers(pos, color)


## Emissive material factory (optionally transparent).
func _emit_mat(albedo: Color, emission: Color, energy: float, transparent: bool = false) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = albedo
	mat.emission_enabled = true
	mat.emission = emission
	mat.emission_energy_multiplier = energy
	if transparent:
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	return mat
