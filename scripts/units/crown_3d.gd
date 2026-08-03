## Crown 3D visual — gold objective at center of arena.
## Accepts dominion array [blue%, red%] for faction tinting.
extends Node3D

const CROWN_GLB: String = "res://assets/models/objectives/RC_Objective_Crown.glb"
const MODEL_SCALE: float = 4.0  # Blender export scale correction

var _model: Node3D = null
var _dominion: Array = [0.0, 0.0]
var _time: float = 0.0


func _ready() -> void:
	var packed: PackedScene = load(CROWN_GLB) as PackedScene
	if packed != null:
		_model = packed.instantiate()
		_model.name = "Model"
		_model.scale = Vector3(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE)
		add_child(_model)


func _process(delta: float) -> void:
	_time += delta
	# Subtle idle rotation for the crown.
	if _model != null:
		_model.rotation.y = sin(_time * 0.5) * 0.15


## Update crown visual: dominion is [blue_pct, red_pct].
func update_visual(dominion: Variant) -> void:
	if typeof(dominion) == TYPE_ARRAY and (dominion as Array).size() >= 2:
		_dominion = dominion as Array
