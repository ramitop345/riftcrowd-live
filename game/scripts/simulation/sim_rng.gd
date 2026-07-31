## Deterministic RNG wrapper. The ONLY randomness source in the simulation;
## owned by SimWorld. Never use global randf/randomize inside simulation code.
class_name SimRng
extends RefCounted

var _rng: RandomNumberGenerator


func _init(seed_value: int) -> void:
	_rng = RandomNumberGenerator.new()
	_rng.seed = seed_value


func randf() -> float:
	return _rng.randf()


func randf_range(a: float, b: float) -> float:
	return _rng.randf_range(a, b)


func randi_range(a: int, b: int) -> int:
	return _rng.randi_range(a, b)


## Picks a random element from a non-empty array.
func pick(array: Array) -> Variant:
	if array.is_empty():
		return null
	return array[_rng.randi() % array.size()]
