## AudioManager (Phase 15) — Godot-side audio playback with volume groups.
##
## Volume groups: master, music, sfx, ui.
## Effective volume = master × group / 10000 (both 0-100 scale, output 0-1).
## Connects to CommandDispatcher signal (play_audio).
class_name AudioManager
extends Node

## Volume groups (0-100).
@export var master_volume: int = 80
@export var music_volume: int = 60
@export var sfx_volume: int = 90
@export var ui_volume: int = 70

## Internal audio stream players for each group.
var _music_player: AudioStreamPlayer
var _sfx_player: AudioStreamPlayer
var _ui_player: AudioStreamPlayer

## Track cache to avoid re-loading.
var _track_cache: Dictionary = {}


func _ready() -> void:
	_music_player = AudioStreamPlayer.new()
	_music_player.bus = "Master"
	add_child(_music_player)

	_sfx_player = AudioStreamPlayer.new()
	_sfx_player.bus = "Master"
	add_child(_sfx_player)

	_ui_player = AudioStreamPlayer.new()
	_ui_player.bus = "Master"
	add_child(_ui_player)


## Play a track in the given volume group.
## track: resource path (e.g., "res://audio/sfx/hit.ogg") or logical name
## volume_group: "master", "music", "sfx", "ui"
## volume_override: optional 0-1 override (default: computed from groups)
func play(track: String, volume_group: String = "sfx", volume_override: float = -1.0) -> void:
	var player: AudioStreamPlayer = _get_player(volume_group)
	var vol: float = volume_override if volume_override >= 0.0 else compute_volume(volume_group)

	# Load or retrieve stream
	var stream: AudioStream = _track_cache.get(track, null)
	if not stream:
		if ResourceLoader.exists(track):
			stream = ResourceLoader.load(track) as AudioStream
			_track_cache[track] = stream
		else:
			# Fallback: generate a procedural synth tone so audio works without .ogg files.
			stream = _generate_synth(track)
			_track_cache[track] = stream

	player.stream = stream
	player.volume_db = linear_to_db(vol)
	player.play()


## Compute effective volume: master × group / 10000.
func compute_volume(volume_group: String) -> float:
	var group_vol: int = sfx_volume
	match volume_group:
		"music":
			group_vol = music_volume
		"sfx":
			group_vol = sfx_volume
		"ui":
			group_vol = ui_volume
		"master":
			group_vol = 100
	return float(master_volume * group_vol) / 10000.0


## Get the AudioStreamPlayer for a volume group.
func _get_player(volume_group: String) -> AudioStreamPlayer:
	match volume_group:
		"music":
			return _music_player
		"ui":
			return _ui_player
		_:
			return _sfx_player


## Generate a procedural synth tone as fallback when audio files are missing.
## Different track names produce different tones so they're distinguishable.
func _generate_synth(track: String) -> AudioStream:
	var mix_rate: int = 22050

	# Derive pitch and duration from track name so each SFX sounds different.
	var hash_val: int = track.hash()
	var freq: float = 220.0 + float(absi(hash_val) % 400)  # 220-620 Hz
	var duration: float = 0.15 + float(absi(hash_val >> 8) % 20) / 100.0  # 0.15-0.35s

	var num_samples: int = int(mix_rate * duration)
	var raw_bytes: PackedByteArray = PackedByteArray()
	raw_bytes.resize(num_samples * 2)

	for i in range(num_samples):
		var t: float = float(i) / float(mix_rate)
		var envelope: float = 1.0 - (t / duration)
		envelope *= envelope  # quadratic fade-out
		var sample: float = sin(t * freq * TAU) * 0.3 * envelope
		var s: int = clampi(int(sample * 32767.0), -32768, 32767)
		raw_bytes[i * 2] = s & 0xFF
		raw_bytes[i * 2 + 1] = (s >> 8) & 0xFF

	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = mix_rate
	wav.stereo = false
	wav.data = raw_bytes
	return wav


## Stop all currently playing audio.
func stop_all() -> void:
	_music_player.stop()
	_sfx_player.stop()
	_ui_player.stop()


## Load config from gateway HTTP endpoint.
func load_config_from_gateway(url: String = "http://127.0.0.1:8787/audio/config") -> void:
	var http := HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(func(result: int, code: int, headers: PackedStringArray, body: PackedByteArray) -> void:
		if result == HTTPRequest.RESULT_SUCCESS and code == 200:
			var json := JSON.new()
			var err := json.parse(body.get_string_from_utf8())
			if err == OK:
				var data: Dictionary = json.data
				if data.has("volumeGroups"):
					var vg: Dictionary = data["volumeGroups"]
					master_volume = int(vg.get("master", 80))
					music_volume = int(vg.get("music", 60))
					sfx_volume = int(vg.get("sfx", 90))
					ui_volume = int(vg.get("ui", 70))
		http.queue_free()
	)
	http.request(url)


## Handle play_audio command from CommandDispatcher.
func _on_play_audio(command: Dictionary) -> void:
	var metadata: Dictionary = command.get("metadata", {})
	var track: String = str(metadata.get("track", ""))
	var group: String = str(metadata.get("volumeGroup", "sfx"))
	var vol: float = float(metadata.get("volume", -1.0))
	if track:
		play(track, group, vol)
