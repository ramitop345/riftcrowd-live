# Node Gateway Core — Phase 8

## Architecture Overview

The Phase 8 gateway core implements a local reliability layer that sits between
provider adapters (Phase 9) and the rules engine / MatchDirector (Phases 6–7).

```
Provider Adapter (Phase 9)
        │
        ▼
   ┌─────────┐
   │ Raw Event│
   └────┬────┘
        │
        ▼
   ┌──────────┐     ┌───────────────┐
   │Normalize │────▶│ Schema Reject │──── error topic (never reaches rules)
   └────┬─────┘     └───────────────┘
        │ ok
        ▼
   ┌──────────┐
   │  Dedupe   │──── duplicate → drop
   └────┬─────┘
        │ new
        ▼
   ┌───────────┐
   │Rate Limit │──── over-rate → drop
   └────┬──────┘
        │ allowed
        ▼
   ┌──────────────┐
   │ Command Rules │──── GameCommand[]
   └────┬─────────┘
        │
        ▼
   ┌───────────────┐
   │ Command Queue  │──── overflow → warn
   └────┬──────────┘
        │
        ▼
   MatchDirector / Godot Bridge (Phase 10)
```

## Pipeline Stages

### 1. Event Bus (`gateway/src/pipeline/event_bus.ts`)

Typed pub/sub with bounded queues per topic.

**Topics:** `raw_event`, `normalized_event`, `command`, `error`

**API:**
- `publish(topic, payload)` — enqueue + notify handlers
- `subscribe(topic, handler)` — returns unsubscribe function
- `drain(topic)` — dequeue all items
- `setCapacity(topic, n)` — update capacity

**Overflow:** drops oldest entry + emits warning log.

**`raw_event` subscriber-gated queuing:** To avoid accumulating unused payloads in
Phase 8 (when no Phase 9 subscriber exists yet), `raw_event` is only queued when
at least one subscriber is registered for that topic. Other topics
(`normalized_event`, `command`, `error`) are always queued. Handlers are always
notified regardless of subscriber count.

### 2. Normalizer (`gateway/src/pipeline/normalizer.ts`)

Pure function `normalizeProviderEvent(raw) → { ok, value | errors }`.

- Validates against `NormalizedLiveEventSchema` (strict Zod)
- Sanitizes displayName (control chars, 64-char cap) and comment (200-char cap)
- Malformed events never reach the rules engine (**acceptance gate**)

### 3. Dedupe Store (`gateway/src/pipeline/dedupe_store.ts`)

Sliding-window dedup keyed on `(providerEventId, eventType)`.

- `seen(id, type) → boolean` — true if duplicate
- LRU eviction at configurable capacity (default 10,000)

**O(1) LRU algorithm:** Uses JavaScript `Map` insertion-order semantics.
On a cache hit, the entry is deleted and re-inserted (moves to the end = most
recent). On a miss at capacity, the first key (oldest = least recently used) is
deleted in O(1) before inserting the new entry. This replaces the previous O(n)
linear scan that scanned the entire Map to find the smallest access counter.

### 4. Rate Limiter (`gateway/src/pipeline/rate_limiter.ts`)

Per-viewerId token bucket + global throughput limit.

- `allow(viewerId, now?) → boolean`
- Configurable: rate (events/sec), burst, global rate

**Per-viewer bucket LRU eviction:** The per-viewer bucket map is capped at
`maxViewerBuckets` (default 50,000). When the cap is reached, the
least-recently-used viewer bucket (oldest Map entry by insertion-order) is
evicted in O(1) before inserting the new one. This prevents unbounded memory
growth in long-running production gateways that serve thousands of unique
viewers. Re-accessing a viewer moves its bucket to the end of the Map,
protecting active viewers from eviction.

### 5. Command Rules (`gateway/src/pipeline/command_rules.ts`)

Rule interface: `{ name, applies(event), execute(event, context) → GameCommand[] | null }`

**Built-in rules:**

