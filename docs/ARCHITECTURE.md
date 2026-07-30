# RiftCrowd LIVE — Architecture

Source of truth: Section 9 of `RiftCrowd_LIVE_Complete_Qoder_Implementation_Guide.md`. This document
condenses that section into the working contract that every phase must respect.

## 1. Component flow

```text
TikTok LIVE
    |
    | gifts, likes, comments, follows, shares
    v
Provider Adapter
(Mock / TikFinity / future official provider)
    |
    v
Event Normalizer and Validator   (Zod, schemaVersion 1)
    |
    v
Rules, Dedupe, Streak Aggregation, Rate Limits
    |
    v
Bounded Game Command Queue
    |
    +---------------------> Creator Dashboard (reads gateway state and health)
    |
    v
Local WebSocket Server (127.0.0.1:8788)
    |
    v
Godot Game Client
    |
    v
OBS or TikTok LIVE Studio Capture
    |
    v
TikTok Viewers
```

Data crosses exactly three boundaries:

1. **Raw provider payload -> `NormalizedLiveEvent`.** Happens inside the adapter layer. Provider
   vocabulary dies here.
2. **`NormalizedLiveEvent` -> `GameCommand`.** Happens in the rules engine. Gameplay meaning is
   assigned here, driven by configuration and content packs.
3. **`GameCommand` -> simulation state.** Happens inside Godot. The game reads a small, versioned,
   validated command vocabulary and nothing else.

The dashboard is a read-mostly consumer: it polls or subscribes to gateway state (provider status,
queue depth, recent events, health) and issues control actions (start, stop, pause events, clear
queue, end round). It never talks to a provider directly and never talks to the game directly.

## 2. Component responsibilities

### Godot game (`game/`)

Rendering, autonomous simulation, match state, units and abilities, visual and audio feedback,
result display, and safe reconnection to the gateway. **The game must not contain TikTok-specific
parsing logic.**

### Node event gateway (`gateway/`)

Provider connections, event normalization, validation and sanitization, team assignment, gift
mapping, rate limiting, command generation, session logs, dashboard API, and test-event generation.

### Creator dashboard (`dashboard/`)

Start and stop, provider selection, username and connection settings, gift mapping, mode and faction
settings, test buttons, health indicators, emergency actions.

### Content packs (`content/`)

Mode names, factions, colors and patterns, unit scene references, ability labels, arena settings,
audio references, join keywords.

### Shared schemas (`shared/`)

Versioned Zod schemas and fixtures for normalized events and game commands, consumed by the gateway,
the dashboard, and the test suites.

## 3. `LiveProviderAdapter` contract

Every LIVE provider implements the same contract:

```ts
interface LiveProviderAdapter {
  readonly id: string;
  connect(config: ProviderConfig): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): ProviderStatus;
  onEvent(handler: (event: NormalizedLiveEvent) => void): Unsubscribe;
  onStatus(handler: (status: ProviderStatus) => void): Unsubscribe;
}
```

| Member         | Contract                                                                             |
| -------------- | ------------------------------------------------------------------------------------ |
| `id`           | Stable, lowercase adapter identifier, for example `mock`, `tikfinity`                |
| `connect`      | Idempotent. Resolves once the provider is reachable, rejects with a typed error       |
| `disconnect`   | Idempotent. Always safe to call, releases sockets and timers, never throws on retry   |
| `getStatus`    | Synchronous snapshot. Cheap, no I/O, safe to call from a health endpoint              |
| `onEvent`      | Emits only validated `NormalizedLiveEvent` values. Returns an unsubscribe function    |
| `onStatus`     | Emits provider lifecycle transitions. Returns an unsubscribe function                 |

Planned providers:

- `MockLiveAdapter` — always available; replays fixture files and generates events. Fully offline.
- `TikFinityAdapter` — connects to the local TikFinity endpoint configured by the creator.
- `UnofficialTikTokAdapter` — optional experimental module, disabled by default and clearly labeled
  unsupported.
- `OfficialTikTokAdapter` — reserved for a future approved API.

Adapters emit normalized events. An adapter that cannot normalize a payload drops it and increments a
counter; it never forwards a raw payload downstream.

## 4. Non-negotiables

1. **The game never parses provider raw payloads.** No TikTok field names, no provider quirks, no
   gift-name assumptions inside `game/`. The game consumes `GameCommand` only.
2. **All listeners bind to `127.0.0.1`.** Gateway HTTP/API (8787), game WebSocket (8788), and the
   dashboard dev server (5173) are loopback-only by default. Changing a bind address requires an
   explicit task.
3. **Zod validation on all external data.** Provider payloads, WebSocket frames, dashboard requests,
   content packs, gift mappings, and `.env`-derived configuration are all validated before use.
   Invalid input is rejected and logged without secrets.
4. **Mock mode is fully offline.** `LIVE_PROVIDER=mock` must run complete, stable rounds with no
   network access and no TikTok account. Tests never require internet.
5. **Bounded queues, dedupe, and rate limits.** The command queue has a hard capacity, events are
   deduplicated by provider event id, gift streaks are aggregated, and per-viewer plus global rate
   limits apply. These land in **Phase 8 (Node Gateway Core)** and Phase 11; until then no unbounded
   buffer may be introduced.
6. **No secrets in logs.** No cookies, tokens, API keys, or raw provider credentials, ever.
7. **Sanitize before display.** Viewer handles and comments are sanitized, length-limited, and
   markup-escaped before they reach the screen. Comment text is never executed as code, a command, a
   path, or a URL.

## 5. Reliability rules

- Gateway and game reconnect automatically with exponential backoff.
- Commands carry unique ids.
- The game acknowledges commands.
- The gateway keeps a short in-memory retry buffer.
- Commands are idempotent where possible.
- The simulation remains playable while disconnected.
- Provider loss shows a small status icon, never a crash.

## 6. WebSocket protocol overview

One local WebSocket server on `127.0.0.1:8788` carries a versioned, envelope-based protocol between
the gateway and the Godot client.

- **Handshake.** The client presents the locally generated session token from `.env` and the protocol
  version. The gateway accepts, or closes with a typed reason.
- **Heartbeat.** Periodic ping/pong with a timeout that triggers reconnect-with-backoff on either
  side.
- **Command frames.** Envelope carrying one `GameCommand`, each with a unique `id`.
- **Ack frames.** The game acknowledges a command id so the gateway can drop it from the retry
  buffer.
- **Error frames.** Typed, non-fatal rejection of a frame, including validation failures.
- **Snapshot frames.** Full state resynchronisation after a reconnect, so a client that missed
  commands can recover without a restart.

The exact envelope shape, field names, and version-negotiation rules are defined in **Phase 2
(Shared Protocol and Schema Validation)** and wired end to end in **Phase 10 (Gateway-to-Godot
WebSocket Integration)**. See `EVENT_PROTOCOL.md` for the payload models that already exist.

## 7. Configuration, not hardcoding

Editable configuration files instead of constants in code:

- `gateway/config/gameplay.json`
- `gateway/config/rate-limits.json`
- `content/gift-mappings/default.json`
- `game/content/packs/*.json`
- `.env` for local ports and provider settings (never committed; see `.env.example`)
