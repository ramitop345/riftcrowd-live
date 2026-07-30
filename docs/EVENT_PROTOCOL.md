# RiftCrowd LIVE — Event Protocol

Two data models cross the internal boundaries of RiftCrowd LIVE: the **normalized live event**
produced by provider adapters, and the **game command** produced by the rules engine and consumed by
the Godot client. Both are versioned and validated with Zod in `shared/schemas/`.

## Schema and protocol versions

```
schemaVersion = 1
protocolVersion = 1
```

- `EVENT_SCHEMA_VERSION = 1` — exported from `shared/schemas/events.ts`.
- `COMMAND_SCHEMA_VERSION = 1` — exported from `shared/schemas/commands.ts`.
- `PROTOCOL_VERSION = 1` — exported from `shared/schemas/messages.ts`; versions the WebSocket
  envelope (`kind`-discriminated control messages), independent of the payload models.

Since Phase 2, both payload models carry a **required** `schemaVersion` field and every envelope
message carries a **required** `protocolVersion` field, each validated as the literal `1`. A payload
with a missing or different version is rejected, which is how an old client fails fast instead of
misreading a future shape.

Version 1 is the initial protocol. Any breaking change to a field name, a field type, or an enum
member requires incrementing the corresponding constant and documenting the migration here. Additive
optional fields do not require a version bump. The runtime schemas are `.strict()`, so an unknown
field is a validation error, not a silently ignored extra.

All strings from providers are untrusted, so every string field carries an upper length bound and
numeric fields carry sane ranges (see the schemas for exact limits). Overlong input is rejected, not
truncated.

## Normalized event model

Source: Section 10.2 of the implementation guide.

```ts
type LiveEventType =
  | 'chat'
  | 'like'
  | 'follow'
  | 'share'
  | 'gift'
  | 'subscribe'
  | 'join'
  | 'provider_status';

interface NormalizedLiveEvent {
  schemaVersion: 1;
  id: string;
  provider: string;
  type: LiveEventType;
  receivedAt: string;
  user: {
    id: string;
    handle: string;
    displayName: string;
  };
  comment?: string;
  likeCount?: number;
  gift?: {
    id: string;
    name: string;
    repeatCount: number;
    streakId?: string;
    streakEnded?: boolean;
    providerValue?: number;
  };
  rawHash: string;
}
```

Field notes:

| Field           | Notes                                                                            |
| --------------- | -------------------------------------------------------------------------------- |
| `schemaVersion` | Required literal `1`. Any other value (or absence) is a validation error          |
| `id`            | Gateway-scoped unique event id. Used for dedupe and for `sourceEventIds`          |
| `provider`      | Adapter `id` that produced the event, for example `mock`, `tikfinity`             |
| `type`          | One of the eight members above. No other value is accepted                        |
| `receivedAt`    | ISO 8601 timestamp string, recorded when the gateway received the event           |
| `user`          | Always present. Synthetic system user for `provider_status` events                |
| `comment`       | Present for `chat`. Sanitized before display, never executed                     |
| `likeCount`     | Non-negative integer. Present for `like`, aggregated in milestones                |
| `gift`          | Present for `gift`. `repeatCount` is a positive integer                           |
| `gift.streakId` | Groups repeated streak events so impact is counted once                          |
| `rawHash`       | `sha256:` + 64 hex chars over the stable-stringified raw payload                  |

`rawHash` exists so the gateway can detect duplicates and correlate logs **without** persisting raw
provider payloads. Never store or log the raw payload itself.

## Game command model

Source: Section 10.3 of the implementation guide.

```ts
type GameCommandType =
  | 'JOIN_FACTION'
  | 'SPAWN_CHAMPION'
  | 'ADD_ENERGY'
  | 'ADD_SHIELD'
  | 'SPAWN_SQUAD'
  | 'CAST_ABILITY'
  | 'START_WORLD_EVENT'
  | 'DISPLAY_SPOTLIGHT'
  | 'PAUSE_EVENTS'
  | 'END_ROUND';

interface GameCommand {
  schemaVersion: 1;
  id: string;
  type: GameCommandType;
  createdAt: string;
  factionId?: string;
  viewerId?: string;
  displayName?: string;
  amount?: number;
  abilityId?: string;
  sourceEventIds: string[];
  expiresAt?: string;
  metadata?: Record<string, string | number | boolean>;
}
```

Field notes:

| Field            | Notes                                                                           |
| ---------------- | ------------------------------------------------------------------------------- |
| `schemaVersion`  | Required literal `1`. Any other value (or absence) is a validation error         |
| `id`             | Unique command id. The game acknowledges this id                                |
| `createdAt`      | ISO 8601 timestamp string set by the rules engine                                |
| `sourceEventIds` | Always present, possibly empty. Traces which events produced this command        |
| `expiresAt`      | Optional deadline. A stale command is dropped rather than applied late           |
| `metadata`       | Flat record of primitives only. No nested objects, no arrays, no functions       |

Commands are idempotent where possible, and merged commands aggregate their `sourceEventIds` so a
single visual reaction can still credit every contributing viewer.

## Control messages

