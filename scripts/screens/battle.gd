## Battle screen (Phase 5) — autonomous arena simulation viewer.
## Hosts the Arena, SimulationSandbox (via BattlePresenter), HUD overlays,
## and speed controls. No network listeners.
extends Control

const Ui := preload("res://scripts/ui/ui_config.gd")
const GC := preload("res://scripts/simulation/gameplay_config.gd")
const ARENA_SCENE_PATH: String = "res://scenes/Arena3D.tscn"
const INITIAL_PRE_TICKS: int = 100
## End-of-battle presentation phases: winners march back to the arena, then a
## stylish celebration message, then the countdown to the next battle.
const RETURN_MARCH_SECONDS: float = 2.6
## Camera holds on the collapsing castle (arena-side) before the march starts.
const DESTRUCTION_SECONDS: float = 3.6
const CELEBRATION_SECONDS: float = 5.0
const NEXT_BATTLE_COUNTDOWN: float = 10.0
## Gate picture-in-picture cameras stay up this long after fresh entries.
const PIP_SHOW_SECONDS: float = 5.0
const MAX_STARS: int = 26
## Event audio (Revision 10) — ElevenLabs-generated SFX + announcer voice lines.
const SFX_DIR: String = "res://assets/audio/sfx/"
const VOICE_DIR: String = "res://assets/audio/voice/"

@onready var _safe_area: MarginContainer = $SafeArea
@onready var _mode_label: Label = $SafeArea/Layout/HUDRegion/HUDLayout/ModeLabel
@onready var _timer_label: Label = $SafeArea/Layout/HUDRegion/HUDLayout/TimerLabel
@onready var _dominion_bar_bg: ColorRect = $SafeArea/Layout/HUDRegion/HUDLayout/DominionRow/DominionBarBg
@onready var _dominion_bar_a: ColorRect = $SafeArea/Layout/HUDRegion/HUDLayout/DominionRow/DominionBarBg/DominionBarA
@onready var _dominion_bar_b: ColorRect = $SafeArea/Layout/HUDRegion/HUDLayout/DominionRow/DominionBarBg/DominionBarB
@onready var _label_a: Label = $SafeArea/Layout/HUDRegion/HUDLayout/HealthRowA/LabelA
@onready var _bar_bga: ColorRect = $SafeArea/Layout/HUDRegion/HUDLayout/HealthRowA/BarBgA
@onready var _bar_fill_a: ColorRect = $SafeArea/Layout/HUDRegion/HUDLayout/HealthRowA/BarBgA/BarFillA
@onready var _pressure_label_a: Label = $SafeArea/Layout/HUDRegion/HUDLayout/HealthRowA/PressureLabelA
@onready var _label_b: Label = $SafeArea/Layout/HUDRegion/HUDLayout/HealthRowB/LabelB
@onready var _bar_bgb: ColorRect = $SafeArea/Layout/HUDRegion/HUDLayout/HealthRowB/BarBgB
@onready var _bar_fill_b: ColorRect = $SafeArea/Layout/HUDRegion/HUDLayout/HealthRowB/BarBgB/BarFillB
@onready var _pressure_label_b: Label = $SafeArea/Layout/HUDRegion/HUDLayout/HealthRowB/PressureLabelB
@onready var _fort_bar_bga: ColorRect = $SafeArea/Layout/HUDRegion/HUDLayout/FortressRowA/FortBarBgA
@onready var _fort_bar_fill_a: ColorRect = $SafeArea/Layout/HUDRegion/HUDLayout/FortressRowA/FortBarBgA/FortBarFillA
@onready var _fort_label_a: Label = $SafeArea/Layout/HUDRegion/HUDLayout/FortressRowA/FortLabelA
@onready var _fort_bar_bgb: ColorRect = $SafeArea/Layout/HUDRegion/HUDLayout/FortressRowB/FortBarBgB
@onready var _fort_bar_fill_b: ColorRect = $SafeArea/Layout/HUDRegion/HUDLayout/FortressRowB/FortBarBgB/FortBarFillB
@onready var _fort_label_b: Label = $SafeArea/Layout/HUDRegion/HUDLayout/FortressRowB/FortLabelB
@onready var _arena_panel: Panel = $SafeArea/Layout/ArenaPanel
@onready var _pause_btn: Button = $SafeArea/Layout/BottomRegion/BottomLayout/SpeedRow/PauseButton
@onready var _speed1_btn: Button = $SafeArea/Layout/BottomRegion/BottomLayout/SpeedRow/Speed1Button
@onready var _speed2_btn: Button = $SafeArea/Layout/BottomRegion/BottomLayout/SpeedRow/Speed2Button
@onready var _speed4_btn: Button = $SafeArea/Layout/BottomRegion/BottomLayout/SpeedRow/Speed4Button
@onready var _restart_btn: Button = $SafeArea/Layout/BottomRegion/BottomLayout/ActionRow/RestartButton
@onready var _end_btn: Button = $SafeArea/Layout/BottomRegion/BottomLayout/ActionRow/EndBattleButton
@onready var _spotlight_label: Label = $SafeArea/Layout/BottomRegion/BottomLayout/SpotlightLabel
@onready var _instruction_label: Label = $SafeArea/Layout/BottomRegion/BottomLayout/InstructionLabel

var _presenter: BattlePresenter = null
var _arena_node: Node = null
var _config: Dictionary = {}
var _faction_a: Dictionary = {}
var _faction_b: Dictionary = {}
var _results_timer: float = -1.0
var _max_fortress_health: float = 500.0

## Top banner announcing every new character added by viewers (red/blue chat).
var _banner_label: Label = null
var _banner_tween: Tween = null
## End-of-battle presentation phase machine ("", destruction, march,
## celebration, countdown).
var _victory_phase: String = ""
var _winner_index: int = -1
var _winner_name: String = ""
var _victory_color: Color = Color(1.0, 0.84, 0.0)
var _victory_overlay: Control = null
var _countdown_overlay: Control = null
var _countdown_digit: Label = null
var _countdown_fill: ColorRect = null
var _countdown_bar_bg: ColorRect = null
var _last_countdown_int: int = -1
var _rays_tween: Tween = null
var _pulse_tween: Tween = null
## Picture-in-picture gate cameras (top corners, share the arena 3D world).
var _pip_cams: Array = [null, null]
var _pip_timers: Array = [0.0, 0.0]

## Alternates technique factions for commands with an unknown factionId (mock mode).
var _next_technique_faction: int = 0

## Viewer join bookkeeping: each viewer may add at most MAX_JOINS_PER_VIEWER
## characters per game by typing red/blue in chat.
const MAX_JOINS_PER_VIEWER: int = 10
var _join_counts: Dictionary = {}  ## viewerId -> characters added this game

## Last-play timestamps (seconds) for throttled audio keys (Revision 10).
var _audio_last: Dictionary = {}

# Orchestrator references (Tier 3 — programmatic instantiation)
var _ws_client: WSClient = null
var _dispatcher: CommandDispatcher = null
var _vfx_pool: VFXPool = null
var _audio_mgr: AudioManager = null
var _readability: ReadabilityOverlay = null
var _window_mgr: WindowManager = null
var _fallback: FallbackScene = null
var _preflight: PreflightScreen = null

# Tier 4 — FRAME_REPORT sender state
var _frame_report_timer: float = 0.0
var _frame_times: Array = []  # rolling window of last 60 frame times (ms)

# Camera shake state
var _shake_node: Node2D = null
var _shake_intensity: float = 0.0
var _shake_duration: float = 0.0
var _shake_timer: float = 0.0


