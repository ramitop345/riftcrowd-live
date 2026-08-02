## Full WS client test — uses the real WSClient class.
## Run: godot --headless --script res://tests/test_ws_connect.gd
extends SceneTree

var _ws: WebSocketPeer = null
var _elapsed: float = 0.0
var _handshake_done: bool = false
var _error_msg: String = ""

func _initialize() -> void:
	print("=== Full WSClient Test ===")
	_ws = WebSocketPeer.new()
	var url := "ws://127.0.0.1:8787/ws/game?token=change-me"
	print("Connecting to: ", url)
	var err := _ws.connect_to_url(url)
	if err != OK:
		print("FAILED: connect_to_url error ", err)
		quit(1)
		return
	print("connect_to_url OK, waiting for connection...")
	# Run the test loop
	await _run_test()

func _run_test() -> void:
	var timeout := 12.0
	var dt := 0.05
	while _elapsed < timeout:
		_ws.poll()
		var state := _ws.get_ready_state()
		match state:
			0:  # CONNECTING
				pass
			1:  # OPEN
				while _ws.get_available_packet_count() > 0:
					var pkt := _ws.get_packet()
					if pkt.is_empty():
						continue
					var text := pkt.get_string_from_utf8()
					if text.is_empty():
						continue
					var json := JSON.new()
					if json.parse(text) != OK:
						print("  [%.1fs] BAD JSON" % _elapsed)
						continue
					var data = json.data
					if data is Dictionary:
						var msg_type: String = str(data.get("type", ""))
						print("  [%.1fs] RECV: %s" % [_elapsed, text.substr(0, 200)])
						match msg_type:
							"handshake":
								_handshake_done = true
								# Send handshake_ack
								var ack := {
									"type": "handshake_ack",
									"protocolVersion": 1,
									"clientId": "godot_ws_test",
									"lastReceivedSequenceNumber": 0,
								}
								var send_result := _ws.send_text(JSON.stringify(ack))
								print("  [%.1fs] SENT handshake_ack (result=%d)" % [_elapsed, send_result])
							"heartbeat_ping":
								# Reply with pong
								var pong := {
									"type": "heartbeat_pong",
									"protocolVersion": 1,
									"timestamp": int(data.get("timestamp", 0)),
								}
								var pong_result := _ws.send_text(JSON.stringify(pong))
								print("  [%.1fs] SENT heartbeat_pong (result=%d)" % [_elapsed, pong_result])
							"error":
								_error_msg = str(data)
								print("  [%.1fs] SERVER ERROR: %s" % [_elapsed, text])
			2:  # CLOSING
				print("  [%.1fs] CLOSING" % _elapsed)
			3:  # CLOSED
				var code := _ws.get_close_code()
				var reason := _ws.get_close_reason()
				print("  [%.1fs] CLOSED: code=%d reason=%s" % [_elapsed, code, reason])
				if _handshake_done:
					print("=== FAILED: disconnected after handshake ===")
					quit(1)
				else:
					print("=== FAILED: closed before handshake ===")
					quit(1)
				return
		_elapsed += dt
		await create_timer(dt).timeout

	if _handshake_done:
		print("=== PASSED: stable for %.0fs ===" % _elapsed)
		_ws.close()
		quit(0)
	else:
		print("=== FAILED: timeout, state=%d ===" % _ws.get_ready_state())
		quit(1)