Source: `shared/schemas/messages.ts`. One local WebSocket (127.0.0.1:8788) carries a versioned,
envelope-based protocol between the gateway and the Godot client. Every frame is one
`ProtocolMessage`: a `.strict()` object discriminated by `kind`, always carrying
`protocolVersion: 1`. Unknown kinds, unknown fields, and other versions are rejected with a typed
error.

```ts
type ProtocolMessage =
  | { protocolVersion: 1; kind: 'event'; event: NormalizedLiveEvent }
  | { protocolVersion: 1; kind: 'command'; command: GameCommand }
  | { protocolVersion: 1; kind: 'ack'; commandId: string; receivedAt: string }
  | { protocolVersion: 1; kind: 'error'; code: ProtocolErrorCode; message: string; relatedId?: string }
  | { protocolVersion: 1; kind: 'snapshot'; sentAt: string; state: Record<string, unknown> }
  | { protocolVersion: 1; kind: 'heartbeat'; sentAt: string; sequence: number };

type ProtocolErrorCode =
  | 'INVALID_MESSAGE'
  | 'UNSUPPORTED_VERSION'
  | 'UNAUTHORIZED'
  | 'QUEUE_FULL'
  | 'INTERNAL';
```

| Kind        | Direction         | Purpose                                                                                                                                                    |
| ----------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event`     | gateway → observer | Wraps one `NormalizedLiveEvent`, for consumers that watch the event stream (dashboard, replay tools)                                                       |
| `command`   | gateway → game     | Wraps one `GameCommand`. The game must ack `command.id`                                                                                                    |
| `ack`       | game → gateway     | Acknowledges `commandId` so the gateway drops it from the retry buffer. `receivedAt` is an ISO 8601 timestamp                                              |
| `error`     | either direction   | Typed, non-fatal rejection of a frame. `message` is human-readable (max 500 chars, never secrets); `relatedId` optionally names the offending message/command id |
| `snapshot`  | gateway → game     | Full game-state resync after a reconnect. `state` is a loose string-keyed record in Phase 2; its concrete structure is firmed up in Phase 10               |
| `heartbeat` | either direction   | Liveness signal with a monotonically increasing non-negative `sequence`. Heartbeat interval, timeout, and reconnect-with-backoff semantics are implemented in Phase 10 |

The handshake (session token presentation and version negotiation) rides on the connection setup and
is wired end to end in **Phase 10 (Gateway-to-Godot WebSocket Integration)**; a peer speaking an
unsupported version receives `error` with code `UNSUPPORTED_VERSION`.

## Deterministic identity

Source: `shared/schemas/identity.ts`. These helpers are Node-only (the module imports
`node:crypto`) and are exposed ONLY via the `@riftcrowd/shared/identity` subpath — they are
deliberately excluded from the package root export so the root entry stays browser-safe. Ids and
hashes are derived from content, never from randomness, so replaying the same input reproduces the
same ids and dedupe survives restarts.

- `stableStringify(value)` — deterministic JSON serialization. Object keys are sorted recursively
  (UTF-16 code-unit order); array order is preserved because it is meaningful. Input JSON cannot
  represent at the top level (`undefined`, functions, symbols) serializes as `"null"`.
- `computeRawHash(rawPayload)` — `sha256:` + 64 lowercase hex chars of
  `sha256(stableStringify(rawPayload))`. This is the only artifact of a raw provider payload that
  may be stored or logged.
- `deterministicEventId(provider, type, rawHash)` — `evt_` + first 24 hex chars of
  `sha256(stableStringify(['event', provider, type, rawHash]))`. The inputs are hashed as a
  JSON-serialized tuple, not as delimiter-joined strings, so the derivation is collision-proof for
  arbitrary inputs (`('a|b', 'c')` and `('a', 'b|c')` produce different ids).
- `deterministicCommandId(type, sourceEventIds)` — `cmd_` + first 24 hex chars of
  `sha256(stableStringify(['command', type, sourceEventIds]))`, the same tuple derivation. Source
  order matters: merged commands must sort or freeze their id list before deriving the id.

## Fixtures

- `shared/fixtures/valid-events.json` — one valid event per `LiveEventType`.
- `shared/fixtures/invalid-events.json` — labelled rejection cases, including missing and
  unsupported `schemaVersion`.
- `shared/fixtures/valid-messages.json` — one valid sample per control-message `kind`.
- `shared/fixtures/invalid-messages.json` — labelled envelope rejection cases.

See `shared/fixtures/README.md` for the wrapper format shared by both invalid files.

### GDScript mirror

The Godot client mirrors these schemas in `game/scripts/protocol/protocol_validator.gd` and
validates the same fixture files via `game/tests/test_protocol.gd` (run from `game/`:
`godot --headless --script res://tests/test_protocol.gd`; see `game/tests/README.md`).

## Changelog

- **Protocol v1, schema v1 (Phase 2).** Added required `schemaVersion: 1` to `NormalizedLiveEvent`
  and `GameCommand`; added string length and numeric range bounds; defined the six control messages
  (`event`, `command`, `ack`, `error`, `snapshot`, `heartbeat`) under `PROTOCOL_VERSION = 1`; added
  deterministic id and raw-hash rules.
- **Schema v1 (Phase 1).** Initial `NormalizedLiveEvent` and `GameCommand` models.
