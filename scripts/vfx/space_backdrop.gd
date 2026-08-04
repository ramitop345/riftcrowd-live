## Procedural space backdrop: seeded starfield panorama sky + periodic
## spaceship fly-bys built from primitives (asset-agnostic, so Meshy ships
## can be swapped in later without changing the arena). Configured from the
## "spaceBackdrop" section of gameplay.json.
class_name SpaceBackdrop
extends Node3D

const SKY_W: int = 2048
const SKY_H: int = 1024
## Ships fly through a corridor around/above the arena and are culled here.
const KILL_RADIUS: float = 190.0
const SPAWN_DISTANCE: float = 160.0

var _cfg: Dictionary = {}
var _rng := RandomNumberGenerator.new()
var _spawn_timer: float = 2.0
var _ships: Array = []  # [{ node: Node3D, velocity: Vector3 }]


## Applies the starfield sky to the arena environment and arms the spawner.
func configure(env: Environment, cfg: Dictionary) -> void:
	_cfg = cfg
	_rng.seed = int(float(cfg.get("seed", 7)))
	_build_starfield(env)
	# First fly-by a couple of seconds into the round.
	_spawn_timer = 2.0


func _process(delta: float) -> void:
	if not bool(_cfg.get("enabled", false)):
		return
	# Move active ships and cull the ones that left the corridor.
	var remaining: Array = []
	for ship: Dictionary in _ships:
		var node: Node3D = ship["node"]
		if node == null or not is_instance_valid(node):
			continue
		node.position += (ship["velocity"] as Vector3) * delta
		if node.position.length() > KILL_RADIUS:
			node.queue_free()
		else:
			remaining.append(ship)
	_ships = remaining
	# Spawn cadence.
	_spawn_timer -= delta
	if _spawn_timer <= 0.0:
		_spawn_timer = float(_cfg.get("shipIntervalSeconds", 15.0))
		if _ships.size() < int(float(_cfg.get("maxShips", 2))):
			_spawn_ship()


# ---------------------------------------------------------------------------
# Starfield sky
# ---------------------------------------------------------------------------

func _build_starfield(env: Environment) -> void:
	var img: Image = Image.create(SKY_W, SKY_H, false, Image.FORMAT_RGBA8)
	# Deep-space vertical gradient (slightly lighter at the horizon band).
	for y in SKY_H:
		var t: float = float(y) / float(SKY_H)
		var horizon: float = exp(-pow((t - 0.62) * 4.0, 2.0)) * 0.05
		var col := Color(0.01 + horizon * 0.6, 0.012 + horizon * 0.7, 0.03 + horizon)
		img.fill_rect(Rect2i(0, y, SKY_W, 1), col)
	# Soft nebula wisps: a few large low-alpha radial blobs.
	for i in 4:
		var cx: int = _rng.randi_range(0, SKY_W - 1)
		var cy: int = _rng.randi_range(int(SKY_H * 0.2), int(SKY_H * 0.75))
		var radius: int = _rng.randi_range(140, 300)
		var hue: Color = [
			Color(0.25, 0.12, 0.35, 0.05),
			Color(0.1, 0.2, 0.35, 0.05),
			Color(0.3, 0.15, 0.12, 0.04),
			Color(0.12, 0.25, 0.22, 0.04),
		][i % 4]
		_paint_blob(img, cx, cy, radius, hue)
	# Stars: mostly dim pinpoints, some bright ones with a glow cross.
	var star_count: int = int(float(_cfg.get("starCount", 1200)))
	for i in star_count:
		var x: int = _rng.randi_range(0, SKY_W - 1)
		var y: int = _rng.randi_range(0, SKY_H - 1)
		var brightness: float = pow(_rng.randf(), 2.2)  # skew toward dim
		var tint_roll: float = _rng.randf()
		var tint := Color.WHITE
		if tint_roll < 0.12:
			tint = Color(0.75, 0.83, 1.0)  # blue-white
		elif tint_roll < 0.2:
			tint = Color(1.0, 0.85, 0.65)  # warm
		var col := Color(tint.r, tint.g, tint.b, clampf(0.25 + brightness, 0.0, 1.0))
		img.set_pixel(x, y, _blend(img.get_pixel(x, y), col))
		if brightness > 0.82:
			# Bright star: 4-neighbour glow for readability at distance.
			for off in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
				var nx: int = x + off.x
				var ny: int = y + off.y
				if nx >= 0 and nx < SKY_W and ny >= 0 and ny < SKY_H:
					var glow := Color(tint.r, tint.g, tint.b, 0.35)
					img.set_pixel(nx, ny, _blend(img.get_pixel(nx, ny), glow))
	var texture: ImageTexture = ImageTexture.create_from_image(img)
	var sky_mat := PanoramaSkyMaterial.new()
	sky_mat.panorama = texture
	var sky := Sky.new()
	sky.sky_material = sky_mat
	sky.radiance_size = 4
	env.sky = sky
	env.background_mode = Environment.BG_SKY
	# Keep the battlefield readable: dim ambient sky contribution slightly.
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.6


func _paint_blob(img: Image, cx: int, cy: int, radius: int, col: Color) -> void:
	var r2: float = float(radius) * float(radius)
	for dy in range(-radius, radius + 1, 2):
		for dx in range(-radius, radius + 1, 2):
			var x: int = wrapi(cx + dx, 0, SKY_W)
			var y: int = cy + dy
			if y < 0 or y >= SKY_H:
				continue
			var d2: float = float(dx * dx + dy * dy)
			if d2 > r2:
				continue
			var falloff: float = pow(1.0 - d2 / r2, 2.0)
			var blob := Color(col.r, col.g, col.b, col.a * falloff)
			img.set_pixel(x, y, _blend(img.get_pixel(x, y), blob))


