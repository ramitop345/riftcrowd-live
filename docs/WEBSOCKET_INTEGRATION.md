# WebSocket Integration — Phase 10

Real-time command bridge between the Node gateway and the Godot game client.

## Overview

Phase 10 adds a WebSocket server (`/ws/game`) that pushes `GameCommand` messages from the
gateway pipeline to the Godot game in real time. The bridge provides:

- **Token-based authentication** (same `LOCAL_SESSION_TOKEN` as HTTP endpoints)
- **Handshake with protocol version negotiation**
- **Heartbeat ping/pong** with configurable timeout
- **Reconnect recovery** via bounded retry buffer and snapshots
- **Idempotent command delivery** (dedup on `clientId:messageId`)
- **Non-intrusive connection status HUD** in the game

## Protocol Messages

All messages carry `protocolVersion` (integer, currently `1`). The `type` field discriminates
the message union:

| Type | Direction | Description |
|------|-----------|-------------|
| `handshake` | Server → Client | Initial greeting after WS connection |
| `handshake_ack` | Client → Server | Acknowledgment with reconnect info |
| `heartbeat_ping` | Server → Client | Periodic liveness check |
| `heartbeat_pong` | Client → Server | Response to ping |
| `command` | Server → Client | Game command with sequence number |
| `command_ack` | Client → Server | Acknowledgment (accepted/rejected/duplicate) |
| `snapshot` | Server → Client | Buffered commands for reconnect recovery |
| `error` | Bidirectional | Typed error notification |
| `reconnect` | Client → Server | Informational reconnect signal |
| `disconnect` | Server → Client | Graceful disconnect notification |

### Handshake Flow

1. Client connects to `ws://127.0.0.1:<port>/ws/game?token=<LOCAL_SESSION_TOKEN>`
2. Server verifies token via `timingSafeEqual`. Rejects with HTTP 401 on mismatch.
3. Server sends `handshake`:
   ```json
   {
     "type": "handshake",
     "protocolVersion": 1,
     "serverId": "gw_m1abc",
     "heartbeatIntervalMs": 5000,
     "retryBufferCapacity": 1000,
     "currentSequenceNumber": 42
   }
   ```
4. Client sends `handshake_ack` with `lastReceivedSequenceNumber` (0 on first connect).
5. If `lastReceivedSequenceNumber < currentSequenceNumber`, server sends a `snapshot`
   containing buffered commands the client missed.

### Command Delivery

Each command from the pipeline event bus is:
1. Assigned a monotonic `sequenceNumber` (starting at 0)
2. Stored in the bounded retry buffer
3. Broadcast to all handshaken clients (with idempotency check)

```json
{
  "type": "command",
  "protocolVersion": 1,
  "messageId": "cmd_abc123",
  "command": { "schemaVersion": 1, "id": "cmd_abc123", "type": "MODE_VOTE", ... },
  "sequenceNumber": 42,
  "requiresAck": true
}
```

### Command Acknowledgment

Client sends `command_ack` for each received command:
- `status: "accepted"` — command applied successfully
- `status: "duplicate"` — sequence number ≤ client's last applied (skipped)
- `status: "rejected"` — command rejected with optional `reason`

Server marks the retry buffer entry as acked on `accepted` or `duplicate`.

### Heartbeat

Server sends `heartbeat_ping` every `heartbeatIntervalMs`. If no `heartbeat_pong`
is received within `heartbeatTimeoutMs`, the connection is closed with an error.

### Reconnect Recovery

1. Client disconnects (network error, crash, etc.)
2. Commands continue to be buffered on the server
3. Client reconnects with `lastReceivedSequenceNumber` from its last applied command
4. Server sends a `snapshot` with all missed commands in sequence order
5. Client applies snapshot commands, skipping any already applied (idempotency)

## Bounded Retry Buffer

- **Capacity**: configurable via `WS_RETRY_BUFFER_CAPACITY` (default 1000)
- **Eviction policy**: when full, evicts oldest ACKED entry first; if none acked,
  evicts oldest entry (ring-buffer semantics)
- **Snapshot**: `getRange(fromSeq, toSeq)` returns commands for reconnect recovery
- Each entry stores: `sequenceNumber`, `command`, `sentAt`, `ackedAt?`

## Idempotent Command Handling

**Server side**: bounded `Set<string>` of `clientId:messageId` pairs with FIFO eviction
(configurable via `WS_IDEMPOTENCY_WINDOW_SIZE`, default 500). Prevents re-broadcasting
already-acked commands.

**Client side**: tracks `_last_applied_sequence`. Commands with `sequenceNumber ≤
_last_applied_sequence` are replied with `command_ack` status=`duplicate` and not applied.

## Configuration

File: `gateway/config/ws.json`

```json
{
  "heartbeatIntervalMs": 5000,
  "heartbeatTimeoutMs": 15000,
  "retryBufferCapacity": 1000,
  "maxReconnectBackoffMs": 30000,
  "idempotencyWindowSize": 500
}
```

Environment variable overrides:

