## Shared UI layout constants for the 1080x1920 portrait shell.
##
## The safe-zone margins keep interactive and readable controls clear of the
## TikTok LIVE mobile overlays: the top margin clears the streamer header row,
## the right margin clears the reaction/share rail, the bottom margin clears
## the comment/input bar, and the left margin keeps text off the screen edge.
## All values are pixels in the 1080x1920 design resolution and are the single
## place to tune overlay clearances later.
class_name UiConfig
extends RefCounted

const SAFE_TOP: int = 30
const SAFE_RIGHT: int = 60
const SAFE_BOTTOM: int = 80
const SAFE_LEFT: int = 30

const FONT_SIZE_HEADING: int = 56
const FONT_SIZE_BODY: int = 28
const FONT_SIZE_SMALL: int = 20


## Applies the four safe-zone margins to a screen's root MarginContainer so
## every screen shares the same clearances without duplicating numbers.
static func apply_safe_margins(container: MarginContainer) -> void:
	container.add_theme_constant_override("margin_top", SAFE_TOP)
	container.add_theme_constant_override("margin_right", SAFE_RIGHT)
	container.add_theme_constant_override("margin_bottom", SAFE_BOTTOM)
	container.add_theme_constant_override("margin_left", SAFE_LEFT)