func _ready() -> void:
	# Ensure AppState allows transition to Results when loaded directly.
	if AppState.current != AppState.Screen.BATTLE:
		AppState.current = AppState.Screen.BATTLE
	Ui.apply_safe_margins(_safe_area)
	# Connect buttons.
	_pause_btn.pressed.connect(_on_pause_pressed)
	_speed1_btn.pressed.connect(_on_speed.bind(1.0))
	_speed2_btn.pressed.connect(_on_speed.bind(2.0))
	_speed4_btn.pressed.connect(_on_speed.bind(4.0))
	_restart_btn.pressed.connect(_on_restart_pressed)
	_end_btn.pressed.connect(_on_end_battle_pressed)
	# Load config.
	var result: Dictionary = GC.load_default()
	if result["ok"]:
		_config = result["value"]
	else:
		_config = {}
		_spotlight_label.text = "Config load failed — check console."
	_max_fortress_health = float(_config.get("fortressHealth", 500))
	# Resolve factions from pack registry.
	var factions: Array = _resolve_factions()
	_faction_a = factions[0]
	_faction_b = factions[1]
	# Instantiate 3D arena inside a SubViewportContainer in ArenaPanel.
	var arena_packed: PackedScene = load(ARENA_SCENE_PATH) as PackedScene
	if arena_packed != null:
		# SubViewportContainer manages its own SubViewport and composites automatically.
		var svc := SubViewportContainer.new()
		svc.name = "ArenaSVContainer"
		svc.stretch = true
		svc.set_anchors_preset(Control.PRESET_FULL_RECT)
		_arena_panel.add_child(svc)
		# Create SubViewport inside the container.
		var sv := SubViewport.new()
		sv.name = "ArenaViewport"
		sv.transparent_bg = false
		sv.handle_input_locally = false
		sv.render_target_update_mode = SubViewport.UPDATE_ALWAYS
		# Set an initial size; SubViewportContainer.stretch will resize it.
		var panel_size: Vector2 = _arena_panel.size
		if panel_size.x < 10 or panel_size.y < 10:
			panel_size = Vector2(990, 1354)
		sv.size = Vector2i(int(panel_size.x), int(panel_size.y))
		svc.add_child(sv)
		# Instantiate Arena3D inside the SubViewport.
		_arena_node = arena_packed.instantiate()
		sv.add_child(_arena_node)
		# Picture-in-picture gate cameras share the arena's 3D world.
		_create_pip_cameras(sv)
		if _arena_node.has_signal("arrivals_at_gate"):
			_arena_node.connect("arrivals_at_gate", _on_arrivals_at_gate)
		# Gift cutscenes (galaxy/lion): freeze the sim while the cinematic plays.
		if _arena_node.has_signal("cinematic_started"):
			_arena_node.connect("cinematic_started", _on_cinematic_started)
			_arena_node.connect("cinematic_finished", _on_cinematic_finished)
	# Set up presenter.
	_presenter = BattlePresenter.new()
	_presenter.setup(_config, randi(), _faction_a, _faction_b, _arena_node)
	_presenter.round_completed.connect(_on_round_completed)
	# Initial pre-round ticks (5 seconds at 20 ticks/s).
	if _presenter.sandbox != null and _presenter.sandbox.world != null:
		_presenter.sandbox.world.run_ticks(INITIAL_PRE_TICKS)
		var snap: Dictionary = _presenter.sandbox.world.get_snapshot()
		if _arena_node != null and _arena_node.has_method("apply_snapshot"):
			_arena_node.call("apply_snapshot", snap)
	# Update labels.
	_label_a.text = str(_faction_a.get("displayName", "A"))
	_label_b.text = str(_faction_b.get("displayName", "B"))
	var pack_name: String = ""
	if not PackRegistry.selected_pack_id.is_empty():
		var pack: Dictionary = PackRegistry.find_pack(PackRegistry.selected_pack_id)
		pack_name = str(pack.get("displayName", ""))
	elif not PackRegistry.packs.is_empty():
		var first: Variant = PackRegistry.packs[0]
		if typeof(first) == TYPE_DICTIONARY:
			pack_name = str((first as Dictionary).get("displayName", ""))
	_mode_label.text = "Autonomous Arena — %s" % pack_name if not pack_name.is_empty() else "Autonomous Arena"
	# Initial HUD update.
	_update_hud(_presenter.sandbox.world.get_snapshot() if _presenter.sandbox != null and _presenter.sandbox.world != null else {})
	_create_banner_labels()
	_speed1_btn.grab_focus()

	# --- Tier 3: Programmatic orchestrator instantiation ---
	_instantiate_orchestrators()
	_wire_signals()
	_connect_to_gateway()
	_load_gateway_configs()
	_play_battle_start()


func _process(delta: float) -> void:
	if _presenter == null:
		return
	_tick_pip_cameras(delta)
	# End-of-battle presentation: return march → celebration → countdown.
	if _victory_phase != "":
		_results_timer -= delta
		match _victory_phase:
			"destruction":
				if _results_timer <= 0.0:
					_victory_phase = "march"
					_results_timer = RETURN_MARCH_SECONDS
			"march":
				if _results_timer <= 0.0:
					_begin_celebration()
			"celebration":
				if _results_timer <= 0.0:
					_begin_countdown()
			"countdown":
				_update_countdown_display()
				if _results_timer <= 0.0:
					_teardown_victory_overlays()
					_on_restart_pressed()
		return
	var snapshot: Dictionary = _presenter.present(delta)
	if not snapshot.is_empty():
		_update_hud(snapshot)

	# Tier 4 — FRAME_REPORT sender
	_tier4_frame_report_tick(delta)

	# Camera shake update
	if _shake_timer > 0.0:
		_shake_timer -= delta
		var t: float = _shake_timer / maxf(_shake_duration, 0.01)
		var offset := Vector2(
			randf_range(-1.0, 1.0) * _shake_intensity * t,
			randf_range(-1.0, 1.0) * _shake_intensity * t
		)
		_shake_node.position = offset
	elif _shake_node != null and _shake_node.position != Vector2.ZERO:
		_shake_node.position = Vector2.ZERO