func _blend(dst: Color, src: Color) -> Color:
	var a: float = src.a
	return Color(
		dst.r * (1.0 - a) + src.r * a,
		dst.g * (1.0 - a) + src.g * a,
		dst.b * (1.0 - a) + src.b * a,
		maxf(dst.a, a)
	)


# ---------------------------------------------------------------------------
# Spaceship fly-bys (primitive silhouettes — three distinct types)
# ---------------------------------------------------------------------------

func _spawn_ship() -> void:
	var from_left: bool = _rng.randf() < 0.5
	var start := Vector3(
		-SPAWN_DISTANCE if from_left else SPAWN_DISTANCE,
		_rng.randf_range(18.0, 40.0),
		_rng.randf_range(-70.0, 70.0)
	)
	var end := Vector3(
		SPAWN_DISTANCE if from_left else -SPAWN_DISTANCE,
		start.y + _rng.randf_range(-8.0, 8.0),
		_rng.randf_range(-70.0, 70.0)
	)
	var speed: float = _rng.randf_range(
		float(_cfg.get("shipSpeedMin", 5.0)),
		float(_cfg.get("shipSpeedMax", 9.0))
	)
	var dir: Vector3 = (end - start).normalized()
	var node: Node3D = _build_ship(_rng.randi_range(0, 2))
	node.position = start
	add_child(node)
	# Point the nose along the flight path (ships are authored facing -Z).
	if dir.length_squared() > 0.001:
		node.look_at(node.position + dir, Vector3.UP)
	_ships.append({"node": node, "velocity": dir * speed})


## Type 0 = fighter (fuselage + wings), 1 = cruiser (hull + prow ring),
## 2 = saucer (disc + dome). Hull colors vary per spawn.
func _build_ship(ship_type: int) -> Node3D:
	var ship := Node3D.new()
	ship.name = "FlybyShip"
	var hull := StandardMaterial3D.new()
	hull.albedo_color = Color(
		_rng.randf_range(0.45, 0.75),
		_rng.randf_range(0.45, 0.72),
		_rng.randf_range(0.5, 0.8)
	)
	hull.metallic = 0.6
	hull.roughness = 0.4
	var engine := StandardMaterial3D.new()
	engine.albedo_color = Color(0.4, 0.8, 1.0)
	engine.emission_enabled = true
	engine.emission = Color(0.3, 0.7, 1.0)
	engine.emission_energy_multiplier = 2.5
	match ship_type:
		0:
			_build_fighter(ship, hull, engine)
			ship.scale = Vector3.ONE * _rng.randf_range(1.6, 2.4)
		1:
			_build_cruiser(ship, hull, engine)
			ship.scale = Vector3.ONE * _rng.randf_range(2.2, 3.2)
		_:
			_build_saucer(ship, hull, engine)
			ship.scale = Vector3.ONE * _rng.randf_range(1.8, 2.8)
	return ship


func _mesh(parent: Node3D, mesh: Mesh, mat: Material, pos: Vector3, rot_deg: Vector3 = Vector3.ZERO) -> void:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	mi.rotation_degrees = rot_deg
	parent.add_child(mi)


func _build_fighter(ship: Node3D, hull: Material, engine: Material) -> void:
	var fuselage := BoxMesh.new()
	fuselage.size = Vector3(0.7, 0.5, 3.2)
	_mesh(ship, fuselage, hull, Vector3.ZERO)
	var wing := BoxMesh.new()
	wing.size = Vector3(3.6, 0.08, 1.1)
	_mesh(ship, wing, hull, Vector3(0, 0, 0.5))
	var fin := BoxMesh.new()
	fin.size = Vector3(0.08, 0.9, 0.9)
	_mesh(ship, fin, hull, Vector3(0, 0.5, 1.2))
	var thruster := SphereMesh.new()
	thruster.radius = 0.22
	thruster.height = 0.44
	_mesh(ship, thruster, engine, Vector3(0, 0, 1.7))


func _build_cruiser(ship: Node3D, hull: Material, engine: Material) -> void:
	var body := CylinderMesh.new()
	body.top_radius = 0.5
	body.bottom_radius = 0.7
	body.height = 4.6
	_mesh(ship, body, hull, Vector3.ZERO, Vector3(90, 0, 0))
	var prow := CylinderMesh.new()
	prow.top_radius = 0.05
	prow.bottom_radius = 0.5
	prow.height = 1.2
	_mesh(ship, prow, hull, Vector3(0, 0, -2.9), Vector3(90, 0, 0))
	var ring := TorusMesh.new()
	ring.inner_radius = 0.75
	ring.outer_radius = 1.0
	_mesh(ship, ring, hull, Vector3(0, 0, 0.8), Vector3(90, 0, 0))
	var thruster := SphereMesh.new()
	thruster.radius = 0.4
	thruster.height = 0.8
	_mesh(ship, thruster, engine, Vector3(0, 0, 2.4))


func _build_saucer(ship: Node3D, hull: Material, engine: Material) -> void:
	var disc := CylinderMesh.new()
	disc.top_radius = 1.6
	disc.bottom_radius = 2.0
	disc.height = 0.5
	_mesh(ship, disc, hull, Vector3.ZERO)
	var dome := SphereMesh.new()
	dome.radius = 0.8
	dome.height = 0.8
	_mesh(ship, dome, hull, Vector3(0, 0.4, 0))
	var glow := CylinderMesh.new()
	glow.top_radius = 1.7
	glow.bottom_radius = 1.7
	glow.height = 0.08
	_mesh(ship, glow, engine, Vector3(0, -0.28, 0))