| Variable | Default | Description |
|----------|---------|-------------|
| `WS_HEARTBEAT_INTERVAL_MS` | 5000 | Heartbeat ping interval |
| `WS_HEARTBEAT_TIMEOUT_MS` | 15000 | Pong timeout before disconnect |
| `WS_RETRY_BUFFER_CAPACITY` | 1000 | Max buffered commands |
| `WS_MAX_RECONNECT_BACKOFF_MS` | 30000 | Max reconnect backoff |
| `WS_IDEMPOTENCY_WINDOW_SIZE` | 500 | Dedup window size |

## Godot Client

### WSClient (`scripts/net/ws_client.gd`)

GDScript 2.0 class using `WebSocketPeer` (Godot 4.3 API).

**Public methods:**
- `connect_to_server(url: String, token: String)` — open WS connection
- `disconnect_from_server()` — graceful disconnect
- `is_connected() -> bool` — connection state check
- `get_last_applied_sequence() -> int` — last applied sequence number

**Signals:**
- `handshake_completed(server_info: Dictionary)` — handshake done
- `command_received(command_dict: Dictionary)` — new game command
- `snapshot_received(commands_array: Array)` — reconnect snapshot
- `disconnected()` — connection lost
- `error_received(code: String, message: String)` — error from server

**Reconnect**: exponential backoff (1s, 2s, 4s, 8s, max 30s)

### CommandDispatcher (`scripts/net/command_dispatcher.gd`)

Routes commands from WSClient to game subsystems via signals:

| Command Type | Signal | Target |
|-------------|--------|--------|
| `JOIN_FACTION` | `faction_join(payload)` | ViewerRegistry |
| `SPAWN_CHAMPION` | `spawn_champion(payload)` | ChampionSpawner |
| `ADD_ENERGY` | `add_energy(payload)` | Battle presenter |
| `ADD_SHIELD` | `add_shield(payload)` | Battle presenter |
| `SPAWN_SQUAD` | `spawn_squad(payload)` | Battle presenter |
| `CAST_ABILITY` | `cast_ability(payload)` | Battle presenter |
| `START_WORLD_EVENT` | `start_world_event(payload)` | Battle presenter |
| `DISPLAY_SPOTLIGHT` | `display_spotlight(payload)` | Battle presenter |
| `PAUSE_EVENTS` | `pause_events(payload)` | Arena |
| `END_ROUND` | `end_round(payload)` | Match flow |

> **Note**: `gift_apply` signal is declared in CommandDispatcher but routing is deferred to Phase 11
> (add `GIFT_APPLY` case in `dispatch()` + `GameCommandTypeSchema` when gift economy lands).

### Connection Status HUD (`scripts/ui/connection_status.gd`)

Non-intrusive HUD element (top-right corner, 32×32 icon + label).

**States:**
- `CONNECTING` — yellow
- `CONNECTED` — green
- `DISCONNECTED` — red
- `RECONNECTING` — orange

Added to the Battle scene (`scenes/Battle.tscn`).

## File Manifest

| File | Purpose |
|------|---------|
| `shared/schemas/ws_protocol.ts` | Zod schemas for all WS messages |
| `gateway/src/ws/ws_server.ts` | WebSocket server implementation |
| `gateway/src/ws/retry_buffer.ts` | Bounded retry buffer |
| `gateway/config/ws.json` | Default WS configuration |
| `gateway/src/config.ts` | WS env var validation |
| `gateway/src/app.ts` | WS server integration with Fastify |
| `scripts/net/ws_client.gd` | Godot WS client |
| `scripts/net/command_dispatcher.gd` | Godot command router |
| `scripts/ui/connection_status.gd` | Godot connection HUD |
| `scenes/ui/ConnectionStatus.tscn` | HUD scene |

## Test Coverage

| File | Tests |
|------|-------|
| `gateway/test/ws_protocol.test.ts` | 18 (schema validation) |
| `gateway/test/ws_retry_buffer.test.ts` | 11 (buffer behavior) |
| `gateway/test/ws_server.test.ts` | 26 (server unit tests) |
| `gateway/test/ws_integration.test.ts` | 10 (end-to-end) |
| `gateway/test/ws_acceptance.test.ts` | 11 (acceptance gate) |
| **Total** | **76** |

## Manual Verification

```bash
# Start gateway with WS enabled
cd gateway && npx tsx src/server.ts

# Connect with wscat (install: npm i -g wscat)
wscat -c "ws://127.0.0.1:8787/ws/game?token=change-me"

# Expected: receive handshake message
# Send handshake_ack:
{"type":"handshake_ack","protocolVersion":1,"clientId":"manual","lastReceivedSequenceNumber":0}
```

## Known Limitations

- **Godot NOT installed** — all GDScript is hand-authored and desk-checked only.
- **`/ws/dashboard` deferred** to Phase 13 (Creator Dashboard).
- **Gift commands flow but Phase 11 mechanics not implemented.** GIFT_APPLY commands
  reach the CommandDispatcher but the GiftEconomy subsystem is a stub.
- **Heartbeat uses server-side timers only.** Client-side heartbeat detection is not
  implemented in the GDScript client (the Godot client relies on `WebSocketPeer` state).
- **Single-server only.** No clustering or horizontal scaling — each gateway instance
  maintains its own retry buffer.