func _update_hud(snapshot: Dictionary) -> void:
	if snapshot.is_empty():
		return
	# Timer: the general battle countdown (10 minutes) plus the current stage.
	var stage: String = str(snapshot.get("stage", "opening"))
	var time_left: float = float(snapshot.get("battle_time_left", 0.0))
	if time_left > 0.0:
		var mins: int = int(time_left) / 60
		var secs: int = int(time_left) % 60
		_timer_label.text = "Battle ends in %d:%02d  [%s]" % [mins, secs, stage]
	else:
		var elapsed: float = float(snapshot.get("elapsed", 0.0))
		var mins2: int = int(elapsed) / 60
		var secs2: int = int(elapsed) % 60
		_timer_label.text = "Round: %s  %d:%02d" % [stage, mins2, secs2]
	# Dominion.
	var dom: Variant = snapshot.get("dominion")
	if typeof(dom) == TYPE_ARRAY and (dom as Array).size() >= 2:
		var dom_arr: Array = dom
		var dom_a: float = float(dom_arr[0])
		var dom_b: float = float(dom_arr[1])
		var bar_total: float = _dominion_bar_bg.size.x
		if bar_total > 0.0:
			_dominion_bar_a.offset_right = bar_total * (dom_a / 100.0)
			_dominion_bar_b.offset_left = -bar_total * (dom_b / 100.0)
			_dominion_bar_b.offset_right = 0.0
	# Top bars: characters still alive on the battlefield per side.
	var alive: Variant = snapshot.get("alive_counts")
	if typeof(alive) == TYPE_ARRAY and (alive as Array).size() >= 2:
		var alive_arr: Array = alive
		var max_per_side: float = maxf(float(snapshot.get("max_units_per_side", 30)), 1.0)
		var bar_w_a: float = _bar_bga.size.x
		var bar_w_b: float = _bar_bgb.size.x
		if bar_w_a > 0.0:
			_bar_fill_a.offset_right = bar_w_a * clampf(float(alive_arr[0]) / max_per_side, 0.0, 1.0)
		if bar_w_b > 0.0:
			_bar_fill_b.offset_right = bar_w_b * clampf(float(alive_arr[1]) / max_per_side, 0.0, 1.0)
		_pressure_label_a.text = "%d/%d" % [int(alive_arr[0]), int(max_per_side)]
		_pressure_label_b.text = "%d/%d" % [int(alive_arr[1]), int(max_per_side)]
	# Fortress health bars (HUD).
	var fh: Variant = snapshot.get("fortress_health")
	if typeof(fh) == TYPE_ARRAY and (fh as Array).size() >= 2:
		var fh_arr: Array = fh
		var max_fort_hp: float = maxf(_max_fortress_health, 1.0)
		var fort_a_frac: float = clampf(float(fh_arr[0]) / max_fort_hp, 0.0, 1.0)
		var fort_b_frac: float = clampf(float(fh_arr[1]) / max_fort_hp, 0.0, 1.0)
		var fort_w_a: float = _fort_bar_bga.size.x
		var fort_w_b: float = _fort_bar_bgb.size.x
		if fort_w_a > 0.0:
			_fort_bar_fill_a.offset_right = fort_w_a * fort_a_frac
		if fort_w_b > 0.0:
			_fort_bar_fill_b.offset_right = fort_w_b * fort_b_frac
		_fort_label_a.text = "%d%%" % int(fort_a_frac * 100.0)
		_fort_label_b.text = "%d%%" % int(fort_b_frac * 100.0)
		# Color shift: green > yellow > red as health drops.
		if fort_a_frac > 0.5:
			_fort_bar_fill_a.color = Color(0.3, 0.7, 1.0, 1)
		elif fort_a_frac > 0.25:
			_fort_bar_fill_a.color = Color(0.9, 0.7, 0.2, 1)
		else:
			_fort_bar_fill_a.color = Color(0.9, 0.3, 0.2, 1)
		if fort_b_frac > 0.5:
			_fort_bar_fill_b.color = Color(1.0, 0.5, 0.4, 1)
		elif fort_b_frac > 0.25:
			_fort_bar_fill_b.color = Color(0.9, 0.7, 0.2, 1)
		else:
			_fort_bar_fill_b.color = Color(0.9, 0.3, 0.2, 1)
	# Event spotlight + viewer-join banners.
	var events: Variant = snapshot.get("events")
	if typeof(events) == TYPE_ARRAY and not (events as Array).is_empty():
		for ev: Variant in (events as Array):
			var ev_str: String = str(ev)
			if ev_str.begins_with("unit_joined:"):
				var parts: PackedStringArray = ev_str.split(":", true, 2)
				if parts.size() >= 3:
					_show_join_banner(parts[2], int(parts[1]))
				_play_sfx("spawn_chime.mp3")
				_play_voice("voice_warrior_joins.mp3", 8.0)
			elif ev_str.begins_with("unit_died:"):
				_play_sfx("laser_burst.mp3", 1.2)
			elif ev_str.begins_with("siege_started:"):
				_show_wipe_banner(int(ev_str.split(":")[1]))
				_play_sfx("laser_burst.mp3")
		_spotlight_label.text = str((events as Array).back())


func _resolve_factions() -> Array:
	var default_a: Dictionary = {"id": "alpha", "displayName": "Alpha"}
	var default_b: Dictionary = {"id": "beta", "displayName": "Beta"}
	var pack: Dictionary = {}
	if not PackRegistry.selected_pack_id.is_empty():
		pack = PackRegistry.find_pack(PackRegistry.selected_pack_id)
	elif not PackRegistry.packs.is_empty():
		var first: Variant = PackRegistry.packs[0]
		if typeof(first) == TYPE_DICTIONARY:
			pack = first
	if pack.is_empty():
		return [default_a, default_b]
	var factions: Variant = pack.get("factions")
	if typeof(factions) != TYPE_ARRAY or (factions as Array).size() < 2:
		return [default_a, default_b]
	var f_arr: Array = factions
	var fa: Dictionary = f_arr[0] if typeof(f_arr[0]) == TYPE_DICTIONARY else default_a
	var fb: Dictionary = f_arr[1] if typeof(f_arr[1]) == TYPE_DICTIONARY else default_b
	return [fa, fb]


func _on_pause_pressed() -> void:
	_play_sfx("ui_click.mp3")
	_presenter.toggle_pause()


func _on_speed(speed: float) -> void:
	_play_sfx("ui_click.mp3")
	_presenter.set_speed(speed)


func _on_restart_pressed() -> void:
	_play_sfx("ui_click.mp3")
	_teardown_victory_overlays()
	_victory_phase = ""
	_results_timer = -1.0
	_pip_timers = [0.0, 0.0]
	_join_counts.clear()
	for fac in 2:
		var pip: SubViewportContainer = _pip_cams[fac]
		if pip != null:
			pip.visible = false
	_presenter.restart(randi())
	_spotlight_label.text = "Round restarted..."
	_play_battle_start()


func _on_end_battle_pressed() -> void:
	_play_sfx("ui_click.mp3")
	if _presenter != null and _presenter.sandbox != null:
		_presenter.sandbox.paused = true
	AppState.goto(AppState.Screen.RESULTS)


## Gift cutscene (galaxy/lion) started — freeze the sandbox so the cinematic
## plays over a still battlefield; the sim resumes when the scene ends.
func _on_cinematic_started() -> void:
	if _presenter != null and _presenter.sandbox != null:
		_presenter.sandbox.paused = true


func _on_cinematic_finished() -> void:
	if _presenter != null and _presenter.sandbox != null:
		_presenter.sandbox.paused = false


# ---------------------------------------------------------------------------
# Event audio (Revision 10) — ElevenLabs assets in res://assets/audio/
# ---------------------------------------------------------------------------

## Plays a sound effect from assets/audio/sfx; optional minimum gap throttles
## chatty events (e.g. per-death laser bursts).
func _play_sfx(track_name: String, min_gap_sec: float = 0.0) -> void:
	if _audio_mgr == null:
		return
	if not _audio_gap_ok(track_name, min_gap_sec):
		return
	_audio_mgr.play(SFX_DIR + track_name, "sfx")


## Plays an announcer line from assets/audio/voice on the dedicated voice
## player, throttled per-line so spammy events never stack chatter.
func _play_voice(track_name: String, min_gap_sec: float = 0.0) -> void:
	if _audio_mgr == null:
		return
	if not _audio_gap_ok(track_name, min_gap_sec):
		return
	_audio_mgr.play(VOICE_DIR + track_name, "voice")


## Throttle check: returns true (and records the timestamp) when enough time
## has passed since the key last played.
func _audio_gap_ok(key: String, min_gap_sec: float) -> bool:
	if min_gap_sec <= 0.0:
		return true
	var now: float = float(Time.get_ticks_msec()) / 1000.0
	var last: float = float(_audio_last.get(key, -1.0e9))
	if now - last < min_gap_sec:
		return false
	_audio_last[key] = now
	return true


## Horn + announcer line at battle start and on every restart.
func _play_battle_start() -> void:
	_play_sfx("battle_horn.mp3")
	_play_voice("voice_battle_begins.mp3", 4.0)


func _on_round_completed(snapshot: Dictionary) -> void:
	_winner_index = int(snapshot.get("winner", -1))
	var vtype: String = str(snapshot.get("victory_type", ""))
	_winner_name = "Draw"
	if _winner_index == 0:
		_winner_name = str(_faction_a.get("displayName", "A"))
	elif _winner_index == 1:
		_winner_name = str(_faction_b.get("displayName", "B"))
	_spotlight_label.text = "Victory: %s (%s)" % [_winner_name, vtype]
	if _winner_index == 0:
		_victory_color = Color(0.35, 0.6, 1.0)
	elif _winner_index == 1:
		_victory_color = Color(1.0, 0.4, 0.3)
	else:
		_victory_color = Color(1.0, 0.84, 0.0)
	if vtype == "fortress" and _winner_index >= 0:
		# Phase 0 — the arena holds the camera on the collapsing castle;
		# the banner announces the fall while the destruction plays out.
		_victory_phase = "destruction"
		_results_timer = DESTRUCTION_SECONDS
		_show_fall_banner()
		_play_sfx("explosion.mp3")
		_play_voice("voice_fortress_fallen.mp3")
		# The fallen fortress gauge must read exactly 0% the moment the
		# destruction is announced — never a stale percentage above zero.
		var fallen_index: int = 1 - _winner_index
		if fallen_index == 0:
			_fort_bar_fill_a.offset_right = 0.0
			_fort_label_a.text = "0%"
		else:
			_fort_bar_fill_b.offset_right = 0.0
			_fort_label_b.text = "0%"
	else:
		# Phase 1 — the winners march back to the arena to celebrate (arena-side
		# tweens); no overlay yet so the march stays fully visible.
		_victory_phase = "march"
		_results_timer = RETURN_MARCH_SECONDS