| Rule | Trigger | Output |
|------|---------|--------|
| ModeVoteRule | chat + mode keyword | null (director handles) |
| JoinFactionRule | chat + faction keyword | JOIN_FACTION |
| EndRoundRule | chat "!end_round" | END_ROUND |
| PauseRule | chat "!pause" | PAUSE_EVENTS |
| KickRule | chat "!kick <id>" | null (director handles) |

**`clubs` keyword alias:** The keyword `clubs` is accepted as an alias for
mode 3 (`fan_crews_original`). This exists for backward compatibility with the
viewer join path: viewers joining via the TikTok LIVE "clubs" tab send that
keyword, which must map to the same content pack as `fan_crews_original`.

**API:**
- `registerRule(rule)` — add custom rule
- `clearRules()` — remove all
- `getRules()` — list current rules

### 6. Command Queue (`gateway/src/pipeline/command_queue.ts`)

Bounded FIFO queue of `GameCommand`.

- `enqueue(cmd) → boolean` — false if full
- `dequeue() → GameCommand | null`
- `drain() → GameCommand[]`

### 7. Pipeline Orchestrator (`gateway/src/pipeline/pipeline.ts`)

Wires all stages. `process(rawEvent) → ProcessResult`.

**Stats:** `getStats() → { processed, normalized, deduped, rateLimited, rulesTriggered, queued, dropped, queueOverflow }`

## HTTP Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Liveness probe (status, uptime, version) |
| GET | `/status` | Yes | Pipeline stats + director state |
| GET | `/config` | Yes | Sanitized config (token redacted) |
| POST | `/config` | Yes | Runtime config update (rate limits, log level) |
| POST | `/control/shutdown` | Yes | Graceful shutdown trigger |
| POST | `/events` | Yes | Accept batch of raw provider events |
| GET | `/events` | Yes | Drain event bus (debug) |
| GET | `/commands` | Yes | Drain command queue |

**Auth:** `Authorization: Bearer <LOCAL_SESSION_TOKEN>`. Returns 503 if token
not configured, 401 if missing/invalid.

## Configuration

Environment variables (all have safe defaults):

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `127.0.0.1` | Bind address |
| `GATEWAY_PORT` | `8787` | HTTP port |
| `LOCAL_SESSION_TOKEN` | `change-me` | Auth token |
| `LOG_LEVEL` | `info` | Log level |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Graceful shutdown timeout |
| `PIPELINE_DEDUPE_CAPACITY` | `10000` | Dedupe store size |
| `PIPELINE_RATE_LIMIT_PER_VIEWER` | `10` | Events/sec per viewer |
| `PIPELINE_RATE_LIMIT_BURST` | `50` | Burst per viewer |
| `PIPELINE_RATE_LIMIT_GLOBAL` | `1000` | Global events/sec |
| `PIPELINE_COMMAND_QUEUE_CAPACITY` | `500` | Command queue size |
| `PIPELINE_EVENT_BUS_CAPACITY` | `1000` | Event bus queue size |

## Graceful Shutdown

On SIGINT/SIGTERM/POST `/control/shutdown`:
1. Stop accepting new connections
2. Drain in-flight requests (configurable timeout)
3. Flush event bus + command queue (log what's dropped)
4. Close Fastify instance
5. Exit 0

## Acceptance Gate

> Fixture events produce expected commands and malformed events never reach the rules engine.

- **Fixture test:** loads `valid_events.json` + `expected_commands.json`, processes
  each through the pipeline, asserts exact command output matches.
- **Malformed test:** loads `malformed_events.json`, processes each, asserts zero
  commands produced, asserts rules engine counter stays at 0.

## Known Limitations

- **Godot bridge integration deferred** — commands drained via `GET /commands` only.
  Phase 10 will wire the WebSocket bridge.
- **KICK_PLAYER not in GameCommand schema** — KickRule matches but the pipeline
  should call `director.hideViewer()` directly (Phase 9 adapter wiring).
- **Strategy commands** have no game mechanics yet (Phase 8+ mechanics).
- **Cross-session persistence** — pipeline state (dedupe, rate limit buckets) is
  session-scoped and lost on restart.
