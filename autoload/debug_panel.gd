## Development-only stats panel (autoload "DebugPanel").
##
## CanvasLayer on layer 100. In release builds and pure server exports it stays
## completely inert (no UI, no processing). In debug builds it shows FPS, frame
## time, and the current scene name in the top-left corner, refreshed every
## 0.25 s. F1 toggles visibility; F2 raises a test error through ErrorOverlay.
extends CanvasLayer

const UPDATE_INTERVAL_SECONDS: float = 0.25

var _stats_label: Label
var _accumulator: float = 0.0


func _ready() -> void:
	layer = 100
	if not OS.is_debug_build() or OS.has_feature("server"):
		set_process(false)
		set_process_unhandled_input(false)
		return
	_build_ui()


func _process(delta: float) -> void:
	_accumulator += delta
	if _accumulator < UPDATE_INTERVAL_SECONDS:
		return
	_accumulator = 0.0
	if _stats_label == null:
		return
	var scene_name := "none"
	var current_scene := get_tree().current_scene
	if current_scene != null:
		scene_name = String(current_scene.name)
	_stats_label.text = "FPS: %d | frame: %.1f ms | scene: %s" % [
		Engine.get_frames_per_second(),
		Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0,
		scene_name,
	]


func _unhandled_input(event: InputEvent) -> void:
	var key_event := event as InputEventKey
	if key_event == null or not key_event.pressed or key_event.echo:
		return
	match key_event.keycode:
		KEY_F1:
			visible = not visible
		KEY_F2:
			var overlay: Node = get_node_or_null("/root/ErrorOverlay")
			if overlay != null and overlay.has_method("show_error"):
				overlay.call("show_error", "Debug test error")


## Builds the panel in code (debug-only UI, so no scene file needed). Sits at
## the top-left with a small offset and sizes itself to its label content.
func _build_ui() -> void:
	var panel := PanelContainer.new()
	panel.name = "StatsPanel"
	panel.offset_left = 8.0
	panel.offset_top = 8.0
	add_child(panel)
	var padding := MarginContainer.new()
	padding.add_theme_constant_override("margin_left", 12)
	padding.add_theme_constant_override("margin_top", 8)
	padding.add_theme_constant_override("margin_right", 12)
	padding.add_theme_constant_override("margin_bottom", 8)
	panel.add_child(padding)
	_stats_label = Label.new()
	_stats_label.add_theme_font_size_override("font_size", 20)
	var mono_font := SystemFont.new()
	mono_font.font_names = PackedStringArray(["Consolas", "Courier New", "monospace"])
	_stats_label.add_theme_font_override("font", mono_font)
	_stats_label.text = "FPS: -- | frame: -- ms | scene: --"
	padding.add_child(_stats_label)
