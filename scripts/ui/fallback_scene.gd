## FallbackScene (Phase 16) — Godot-side "Technical Difficulties" overlay.
##
## Activates on ACTIVATE_FALLBACK command, shows the reason for the fallback.
## Deactivates on DEACTIVATE_FALLBACK command.
##
## Hand-authored — desk-check only, no Godot runtime verification.
class_name FallbackScene
extends PanelContainer

## Emitted when the fallback overlay is dismissed.
signal fallback_deactivated

const COLOR_OVERLAY := Color(0.05, 0.05, 0.15, 0.9)
const COLOR_TEXT := Color(1.0, 1.0, 1.0, 1.0)

const REASON_MESSAGES := {
	"gateway_disconnected": "Gateway disconnected. Reconnecting...",
	"provider_disconnected": "Live provider disconnected. Reconnecting...",
	"vfx_pool_exhausted": "Visual effects degraded. Performance may be reduced.",
	"audio_missing": "Audio unavailable. Stream continues silently.",
	"manual": "Technical difficulties. Please stand by.",
}

var _title_label: Label
var _reason_label: Label
var _current_reason: String = ""
var _is_active: bool = false


func _ready() -> void:
	# Start hidden.
	visible = false
	mouse_filter = Control.MOUSE_FILTER_STOP

	# Semi-transparent overlay background.
	var style := StyleBoxFlat.new()
	style.bg_color = COLOR_OVERLAY
	add_theme_stylebox_override("panel", style)

	# Content container.
	var vbox := VBoxContainer.new()
	vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	vbox.add_theme_constant_override("separation", 24)
	add_child(vbox)

	# Title.
	_title_label = Label.new()
	_title_label.text = "Technical Difficulties"
	_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title_label.add_theme_font_size_override("font_size", 48)
	_title_label.add_theme_color_override("font_color", COLOR_TEXT)
	vbox.add_child(_title_label)

	# Reason.
	_reason_label = Label.new()
	_reason_label.text = ""
	_reason_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_reason_label.add_theme_font_size_override("font_size", 24)
	_reason_label.add_theme_color_override("font_color", COLOR_TEXT)
	vbox.add_child(_reason_label)


## Activate the fallback overlay with a reason string.
func activate(reason: String) -> void:
	_current_reason = reason
	_is_active = true
	visible = true

	# Look up the user-friendly message.
	if REASON_MESSAGES.has(reason):
		_reason_label.text = REASON_MESSAGES[reason]
	else:
		_reason_label.text = "Technical difficulties. Please stand by."

	print("[FallbackScene] Activated: %s" % reason)


## Deactivate the fallback overlay.
func deactivate() -> void:
	_is_active = false
	_current_reason = ""
	visible = false
	_reason_label.text = ""
	fallback_deactivated.emit()
	print("[FallbackScene] Deactivated")


## Returns whether the fallback is currently active.
func is_active() -> bool:
	return _is_active


## Returns the current reason string.
func get_reason() -> String:
	return _current_reason


## Handle incoming commands from the dispatcher.
func handle_command(command: Dictionary) -> void:
	var cmd_type: String = command.get("type", "")
	match cmd_type:
		"ACTIVATE_FALLBACK":
			var metadata: Dictionary = command.get("metadata", {})
			var reason: String = metadata.get("reason", "manual")
			activate(reason)
		"DEACTIVATE_FALLBACK":
			deactivate()
