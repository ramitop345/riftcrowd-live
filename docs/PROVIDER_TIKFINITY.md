# TikFinity Provider Adapter

Phase 14 — real provider integration for RiftCrowd LIVE.

## Overview

`TikFinityAdapter` connects the gateway to [TikFinity](https://tikfinity.com/), a local
application that bridges TikTok LIVE events to a WebSocket API. The adapter receives raw
JSON events, validates them with Zod, and maps them into the shared `NormalizedLiveEvent`
schema — the same contract used by `MockLiveAdapter`.

The gateway selects the provider via the `LIVE_PROVIDER` environment variable:

| `LIVE_PROVIDER` | Adapter wired      | Internet required |
|------------------|--------------------|-------------------|
| `mock` (default) | `MockLiveAdapter`  | No                |
| `tikfinity`      | `TikFinityAdapter` | Yes (TikTok LIVE) |

## Configuration

### Environment Variables

| Variable               | Type    | Default                     | Description                          |
|------------------------|---------|-----------------------------|--------------------------------------|
| `LIVE_PROVIDER`        | string  | `mock`                      | `mock` or `tikfinity`                |
| `TIKFINITY_URL`        | string  | `ws://127.0.0.1:23184/ws`  | TikFinity local WebSocket URL        |
| `TIKFINITY_TOKEN`      | string  | *(none)*                    | Optional auth token                  |
| `TIKFINITY_RECONNECT_MS` | number | `5000`                    | Base reconnect interval (ms)         |
| `TIKFINITY_HEARTBEAT_MS` | number | `30000`                   | Heartbeat ping interval (ms)         |

### Config Block

The validated config is exposed as `config.tikfinity`:

```ts
{
  url: string;
  token?: string;
  reconnectMs: number;
  heartbeatMs: number;
  enabled: boolean;   // true when LIVE_PROVIDER === 'tikfinity'
}
```

## Supported Event Types

| TikFinity type  | NormalizedLiveEvent type | Notes                                |
|-----------------|--------------------------|--------------------------------------|
| `chat`          | `chat`                   | Comment capped at 500 chars          |
| `like`          | `like`                   | `likeCount` mapped directly          |
| `follow`        | `follow`                 | —                                    |
| `share`         | `share`                  | `shareType` ignored (not in schema)  |
| `subscription`  | `subscribe`              | `months` not carried (schema limit)  |
| `gift`          | `gift`                   | Full gift payload (id, name, repeat)  |

## Event Mapping

### TikFinity Raw Payload (assumed shape)

```json
{
  "type": "chat",
  "user": { "id": "...", "nickname": "...", "profilePictureUrl": "..." },
  "comment": "Hello!",
  "timestamp": 1722500000000
}
```

### NormalizedLiveEvent Output

```json
{
  "schemaVersion": 1,
  "id": "evt_tf_1_m5x7k2",
  "provider": "tikfinity",
  "type": "chat",
  "receivedAt": "2024-08-01T10:00:00.000Z",
  "user": { "id": "user_001", "handle": "viewer_alpha", "displayName": "viewer_alpha" },
  "comment": "Hello!",
  "rawHash": "sha256:tikfinity_1"
}
```

### Field Mapping Table

| TikFinity field         | NormalizedLiveEvent field | Transform                        |
|-------------------------|---------------------------|----------------------------------|
| `user.id`               | `user.id`                 | Direct copy                      |
| `user.nickname`         | `user.handle`             | Direct copy                      |
| `user.nickname`         | `user.displayName`        | Direct copy                      |
| `comment`               | `comment`                 | Capped at 500 chars              |
| `likeCount`             | `likeCount`               | Direct copy                      |
| `giftId`                | `gift.id`                 | Direct copy                      |
| `giftName`              | `gift.name`               | Direct copy                      |
| `repeatCount`           | `gift.repeatCount`        | Default 1                        |
| `coinCount`             | `gift.providerValue`      | Direct copy                      |
| `timestamp`             | `receivedAt`              | Converted to ISO 8601            |
| *(auto-generated)*      | `id`                      | `evt_tf_{counter}_{timestamp36}` |
| *(auto-generated)*      | `rawHash`                 | `sha256:tikfinity_{counter}`     |

## Fault Handling

### Disconnect and Reconnect

- Exponential backoff: 1s → 2s → 4s → ... → 30s (cap).
- Maximum 10 retry attempts before giving up.
- Each attempt logged at info level.
- Connection loss sets `isConnected()` to `false`.

### Heartbeat

- Sends WebSocket `ping` every `heartbeatMs` (default 30s).
- Expects `pong` within 5 seconds.
- If no pong, forces connection termination and triggers reconnect.
- **Assumption:** TikFinity's WebSocket server responds to standard WS ping frames.

### Malformed Payloads

- Zod validation on every incoming message.
- Failed validation → event dropped, warning logged.
- The adapter never crashes on malformed input.

### Unknown Event Types

- Events with unrecognized `type` values are dropped with a warning.
- Unknown fields within known event types are stripped (Zod `.strip()`).

### Unknown Fields (Changed Payloads)

- TikFinity may add new fields in future versions.
- All Zod schemas use `.strip()` to silently ignore unknown fields.
- This ensures forward compatibility without adapter updates.

## Redacted Fixtures

Location: `gateway/test/fixtures/tikfinity/`

| File               | Event type    | Description                    |
|--------------------|---------------|--------------------------------|
| `chat.json`        | `chat`        | Chat message with strategy cmd |
| `like.json`        | `like`        | Like event with count          |
| `follow.json`      | `follow`      | Follow event                   |
| `share.json`       | `share`       | Share event with type          |
| `subscription.json`| `subscription`| Subscription with months       |
| `gift.json`        | `gift`        | Gift with coins and repeat     |

All fixtures use synthetic placeholders:
- User IDs: `user_001`, `user_002`, etc.
- Nicknames: `viewer_alpha`, `viewer_beta`, etc.
- Profile URLs: `https://example.com/avatar/...`
- No real tokens, secrets, or personal data.

### Adding More Fixtures

1. Capture a real TikFinity event payload.
2. Replace all user IDs, nicknames, tokens, and URLs with synthetic placeholders.
3. Save as `gateway/test/fixtures/tikfinity/<event_type>.json`.
4. Add a test in `tikfinity_replay.test.ts` that loads and validates the fixture.

## Architecture

```
TikFinity App (local)
    │ WebSocket (ws://127.0.0.1:23184/ws)
    ▼
TikFinityAdapter
    │ Zod validation → mapTikfinityEvent()
    ▼
NormalizedLiveEvent
    │ onEvent callback
    ▼
Pipeline.process()
    │ normalize → dedupe → rate limit → rules → enqueue
    ▼
GameCommand[]
    │ EventBus
    ▼
WsServer → Godot Client
```

## Manual Verification

Start the gateway with TikFinity provider:

```powershell
$env:LIVE_PROVIDER = "tikfinity"
$env:TIKFINITY_URL = "ws://127.0.0.1:23184/ws"
npm run dev:gateway
```

Observe logs for:
- `[TikFinity] Connected to provider WebSocket`
- `[TikFinity] Reconnect attempt N/10 in Xms` (on disconnect)
- `[TikFinity] Dropped event: ...` (on malformed/unknown)

## Known Limitations

1. **Subscription mapping.** `subscription` events map to `subscribe` type in
   `NormalizedLiveEvent`. The `months` field is not carried because the shared schema
   does not have a `months` field. If subscription duration matters for gameplay,
   the schema must be extended.

2. **Heartbeat assumption.** The heartbeat mechanism assumes TikFinity's WebSocket
   server responds to standard WebSocket `ping` frames with `pong` frames. If
   TikFinity uses application-level heartbeat messages instead, the adapter will
   force-reconnect unnecessarily. Verify against the actual TikFinity API.

3. **URL stability.** The default URL `ws://127.0.0.1:23184/ws` is based on
   TikFinity's default configuration. Different TikFinity versions or user
   configurations may use different ports or paths. Always configure via
   `TIKFINITY_URL` env var.

4. **Raw payload shape is assumed.** Without authoritative TikFinity API
   documentation, the raw event schemas in `tikfinity_adapter.ts` are based on
   common patterns for TikTok LIVE integration tools. The Zod `.strip()` mode
   ensures forward compatibility, but field names may need adjustment when
   connecting to a real TikFinity instance.

5. **No authentication flow.** The adapter passes an optional `token` query
   parameter but does not implement any OAuth or handshake flow that TikFinity
   may require.

6. **Single connection only.** The adapter maintains a single WebSocket
   connection. No connection pooling or multi-instance support.

7. **Godot not installed.** All gateway-side code is tested via Vitest. Godot
   client integration is not tested in this phase.
