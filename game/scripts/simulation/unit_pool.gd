## Preallocated pool of SimUnit instances. Never grows beyond capacity.
## acquire() returns null when exhausted (caller logs and skips spawn).
class_name UnitPool
extends RefCounted

var _all: Array = []         ## All SimUnit instances (preallocated)
var _active_list: Array = [] ## Currently active units
var _total_capacity: int = 0
var _active_count: int = 0
var _peak_active: int = 0


func _init(capacity: int) -> void:
	_total_capacity = capacity
	_all.resize(capacity)
	for i in capacity:
		var u := SimUnit.new()
		u.id = i
		_all[i] = u


## Returns a free SimUnit, or null when exhausted.
func acquire() -> SimUnit:
	for i in _total_capacity:
		var u: SimUnit = _all[i]
		if not u.active:
			u.active = true
			u.alive = true
			u.state = SimUnit.State.SPAWNING
			u.state_time = 0.0
			_active_count += 1
			if _active_count > _peak_active:
				_peak_active = _active_count
			_active_list.append(u)
			return u
	return null


## Releases a unit back to the pool.
func release(unit: SimUnit) -> void:
	if not unit.active:
		return
	unit.active = false
	unit.alive = false
	unit.state = SimUnit.State.DEAD
	unit.target_id = -1
	_active_count -= 1
	_active_list.erase(unit)


func active_units() -> Array:
	return _active_list


func get_active_count() -> int:
	return _active_count


func get_total_capacity() -> int:
	return _total_capacity


func get_peak_active() -> int:
	return _peak_active


## Clears all active state for round reset. Does NOT reallocate.
func reset_all() -> void:
	for i in _total_capacity:
		var u: SimUnit = _all[i]
		u.reset()
		u.id = i
	_active_list.clear()
	_active_count = 0


func reset_peak() -> void:
	_peak_active = 0


## Pool stats dictionary for snapshot.
func pool_stats() -> Dictionary:
	return {
		"active": _active_count,
		"capacity": _total_capacity,
		"peak": _peak_active,
	}
