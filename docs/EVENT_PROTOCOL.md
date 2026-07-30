# RiftCrowd LIVE — Event Protocol

Two data models cross the internal boundaries of RiftCrowd LIVE: the **normalized live event**
produced by provider adapters, and the **game command** produced by the rules engine and consumed by
the Godot client. Both are versioned and validated with Zod in `shared/schemas/`.

## Schema version

```
schemaVersion = 1
```

- `EVENT_SCHEMA_VERSION = 1` — exported from `shared/schemas/events.ts`.
- `COMMAND_SCHEMA_VERSION = 1` — exported from `shared/schemas/commands.ts`.

Version 1 is the initial protocol. Any breaking change to a field name, a field type, or an enum
member requires incrementing the corresponding constant and documenting the migration here. Additive
optional fields do not require a version bump. The runtime schemas are `.strict()`, so an unknown
field is a validation error, not a silently ignored extra.

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
| `id`            | Gateway-scoped unique event id. Used for dedupe and for `sourceEventIds`          |
| `provider`      | Adapter `id` that produced the event, for example `mock`, `tikfinity`             |
| `type`          | One of the eight members above. No other value is accepted                        |
| `receivedAt`    | ISO 8601 timestamp string, recorded when the gateway received the event           |
| `user`          | Always present. Synthetic system user for `provider_status` events                |
| `comment`       | Present for `chat`. Sanitized before display, never executed                     |
| `likeCount`     | Non-negative integer. Present for `like`, aggregated in milestones                |
| `gift`          | Present for `gift`. `repeatCount` is a positive integer                           |
| `gift.streakId` | Groups repeated streak events so impact is counted once                          |
| `rawHash`       | Hash of the raw payload. Enables dedupe without storing provider data             |

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
| `id`             | Unique command id. The game acknowledges this id                                |
| `createdAt`      | ISO 8601 timestamp string set by the rules engine                                |
| `sourceEventIds` | Always present, possibly empty. Traces which events produced this command        |
| `expiresAt`      | Optional deadline. A stale command is dropped rather than applied late           |
| `metadata`       | Flat record of primitives only. No nested objects, no arrays, no functions       |

Commands are idempotent where possible, and merged commands aggregate their `sourceEventIds` so a
single visual reaction can still credit every contributing viewer.

## Transport messages

The WebSocket envelope that wraps these payloads — **handshake**, **heartbeat**, **ack**, **error**,
and **snapshot** messages, plus protocol version negotiation — is specified in **Phase 2 (Shared
Protocol and Schema Validation)** and integrated end to end in **Phase 10 (Gateway-to-Godot
WebSocket Integration)**. This document covers only the payload models that exist today.

## Fixtures

`shared/fixtures/valid-events.json` holds one valid event per `LiveEventType`.
`shared/fixtures/invalid-events.json` holds labelled rejection cases. See
`shared/fixtures/README.md`.
