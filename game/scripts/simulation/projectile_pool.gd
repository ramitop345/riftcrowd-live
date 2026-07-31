## Preallocated pool of SimProjectile instances. Never grows beyond capacity.
class_name ProjectilePool
extends RefCounted

var _all: Array = []
var _active_list: Array = []
var _total_capacity: int = 0
var _active_count: int = 0
var _peak_active: int = 0


func _init(capacity: int) -> void:
	_total_capacity = capacity
	_all.resize(capacity)
	for i in capacity:
		var p := SimProjectile.new()
		p.id = i
		_all[i] = p


func acquire() -> SimProjectile:
	for i in _total_capacity:
		var p: SimProjectile = _all[i]
		if not p.active:
			p.active = true
			p.lifetime = 3.0
			_active_count += 1
			if _active_count > _peak_active:
				_peak_active = _active_count
			_active_list.append(p)
			return p
	return null


func release(proj: SimProjectile) -> void:
	if not proj.active:
		return
	proj.active = false
	proj.target_id = -1
	_active_count -= 1
	_active_list.erase(proj)


func active_projectiles() -> Array:
	return _active_list


func get_active_count() -> int:
	return _active_count


func get_total_capacity() -> int:
	return _total_capacity


func get_peak_active() -> int:
	return _peak_active


func reset_all() -> void:
	for i in _total_capacity:
		var p: SimProjectile = _all[i]
		p.reset()
		p.id = i
	_active_list.clear()
	_active_count = 0


func reset_peak() -> void:
	_peak_active = 0


func pool_stats() -> Dictionary:
	return {
		"active": _active_count,
		"capacity": _total_capacity,
		"peak": _peak_active,
	}