## Creates the top banner (viewer joins) once.
func _create_banner_labels() -> void:
	_banner_label = Label.new()
	_banner_label.name = "JoinBanner"
	_banner_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_banner_label.add_theme_font_size_override("font_size", 34)
	_banner_label.add_theme_color_override("font_color", Color.WHITE)
	_banner_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	_banner_label.add_theme_constant_override("shadow_offset_y", 2)
	_banner_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_banner_label.position = Vector2(-300, 210)
	_banner_label.size = Vector2(600, 60)
	_banner_label.modulate.a = 0.0
	_banner_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_banner_label)


## Slides the join banner in from the top for ~2.5 s. Called for every new
## character added to the battlefield by a viewer.
func _show_join_banner(viewer_name: String, faction: int) -> void:
	if _banner_label == null:
		return
	var side_name: String = "BLUE" if faction == 0 else "RED"
	var col: Color = Color(0.45, 0.7, 1.0) if faction == 0 else Color(1.0, 0.5, 0.4)
	_banner_label.text = "%s joined the %s army!" % [viewer_name, side_name]
	_banner_label.add_theme_color_override("font_color", col)
	if _banner_tween != null and _banner_tween.is_valid():
		_banner_tween.kill()
	_banner_label.modulate.a = 0.0
	_banner_label.position.y = 150.0
	_banner_tween = create_tween()
	_banner_tween.tween_property(_banner_label, "position:y", 210.0, 0.25)
	_banner_tween.parallel().tween_property(_banner_label, "modulate:a", 1.0, 0.25)
	_banner_tween.tween_interval(2.0)
	_banner_tween.tween_property(_banner_label, "modulate:a", 0.0, 0.4)


