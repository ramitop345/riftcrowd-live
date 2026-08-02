## Error overlay (autoload "ErrorOverlay").
##
## CanvasLayer on layer 90 that instances scenes/ErrorOverlay.tscn (the single
## source of the UI) and exposes show_error/dismiss. Messages are treated as
## untrusted text: control characters are stripped and the result is truncated
## to MAX_MESSAGE_LENGTH before it ever reaches a Label. Hidden by default.
extends CanvasLayer

const MAX_MESSAGE_LENGTH: int = 300

## Node contract with scenes/ErrorOverlay.tscn. Keep these paths in sync with
## the scene; a mismatch is reported once at startup instead of crashing.
const MESSAGE_LABEL_PATH: String = "Center/Panel/Padding/Content/MessageLabel"
const DISMISS_BUTTON_PATH: String = "Center/Panel/Padding/Content/DismissButton"

const OverlayScene := preload("res://scenes/ErrorOverlay.tscn")

var _root: Control
var _message_label: Label
var _dismiss_button: Button


func _ready() -> void:
	layer = 90
	_root = OverlayScene.instantiate()
	add_child(_root)
	_root.visible = false
	_message_label = _root.get_node_or_null(MESSAGE_LABEL_PATH) as Label
	_dismiss_button = _root.get_node_or_null(DISMISS_BUTTON_PATH) as Button
	if _message_label == null or _dismiss_button == null:
		push_error(
			"ErrorOverlay: scenes/ErrorOverlay.tscn is missing %s or %s"
			% [MESSAGE_LABEL_PATH, DISMISS_BUTTON_PATH]
		)
		return
	_dismiss_button.pressed.connect(dismiss)


## Shows the overlay with a sanitized message and moves focus to Dismiss.
func show_error(message: String) -> void:
	if _root == null or _message_label == null or _dismiss_button == null:
		push_warning("ErrorOverlay unavailable, message dropped: " + message)
		return
	_message_label.text = _sanitize(message)
	_root.visible = true
	_dismiss_button.grab_focus()


func dismiss() -> void:
	if _root != null:
		_root.visible = false


## Untrusted-text rule: drop ASCII control characters (including DEL) and cap
## the length so a hostile message cannot break the layout or spam the layer.
## Pure and static so tests/test_shell.gd can exercise it without a scene tree.
static func _sanitize(message: String) -> String:
	var cleaned := ""
	for character: String in message:
		if cleaned.length() >= MAX_MESSAGE_LENGTH:
			break
		var code := character.unicode_at(0)
		if code < 32 or code == 127:
			continue
		cleaned += character
	return cleaned
