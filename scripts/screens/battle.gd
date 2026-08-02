## Battle screen (Phase 5) — autonomous arena simulation viewer.
## Hosts the Arena, SimulationSandbox (via BattlePresenter), HUD overlays,
## and speed controls. No network listeners.
extends Control

const Ui := preload("res://scripts/ui/ui_config.gd")
const GC := preload("res://scripts/simulation/gameplay_config.gd")
const ARENA_SCENE_PATH: String = "res://scenes/Arena.tscn"
const INITIAL_PRE_TICKS: int = 100
const RESULTS_DELAY: float = 3.0

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


func _ready() -> void:
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
	# Instantiate arena and add to the panel.
	var arena_packed: PackedScene = load(ARENA_SCENE_PATH) as PackedScene
	if arena_packed != null:
		_arena_node = arena_packed.instantiate()
		_arena_panel.add_child(_arena_node)
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
	_speed1_btn.grab_focus()

	# --- Tier 3: Programmatic orchestrator instantiation ---
	_instantiate_orchestrators()
	_wire_signals()
	_connect_to_gateway()
	_load_gateway_configs()


func _process(delta: float) -> void:
	if _presenter == null:
		return
	if _results_timer > 0.0:
		_results_timer -= delta
		if _results_timer <= 0.0:
			AppState.goto(AppState.Screen.RESULTS)
		return
	var snapshot: Dictionary = _presenter.present(delta)
	if not snapshot.is_empty():
		_update_hud(snapshot)

	# Tier 4 — FRAME_REPORT sender
	_tier4_frame_report_tick(delta)


func _update_hud(snapshot: Dictionary) -> void:
	if snapshot.is_empty():
		return
	# Timer.
	var elapsed: float = float(snapshot.get("elapsed", 0.0))
	var stage: String = str(snapshot.get("stage", "opening"))
	var mins: int = int(elapsed) / 60
	var secs: int = int(elapsed) % 60
	_timer_label.text = "Round: %s  %d:%02d" % [stage, mins, secs]
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
	# Faction health.
	var fh: Variant = snapshot.get("fortress_health")
	if typeof(fh) == TYPE_ARRAY and (fh as Array).size() >= 2:
		var fh_arr: Array = fh
		var hp_a: float = float(fh_arr[0])
		var hp_b: float = float(fh_arr[1])
		var bar_w_a: float = _bar_bga.size.x
		var bar_w_b: float = _bar_bgb.size.x
		if bar_w_a > 0.0:
			_bar_fill_a.offset_right = bar_w_a * clampf(hp_a / maxf(_max_fortress_health, 1.0), 0.0, 1.0)
		if bar_w_b > 0.0:
			_bar_fill_b.offset_right = bar_w_b * clampf(hp_b / maxf(_max_fortress_health, 1.0), 0.0, 1.0)
	# Capture pressure.
	var cp: Variant = snapshot.get("capture_pressure")
	if typeof(cp) == TYPE_ARRAY and (cp as Array).size() >= 2:
		var cp_arr: Array = cp
		_pressure_label_a.text = "%.1f" % float(cp_arr[0])
		_pressure_label_b.text = "%.1f" % float(cp_arr[1])
	# Event spotlight.
	var events: Variant = snapshot.get("events")
	if typeof(events) == TYPE_ARRAY and not (events as Array).is_empty():
		var last_ev: String = str((events as Array).back())
		_spotlight_label.text = last_ev


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
	_presenter.toggle_pause()


func _on_speed(speed: float) -> void:
	_presenter.set_speed(speed)


func _on_restart_pressed() -> void:
	_presenter.restart(randi())
	_results_timer = -1.0
	_spotlight_label.text = "Round restarted..."


func _on_end_battle_pressed() -> void:
	if _presenter != null and _presenter.sandbox != null:
		_presenter.sandbox.paused = true
	AppState.goto(AppState.Screen.RESULTS)


func _on_round_completed(snapshot: Dictionary) -> void:
	var winner: int = int(snapshot.get("winner", -1))
	var vtype: String = str(snapshot.get("victory_type", ""))
	var winner_name: String = "Draw"
	if winner == 0:
		winner_name = str(_faction_a.get("displayName", "A"))
	elif winner == 1:
		winner_name = str(_faction_b.get("displayName", "B"))
	_spotlight_label.text = "Victory: %s (%s)" % [winner_name, vtype]
	_results_timer = RESULTS_DELAY


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
	# Camera impulse is a visual effect — no Camera2D in Battle scene currently.
	# Log for observability; implement in Tier 4 if needed.
	push_warning("Camera impulse received: %s" % str(cmd))


func _on_gift_apply(cmd: Dictionary) -> void:
	# Stub — gift economy wiring deferred to Tier 4 gameplay integration.
	push_warning("gift_apply received: %s (stub)" % str(cmd.get("type", "")))


func _on_faction_join(cmd: Dictionary) -> void:
	# Stub — faction join gameplay wiring deferred to Tier 4.
	push_warning("faction_join received: %s (stub)" % str(cmd.get("type", "")))


func _on_display_spotlight(cmd: Dictionary) -> void:
	var text: String = str(cmd.get("text", ""))
	if not text.is_empty():
		_spotlight_label.text = text


func _on_end_round_cmd(cmd: Dictionary) -> void:
	# Forward to existing end-battle logic.
	_on_end_battle_pressed()


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