## Stylish announcement when one team has no opponents left: a dark strip
## pops open with the winner's accent bars, the headline scales in with a
## back-ease overshoot, holds, then fades away.
func _show_wipe_banner(winner_faction: int) -> void:
	var winner_name: String
	var loser_name: String
	if winner_faction == 0:
		winner_name = str(_faction_a.get("displayName", "A"))
		loser_name = str(_faction_b.get("displayName", "B"))
	else:
		winner_name = str(_faction_b.get("displayName", "B"))
		loser_name = str(_faction_a.get("displayName", "A"))
	var col: Color = Color(0.35, 0.6, 1.0) if winner_faction == 0 else Color(1.0, 0.4, 0.3)
	var view_w: float = size.x if size.x > 10.0 else 1080.0
	var strip := ColorRect.new()
	strip.name = "WipeBanner"
	strip.color = Color(0.02, 0.02, 0.05, 0.78)
	strip.size = Vector2(view_w, 170.0)
	strip.position = Vector2(0.0, 470.0)
	strip.pivot_offset = Vector2(view_w * 0.5, 85.0)
	strip.scale = Vector2(1.0, 0.0)
	strip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var top_accent := ColorRect.new()
	top_accent.color = Color(col.r, col.g, col.b, 0.95)
	top_accent.size = Vector2(view_w, 5.0)
	top_accent.mouse_filter = Control.MOUSE_FILTER_IGNORE
	strip.add_child(top_accent)
	var bottom_accent := ColorRect.new()
	bottom_accent.color = Color(col.r, col.g, col.b, 0.95)
	bottom_accent.size = Vector2(view_w, 5.0)
	bottom_accent.position = Vector2(0.0, 165.0)
	bottom_accent.mouse_filter = Control.MOUSE_FILTER_IGNORE
	strip.add_child(bottom_accent)
	var title := Label.new()
	title.text = "%s WIPED OUT!" % loser_name.to_upper()
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 54)
	title.add_theme_color_override("font_color", col)
	title.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
	title.add_theme_constant_override("shadow_offset_y", 3)
	title.position = Vector2(0.0, 22.0)
	title.size = Vector2(view_w, 70.0)
	title.pivot_offset = Vector2(view_w * 0.5, 35.0)
	title.scale = Vector2(0.6, 0.6)
	title.modulate.a = 0.0
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	strip.add_child(title)
	var sub := Label.new()
	sub.text = "THE %s MARCH ON THE CASTLE" % winner_name.to_upper()
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.add_theme_font_size_override("font_size", 30)
	sub.add_theme_color_override("font_color", Color(0.92, 0.94, 1.0))
	sub.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
	sub.add_theme_constant_override("shadow_offset_y", 2)
	sub.position = Vector2(0.0, 102.0)
	sub.size = Vector2(view_w, 44.0)
	sub.modulate.a = 0.0
	sub.mouse_filter = Control.MOUSE_FILTER_IGNORE
	strip.add_child(sub)
	add_child(strip)
	var tw := create_tween()
	tw.tween_property(strip, "scale", Vector2.ONE, 0.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(title, "scale", Vector2.ONE, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(title, "modulate:a", 1.0, 0.2)
	tw.tween_property(sub, "modulate:a", 1.0, 0.25)
	tw.tween_interval(2.6)
	tw.tween_property(strip, "modulate:a", 0.0, 0.45)
	tw.tween_callback(strip.queue_free)


## Companion banner shown while the castle collapse plays: same stylish strip
## as the wipe banner, announcing the fallen castle and the victors.
func _show_fall_banner() -> void:
	var winner_name: String
	var loser_name: String
	if _winner_index == 0:
		winner_name = str(_faction_a.get("displayName", "A"))
		loser_name = str(_faction_b.get("displayName", "B"))
	else:
		winner_name = str(_faction_b.get("displayName", "B"))
		loser_name = str(_faction_a.get("displayName", "A"))
	var col: Color = _victory_color
	var view_w: float = size.x if size.x > 10.0 else 1080.0
	var strip := ColorRect.new()
	strip.name = "FallBanner"
	strip.color = Color(0.03, 0.02, 0.02, 0.8)
	strip.size = Vector2(view_w, 170.0)
	strip.position = Vector2(0.0, 470.0)
	strip.pivot_offset = Vector2(view_w * 0.5, 85.0)
	strip.scale = Vector2(1.0, 0.0)
	strip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var top_accent := ColorRect.new()
	top_accent.color = Color(col.r, col.g, col.b, 0.95)
	top_accent.size = Vector2(view_w, 5.0)
	top_accent.mouse_filter = Control.MOUSE_FILTER_IGNORE
	strip.add_child(top_accent)
	var bottom_accent := ColorRect.new()
	bottom_accent.color = Color(col.r, col.g, col.b, 0.95)
	bottom_accent.size = Vector2(view_w, 5.0)
	bottom_accent.position = Vector2(0.0, 165.0)
	bottom_accent.mouse_filter = Control.MOUSE_FILTER_IGNORE
	strip.add_child(bottom_accent)
	var title := Label.new()
	title.text = "%s CASTLE DESTROYED!" % loser_name.to_upper()
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 54)
	title.add_theme_color_override("font_color", col)
	title.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
	title.add_theme_constant_override("shadow_offset_y", 3)
	title.position = Vector2(0.0, 22.0)
	title.size = Vector2(view_w, 70.0)
	title.pivot_offset = Vector2(view_w * 0.5, 35.0)
	title.scale = Vector2(0.6, 0.6)
	title.modulate.a = 0.0
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	strip.add_child(title)
	var sub := Label.new()
	sub.text = "THE %s CLAIM VICTORY" % winner_name.to_upper()
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.add_theme_font_size_override("font_size", 30)
	sub.add_theme_color_override("font_color", Color(0.92, 0.94, 1.0))
	sub.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
	sub.add_theme_constant_override("shadow_offset_y", 2)
	sub.position = Vector2(0.0, 102.0)
	sub.size = Vector2(view_w, 44.0)
	sub.modulate.a = 0.0
	sub.mouse_filter = Control.MOUSE_FILTER_IGNORE
	strip.add_child(sub)
	add_child(strip)
	var tw := create_tween()
	tw.tween_property(strip, "scale", Vector2.ONE, 0.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(title, "scale", Vector2.ONE, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(title, "modulate:a", 1.0, 0.2)
	tw.tween_property(sub, "modulate:a", 1.0, 0.25)
	tw.tween_interval(3.0)
	tw.tween_property(strip, "modulate:a", 0.0, 0.45)
	tw.tween_callback(strip.queue_free)


## Raining stars in the winner's color across the whole screen.
func _spawn_victory_stars(col: Color) -> void:
	var view_w: float = size.x if size.x > 10.0 else 1080.0
	var view_h: float = size.y if size.y > 10.0 else 1920.0
	for i in MAX_STARS:
		var star := Polygon2D.new()
		var radius: float = randf_range(10.0, 26.0)
		star.polygon = _star_points(radius)
		star.color = col.lerp(Color(1.0, 0.95, 0.6), randf_range(0.0, 0.5))
		star.position = Vector2(randf_range(0.0, view_w), randf_range(-view_h * 0.5, -20.0))
		add_child(star)
		var fall_time: float = randf_range(1.8, 3.6)
		var tw := create_tween()
		tw.set_parallel(true)
		tw.tween_property(star, "position:y", view_h + 40.0, fall_time)
		tw.tween_property(star, "rotation", randf_range(-TAU, TAU), fall_time)
		tw.chain().tween_callback(star.queue_free)


## 5-point star polygon for the victory celebration.
func _star_points(radius: float) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for i in 10:
		var angle: float = float(i) * TAU / 10.0 - PI / 2.0
		var r: float = radius if i % 2 == 0 else radius * 0.45
		pts.append(Vector2(cos(angle), sin(angle)) * r)
	return pts


# ===========================================================================
# Picture-in-picture gate cameras (new character entries from the castles)
# ===========================================================================

## Two small cameras over the castle gates. They share the arena's 3D world
## and stay hidden until new characters walk out of a castle — then the
## matching camera pops up for PIP_SHOW_SECONDS. Each PIP sits on the SAME
## screen side as its fortress appears in the main view (the master camera
## looks from -Z toward +Z, so the west fortress renders screen-right).
func _create_pip_cameras(main_viewport: SubViewport) -> void:
	_pip_cams[0] = _create_pip_camera(main_viewport.world_3d, 0)
	_pip_cams[1] = _create_pip_camera(main_viewport.world_3d, 1)


func _create_pip_camera(world: World3D, faction_index: int) -> SubViewportContainer:
	var pip_w := 300.0
	var pip_h := 190.0
	var svc := SubViewportContainer.new()
	# Fortress world side: faction 0 is west (x=-21), faction 1 east (x=+21).
	var world_side: float = -1.0 if faction_index == 0 else 1.0
	# Screen placement mirrors the main view: west fortress = screen right.
	var screen_left: bool = faction_index == 1
	svc.name = "PipCamLeft" if screen_left else "PipCamRight"
	svc.stretch = true
	svc.visible = false
	svc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if screen_left:
		svc.set_anchors_preset(Control.PRESET_TOP_LEFT)
		svc.position = Vector2(18, 18)
	else:
		svc.set_anchors_preset(Control.PRESET_TOP_RIGHT)
		svc.position = Vector2(-pip_w - 18, 18)
	svc.size = Vector2(pip_w, pip_h)
	var svp := SubViewport.new()
	svp.world_3d = world
	svp.transparent_bg = false
	# UPDATE_WHEN_VISIBLE: a hidden PIP cam must not keep rendering the whole
	# 3D world every frame (that tripled GPU cost while the PIP was invisible).
	svp.render_target_update_mode = SubViewport.UPDATE_WHEN_VISIBLE
	svp.size = Vector2i(int(pip_w), int(pip_h))
	# Camera sits between the arena and its castle, framing the gate so
	# fresh characters walking out are front and center.
	var cam := Camera3D.new()
	cam.position = Vector3(world_side * 13.5, 6.0, -8.5)
	cam.look_at_from_position(cam.position, Vector3(world_side * 21.0, 2.5, 0.0), Vector3.UP)
	cam.fov = 50.0
	cam.current = true  # current inside the PIP viewport only
	svp.add_child(cam)
	svc.add_child(svp)
	var tag := Label.new()
	tag.text = "BLUE GATE" if faction_index == 0 else "RED GATE"
	tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tag.add_theme_font_size_override("font_size", 15)
	tag.add_theme_color_override("font_color", Color(0.85, 0.9, 1.0))
	tag.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
	tag.add_theme_constant_override("shadow_offset_y", 1)
	tag.anchor_left = 0.0
	tag.anchor_right = 1.0
	tag.anchor_top = 1.0
	tag.anchor_bottom = 1.0
	tag.offset_top = -22.0
	tag.offset_bottom = 0.0
	tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	svc.add_child(tag)
	_arena_panel.add_child(svc)
	return svc


## The arena spotted fresh fighters at a castle gate — show that side's PIP
## camera for PIP_SHOW_SECONDS (further arrivals refresh the window).
func _on_arrivals_at_gate(faction: int) -> void:
	if faction < 0 or faction > 1:
		return
	_pip_timers[faction] = PIP_SHOW_SECONDS
	var pip: SubViewportContainer = _pip_cams[faction]
	if pip != null:
		pip.visible = true


## Counts down the PIP windows and hides cameras whose time is up.
func _tick_pip_cameras(delta: float) -> void:
	for fac in 2:
		if float(_pip_timers[fac]) > 0.0:
			_pip_timers[fac] = float(_pip_timers[fac]) - delta
			if float(_pip_timers[fac]) <= 0.0:
				var pip: SubViewportContainer = _pip_cams[fac]
				if pip != null:
					pip.visible = false


# ===========================================================================
# Victory presentation: celebration overlay + stylish countdown
# ===========================================================================

## Phase 2 — stylish celebration message for CELEBRATION_SECONDS: dimmed
## arena, rotating starburst rays in the winner's color, a punch-scaling
## headline and a rain of stars.
func _begin_celebration() -> void:
	_victory_phase = "celebration"
	_results_timer = CELEBRATION_SECONDS
	_build_celebration_overlay()
	_play_sfx("victory_cheer.mp3")
	_play_voice("voice_victory.mp3")
	_spawn_victory_stars(_victory_color)
	# Celebratory bursts across the arena to punctuate the win.
	if _vfx_pool != null:
		var burst_color: String = "#ffd700"
		if _winner_index == 0:
			burst_color = "#66aaff"
		elif _winner_index == 1:
			burst_color = "#ff6655"
		for i in 4:
			var params: Dictionary = {
				"x": randf_range(200.0, 880.0),
				"y": randf_range(300.0, 900.0),
				"color": burst_color,
				"duration": 2.0,
			}
			_vfx_pool.acquire("particle", params)


func _build_celebration_overlay() -> void:
	_teardown_victory_overlays()
	var root := Control.new()
	root.name = "VictoryOverlay"
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	_victory_overlay = root
	# Dim veil so the presentation reads over the 3D arena.
	var veil := ColorRect.new()
	veil.color = Color(0.0, 0.0, 0.05, 0.55)
	veil.set_anchors_preset(Control.PRESET_FULL_RECT)
	veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(veil)
	# Slowly rotating starburst rays behind the headline.
	var rays := Polygon2D.new()
	rays.name = "Rays"
	rays.polygon = _ray_burst_points(520.0)
	rays.color = Color(_victory_color.r, _victory_color.g, _victory_color.b, 0.22)
	rays.position = size * 0.5
	root.add_child(rays)
	_rays_tween = create_tween().set_loops()
	_rays_tween.tween_property(rays, "rotation", TAU, 24.0)
	# Winner headline with a punch-scale entrance + gentle pulse.
	var headline := Label.new()
	headline.name = "VictoryHeadline"
	var headline_text: String = "DRAW!" if _winner_index < 0 else "%s WINS THE BATTLE!" % _winner_name.to_upper()
	headline.text = headline_text
	headline.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	headline.add_theme_font_size_override("font_size", 64)
	headline.add_theme_color_override("font_color", _victory_color)
	headline.add_theme_constant_override("outline_size", 14)
	headline.add_theme_color_override("font_outline_color", Color(0.05, 0.03, 0.1, 1.0))
	headline.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
	headline.add_theme_constant_override("shadow_offset_y", 4)
	headline.set_anchors_preset(Control.PRESET_CENTER)
	headline.position = Vector2(-540, -140)
	headline.size = Vector2(1080, 100)
	headline.pivot_offset = Vector2(540, 50)
	headline.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(headline)
	_pulse_tween = create_tween().set_loops()
	_pulse_tween.tween_property(headline, "scale", Vector2(1.25, 1.25), 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_pulse_tween.tween_property(headline, "scale", Vector2.ONE, 0.2).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN_OUT)
	_pulse_tween.tween_property(headline, "scale", Vector2(1.06, 1.06), 0.6).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_pulse_tween.tween_property(headline, "scale", Vector2.ONE, 0.6).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	# Sub line under the headline.
	var sub := Label.new()
	sub.name = "VictorySub"
	var sub_text: String = "No side could claim the arena" if _winner_index < 0 else "The arena belongs to the %s!" % _winner_name.to_upper()
	sub.text = sub_text
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.add_theme_font_size_override("font_size", 30)
	sub.add_theme_color_override("font_color", Color(0.95, 0.95, 1.0))
	sub.add_theme_constant_override("outline_size", 8)
	sub.add_theme_color_override("font_outline_color", Color(0.05, 0.03, 0.1, 1.0))
	sub.set_anchors_preset(Control.PRESET_CENTER)
	sub.position = Vector2(-540, -25)
	sub.size = Vector2(1080, 50)
	sub.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(sub)
	# Fade the whole overlay in.
	root.modulate.a = 0.0
	var fade := create_tween()
	fade.tween_property(root, "modulate:a", 1.0, 0.35)


## Phase 3 — stylish countdown to the next battle: huge pop-in digits above a
## progress bar that drains in the winner's color.
func _begin_countdown() -> void:
	_victory_phase = "countdown"
	_results_timer = NEXT_BATTLE_COUNTDOWN
	_last_countdown_int = -1
	_play_voice("voice_next_battle.mp3")
	_teardown_victory_overlays()
	var root := Control.new()
	root.name = "CountdownOverlay"
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	_countdown_overlay = root
	var veil := ColorRect.new()
	veil.color = Color(0.0, 0.0, 0.05, 0.5)
	veil.set_anchors_preset(Control.PRESET_FULL_RECT)
	veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(veil)
	var caption := Label.new()
	caption.text = "NEXT BATTLE IN"
	caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	caption.add_theme_font_size_override("font_size", 34)
	caption.add_theme_color_override("font_color", Color(0.9, 0.9, 1.0))
	caption.add_theme_constant_override("outline_size", 8)
	caption.add_theme_color_override("font_outline_color", Color(0.05, 0.03, 0.1, 1.0))
	caption.set_anchors_preset(Control.PRESET_CENTER)
	caption.position = Vector2(-300, -230)
	caption.size = Vector2(600, 50)
	caption.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(caption)
	_countdown_digit = Label.new()
	_countdown_digit.text = str(int(NEXT_BATTLE_COUNTDOWN))
	_countdown_digit.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_countdown_digit.add_theme_font_size_override("font_size", 160)
	_countdown_digit.add_theme_color_override("font_color", _victory_color)
	_countdown_digit.add_theme_constant_override("outline_size", 18)
	_countdown_digit.add_theme_color_override("font_outline_color", Color(0.05, 0.03, 0.1, 1.0))
	_countdown_digit.set_anchors_preset(Control.PRESET_CENTER)
	_countdown_digit.position = Vector2(-200, -160)
	_countdown_digit.size = Vector2(400, 220)
	_countdown_digit.pivot_offset = Vector2(200, 110)
	_countdown_digit.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(_countdown_digit)
	# Progress bar draining toward the next battle.
	var bar_w := 620.0
	_countdown_bar_bg = ColorRect.new()
	_countdown_bar_bg.color = Color(1.0, 1.0, 1.0, 0.16)
	_countdown_bar_bg.set_anchors_preset(Control.PRESET_CENTER)
	_countdown_bar_bg.position = Vector2(-bar_w / 2.0, 110)
	_countdown_bar_bg.size = Vector2(bar_w, 18)
	_countdown_bar_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(_countdown_bar_bg)
	_countdown_fill = ColorRect.new()
	_countdown_fill.color = _victory_color
	_countdown_fill.position = Vector2.ZERO
	_countdown_fill.size = Vector2(bar_w, 18)
	_countdown_fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_countdown_bar_bg.add_child(_countdown_fill)
	root.modulate.a = 0.0
	var fade := create_tween()
	fade.tween_property(root, "modulate:a", 1.0, 0.3)


## Updates the countdown digit (pop animation on every new second) and the
## draining progress bar.
func _update_countdown_display() -> void:
	if _countdown_digit == null:
		return
	var secs_left: int = maxi(ceili(_results_timer), 0)
	if secs_left != _last_countdown_int:
		_last_countdown_int = secs_left
		_countdown_digit.text = str(secs_left)
		if secs_left >= 1 and secs_left <= 3:
			_play_sfx("countdown_beep.mp3")
		_countdown_digit.scale = Vector2(1.5, 1.5)
		var tw := create_tween()
		tw.tween_property(_countdown_digit, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	if _countdown_fill != null and _countdown_bar_bg != null:
		var frac: float = clampf(_results_timer / NEXT_BATTLE_COUNTDOWN, 0.0, 1.0)
		_countdown_fill.size.x = _countdown_bar_bg.size.x * frac


## Frees both overlays and their looping animations.
func _teardown_victory_overlays() -> void:
	if _rays_tween != null and _rays_tween.is_valid():
		_rays_tween.kill()
	_rays_tween = null
	if _pulse_tween != null and _pulse_tween.is_valid():
		_pulse_tween.kill()
	_pulse_tween = null
	if _victory_overlay != null and is_instance_valid(_victory_overlay):
		_victory_overlay.queue_free()
	_victory_overlay = null
	if _countdown_overlay != null and is_instance_valid(_countdown_overlay):
		_countdown_overlay.queue_free()
	_countdown_overlay = null
	_countdown_digit = null
	_countdown_fill = null
	_countdown_bar_bg = null


## Starburst polygon (alternating long/short spikes) for the celebration backdrop.
func _ray_burst_points(radius: float) -> PackedVector2Array:
	var pts := PackedVector2Array()
	var spikes: int = 14
	for i in spikes * 2:
		var angle: float = float(i) * TAU / float(spikes * 2)
		var r: float = radius if i % 2 == 0 else radius * 0.18
		pts.append(Vector2(cos(angle), sin(angle)) * r)
	return pts


# ===========================================================================
# Tier 3 — Orchestrator instantiation, signal wiring, gateway connection
# ===========================================================================

## Instantiate all orchestrator nodes programmatically (avoids editing Battle.tscn).
func _instantiate_orchestrators() -> void:
	var ws_client := WSClient.new()
	ws_client.name = "WSClient"
	add_child(ws_client)

	var dispatcher := CommandDispatcher.new()
	dispatcher.name = "CommandDispatcher"
	add_child(dispatcher)

	var vfx_pool := VFXPool.new()
	vfx_pool.name = "VFXPool"
	add_child(vfx_pool)

	var audio_mgr := AudioManager.new()
	audio_mgr.name = "AudioManager"
	add_child(audio_mgr)

	var readability := ReadabilityOverlay.new()
	readability.name = "ReadabilityOverlay"
	add_child(readability)

	var window_mgr := WindowManager.new()
	window_mgr.name = "WindowManager"
	add_child(window_mgr)

	var fallback := FallbackScene.new()
	fallback.name = "FallbackScene"
	fallback.visible = false
	add_child(fallback)

	var preflight := PreflightScreen.new()
	preflight.name = "PreflightScreen"
	preflight.visible = false
	add_child(preflight)

	_ws_client = ws_client
	_dispatcher = dispatcher
	_vfx_pool = vfx_pool
	_audio_mgr = audio_mgr
	_readability = readability
	_window_mgr = window_mgr
	_fallback = fallback
	_preflight = preflight


## Wire WSClient → CommandDispatcher → subsystem handlers.
func _wire_signals() -> void:
	# WSClient → CommandDispatcher
	_ws_client.command_received.connect(_dispatcher.dispatch)

	# CommandDispatcher → Battle handlers (Phase 15/16 orchestrators)
	_dispatcher.spawn_vfx.connect(_on_spawn_vfx)
	_dispatcher.play_audio.connect(_on_play_audio)
	_dispatcher.activate_fallback.connect(_on_activate_fallback)
	_dispatcher.deactivate_fallback.connect(_on_deactivate_fallback)
	_dispatcher.set_window_mode.connect(_on_set_window_mode)
	_dispatcher.spotlight_card.connect(_on_spotlight_card)
	_dispatcher.supporter_callout.connect(_on_supporter_callout)
	_dispatcher.camera_impulse.connect(_on_camera_impulse)

	# Phase 17/Tier 4 — quality tier signal
	_dispatcher.set_quality_tier.connect(_on_set_quality_tier)

	# Phase 10/11/12 gameplay signals (connected for observability; stubs for Tier 4)
	_dispatcher.gift_apply.connect(_on_gift_apply)
	_dispatcher.faction_join.connect(_on_faction_join)
	_dispatcher.display_spotlight.connect(_on_display_spotlight)
	_dispatcher.end_round.connect(_on_end_round_cmd)

	# Gift technique system — CAST_TECHNIQUE drives sim effects + arena visuals.
	_dispatcher.cast_technique.connect(_on_cast_technique)

	# Bind ConnectionStatus HUD to WSClient signals.
	var conn_status := $ConnectionStatus as ConnectionStatus
	if conn_status != null:
		conn_status.bind_to_ws_client(_ws_client)


## Connect WSClient to the gateway WebSocket.
func _connect_to_gateway() -> void:
	var token: String = OS.get_environment("RIFTCROWD_TOKEN")
	if token.is_empty():
		token = "change-me"  # dev fallback
	_ws_client.connect_to_server("ws://127.0.0.1:8787/ws/game", token)


## Load per-subsystem configs from gateway HTTP endpoints.
func _load_gateway_configs() -> void:
	_vfx_pool.load_config_from_gateway()
	if _audio_mgr.has_method("load_config_from_gateway"):
		_audio_mgr.call("load_config_from_gateway")
	else:
		push_warning("battle.gd: AudioManager lacks load_config_from_gateway()")
	if _readability.has_method("load_config_from_gateway"):
		_readability.call("load_config_from_gateway")
	else:
		push_warning("battle.gd: ReadabilityOverlay lacks load_config_from_gateway()")
	# WindowManager loads its own config in _ready() via _load_config_from_gateway().


# ---------------------------------------------------------------------------
# Tier 3 signal handlers
# ---------------------------------------------------------------------------

func _on_spawn_vfx(cmd: Dictionary) -> void:
	var vfx_type: String = str(cmd.get("vfxType", "particle"))
	var params: Dictionary = {
		"x": cmd.get("x", 540),
		"y": cmd.get("y", 960),
		"color": cmd.get("color", "#ffffff"),
		"duration": cmd.get("duration", 1.0),
	}
	_vfx_pool.acquire(vfx_type, params)


func _on_play_audio(cmd: Dictionary) -> void:
	if _audio_mgr.has_method("_on_play_audio"):
		_audio_mgr.call("_on_play_audio", cmd)


func _on_activate_fallback(cmd: Dictionary) -> void:
	_fallback.visible = true
	if _fallback.has_method("handle_command"):
		_fallback.call("handle_command", cmd)


func _on_deactivate_fallback(cmd: Dictionary) -> void:
	_fallback.visible = false
	if _fallback.has_method("handle_command"):
		_fallback.call("handle_command", cmd)


func _on_set_window_mode(cmd: Dictionary) -> void:
	if _window_mgr.has_method("set_mode"):
		var mode: String = str(cmd.get("mode", "borderless"))
		var portrait: bool = bool(cmd.get("portrait", true))
		var width: int = int(cmd.get("width", 1080))
		var height: int = int(cmd.get("height", 1920))
		_window_mgr.call("set_mode", mode, portrait, width, height)


func _on_spotlight_card(cmd: Dictionary) -> void:
	var text: String = str(cmd.get("text", ""))
	_spotlight_label.text = text


func _on_supporter_callout(cmd: Dictionary) -> void:
	var viewer: String = str(cmd.get("viewer", ""))
	var amount: int = int(cmd.get("amount", 0))
	_spotlight_label.text = "%s supported with %d!" % [viewer, amount]


func _on_camera_impulse(cmd: Dictionary) -> void:
	var metadata: Dictionary = cmd.get("metadata", {})
	var intensity: float = float(metadata.get("intensity", 0.5))
	var duration: float = float(metadata.get("duration", 0.3))
	_apply_camera_shake(intensity, duration)


## Shared camera shake (clamped) — used by CAMERA_IMPULSE commands and by the
## gift-technique failure feedback.
func _apply_camera_shake(intensity: float, duration: float) -> void:
	# Clamp to reasonable values
	intensity = clampf(intensity, 0.1, 2.0)
	duration = clampf(duration, 0.1, 2.0)
	# Delegate to 3D arena camera shake (world-space units).
	if _arena_node != null and _arena_node.has_method("shake_camera"):
		_arena_node.call("shake_camera", intensity, duration)
	else:
		# Fallback: 2D shake for non-3D arena.
		_shake_intensity = intensity * 15.0
		_shake_duration = duration
		_shake_timer = duration


## Resolves a team token to a sim faction index. blue = faction A (index 0),
## red = faction B (index 1). Accepts the color keywords, the synthetic
## faction_alpha/faction_beta ids and the current pack faction ids, so joins
## and gift techniques always agree on which side a viewer fights for.
## Unknown tokens (mock mode) alternate between sides.
func _resolve_faction_index(token: String) -> int:
	var t: String = token.to_lower()
	var id_a: String = str(_faction_a.get("id", "")).to_lower()
	var id_b: String = str(_faction_b.get("id", "")).to_lower()
	if t in ["blue", "faction_alpha"] or (not id_a.is_empty() and t == id_a):
		return 0
	if t in ["red", "faction_beta"] or (not id_b.is_empty() and t == id_b):
		return 1
	var idx: int = _next_technique_faction
	_next_technique_faction = 1 - _next_technique_faction
	return idx


func _on_gift_apply(cmd: Dictionary) -> void:
	var viewer: String = str(cmd.get("displayName", cmd.get("viewerId", "Viewer")))
	var gift_name: String = str(cmd.get("metadata", {}).get("giftName", "a gift"))
	_spotlight_label.text = "%s sent %s!" % [viewer, gift_name]
	# Spawn a celebratory VFX burst at a random arena position.
	if _vfx_pool != null:
		var params: Dictionary = {
			"x": randf_range(200.0, 880.0),
			"y": randf_range(300.0, 900.0),
			"color": "#ffd700",
			"duration": 1.5,
		}
		_vfx_pool.acquire("particle", params)


func _on_faction_join(cmd: Dictionary) -> void:
	var viewer: String = str(cmd.get("displayName", cmd.get("viewerId", "Viewer")))
	var viewer_id: String = str(cmd.get("viewerId", viewer))
	var metadata: Dictionary = cmd.get("metadata", {}) if typeof(cmd.get("metadata", {})) == TYPE_DICTIONARY else {}
	var token: String = str(metadata.get("faction", str(cmd.get("factionId", "")))).to_lower()
	# Resolve the requested side: blue = faction A (index 0), red = faction B (index 1).
	var faction_index: int = _resolve_faction_index(token)
	# Per-viewer cap: the same user may add at most MAX_JOINS_PER_VIEWER
	# characters per game (every red/blue comment spawns one new character).
	var joins: int = int(_join_counts.get(viewer_id, 0))
	if joins >= MAX_JOINS_PER_VIEWER:
		_spotlight_label.text = "%s already fields %d fighters — cap reached!" % [viewer, MAX_JOINS_PER_VIEWER]
		return
	_spotlight_label.text = "%s joined the %s army!" % [viewer, "BLUE" if faction_index == 0 else "RED"]
	# Spawn the viewer's fighter into the deterministic world (capped per side).
	if _presenter != null and _presenter.sandbox != null and _presenter.sandbox.world != null:
		var added: bool = _presenter.sandbox.world.add_viewer_unit(faction_index, viewer)
		if added:
			_join_counts[viewer_id] = joins + 1
		else:
			_show_full_banner(faction_index)
	# Spawn a faction-colored VFX burst.
	if _vfx_pool != null:
		var color: String = "#4488ff" if faction_index == 0 else "#ff4444"
		var params: Dictionary = {
			"x": randf_range(200.0, 880.0),
			"y": randf_range(300.0, 900.0),
			"color": color,
			"duration": 1.0,
		}
		_vfx_pool.acquire("particle", params)


## Banner when a join request is rejected because the side is at max capacity.
func _show_full_banner(faction: int) -> void:
	if _banner_label == null:
		return
	var side_name: String = "BLUE" if faction == 0 else "RED"
	_banner_label.text = "The %s army is full (30 fighters max)!" % side_name
	_banner_label.add_theme_color_override("font_color", Color(0.9, 0.85, 0.6))
	if _banner_tween != null and _banner_tween.is_valid():
		_banner_tween.kill()
	_banner_label.modulate.a = 0.0
	_banner_label.position.y = 150.0
	_banner_tween = create_tween()
	_banner_tween.tween_property(_banner_label, "position:y", 210.0, 0.25)
	_banner_tween.parallel().tween_property(_banner_label, "modulate:a", 1.0, 0.25)
	_banner_tween.tween_interval(2.0)
	_banner_tween.tween_property(_banner_label, "modulate:a", 0.0, 0.4)


func _on_display_spotlight(cmd: Dictionary) -> void:
	var text: String = str(cmd.get("text", ""))
	if not text.is_empty():
		_spotlight_label.text = text


func _on_end_round_cmd(cmd: Dictionary) -> void:
	# Forward to existing end-battle logic.
	_on_end_battle_pressed()


## CAST_TECHNIQUE: resolves the gift's faction to a sim faction index and
## triggers the technique in the deterministic world. The arena picks up the
## resulting "technique:<faction>:<tier>" sim event for animations + camera.
func _on_cast_technique(cmd: Dictionary) -> void:
	var metadata: Dictionary = cmd.get("metadata", {}) if typeof(cmd.get("metadata", {})) == TYPE_DICTIONARY else {}
	var tier: int = int(metadata.get("techniqueTier", 1))
	var faction_id: String = str(cmd.get("factionId", ""))
	var faction_index: int = _resolve_faction_index(faction_id)
	var viewer: String = str(cmd.get("displayName", cmd.get("viewerId", "Viewer")))
	var gift_name: String = str(metadata.get("giftName", "a gift"))
	print("[Technique] CAST_TECHNIQUE received: tier=%d faction_id='%s' -> sim faction %d (%s by %s)" % [tier, faction_id, faction_index, gift_name, viewer])
	# Real-time caster gate: a technique is performed by the sender's living
	# fighters. If the team has nobody left, the gift cannot launch — play the
	# camera-shake failure feedback instead. The check happens at trigger time
	# against the authoritative sim state, so a character that joins later
	# makes the technique available again immediately.
	if _presenter != null and _presenter.sandbox != null and _presenter.sandbox.world != null:
		var world: SimWorld = _presenter.sandbox.world
		if world.count_alive(faction_index) == 0:
			var side_name: String = "BLUE" if faction_index == 0 else "RED"
			_spotlight_label.text = "%s's %s can't launch — no %s fighters alive!" % [viewer, gift_name, side_name]
			print("[Technique] tier=%d blocked: faction %d has no living casters" % [tier, faction_index])
			_apply_camera_shake(0.6, 0.4)
			return
	_spotlight_label.text = "%s unleashed a tier %d technique (%s)!" % [viewer, tier, gift_name]
	# Announcer callouts for the big techniques (throttled so gift spam
	# never stacks voice lines).
	if tier == 2:
		_play_voice("voice_galaxy.mp3", 6.0)
		_play_sfx("laser_burst.mp3")
	elif tier == 4:
		# Laser (hand heart): short beam takeover, Star-Wars style blaster zap.
		_play_sfx("laser_beam.mp3", 0.5)
	elif tier >= 3:
		_play_voice("voice_lion.mp3", 6.0)
		_play_sfx("explosion.mp3", 1.5)
	if _presenter != null and _presenter.sandbox != null and _presenter.sandbox.world != null:
		_presenter.sandbox.world.trigger_technique(faction_index, tier)
	# Gold burst VFX at the performing faction's side of the arena.
	if _vfx_pool != null:
		var params: Dictionary = {
			"x": 300.0 if faction_index == 0 else 780.0,
			"y": 590.0,
			"color": "#ffd700" if tier >= 3 else "#88ccff",
			"duration": 0.8 + 0.4 * float(tier),
		}
		_vfx_pool.acquire("particle", params)


# ===========================================================================
# Tier 4 — Quality tier handler + FRAME_REPORT sender
# ===========================================================================

func _on_set_quality_tier(cmd: Dictionary) -> void:
	var tier: String = str(cmd.get("tier", "high"))
	if _vfx_pool != null and _vfx_pool.has_method("set_quality_tier"):
		_vfx_pool.set_quality_tier(tier)


## Tick the frame report timer and send reports every ~1 second.
func _tier4_frame_report_tick(delta: float) -> void:
	_frame_times.append(delta * 1000.0)  # convert to ms
	if _frame_times.size() > 60:
		_frame_times.pop_front()
	_frame_report_timer += delta
	if _frame_report_timer >= 1.0:
		_frame_report_timer = 0.0
		_send_frame_report()


## Compute avg/p95 frame times and send FRAME_REPORT to gateway.
## NOTE: FRAME_REPORT is not yet a recognised WS message type on the gateway
## (only handshake_ack, heartbeat_pong, command_ack are). Sending it causes
## the server to reply with UNSUPPORTED_VERSION which breaks the connection.
## Disabled until the gateway adds a frame_report handler.
func _send_frame_report() -> void:
	if _ws_client == null or _frame_times.is_empty():
		return
	var avg: float = 0.0
	for t in _frame_times:
		avg += t
	avg /= _frame_times.size()
	var sorted: Array = _frame_times.duplicate()
	sorted.sort()
	var p95: float = sorted[int(sorted.size() * 0.95)] if sorted.size() > 1 else avg
	# Disabled — gateway does not handle FRAME_REPORT yet.
	# var report: Dictionary = {
	# 	"type": "FRAME_REPORT",
	# 	"avgFrameMs": avg,
	# 	"p95FrameMs": p95,
	# }
	# _ws_client.send_json(report)
