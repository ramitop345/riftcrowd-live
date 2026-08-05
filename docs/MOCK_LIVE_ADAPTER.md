# Mock LIVE Adapter — Phase 9

## Overview

Phase 9 delivers a comprehensive LIVE simulator that makes RiftCrowd LIVE fully
testable without a live TikTok account. The `MockLiveAdapter` plays back scripted
scenarios of `NormalizedLiveEvent` objects through the Phase 8 pipeline, optionally
driving the Phase 6/7 MatchDirector through its full state machine.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│  Scenario   │────▶│ MockLiveAdapter│────▶│  Pipeline  │──▶ Commands
│  (events)   │     │  + TestClock  │     │ (Phase 8)  │
└─────────────┘     └──────┬───────┘     └────────────┘
                           │
                    ┌──────▼───────┐
                    │   Director   │
                    │  (Phase 6/7) │
                    └──────────────┘
```

## LiveAdapter Interface

`gateway/src/adapters/live_adapter.ts`

```typescript
interface LiveAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(handler: (event: NormalizedLiveEvent) => void): void;
  isConnected(): boolean;
}
```

Three implementations:
- **MockLiveAdapter** — scenario-driven playback (this phase)
- **ReplayAdapter** — replays a RecordedSession
- **TikTokLiveAdapter** — Phase 14 placeholder (throws NotImplementedError)

## TestClock

`gateway/src/adapters/test_clock.ts`

Deterministic clock for reproducible scenarios:

| Method | Description |
|--------|-------------|
| `now()` | Returns current time in ms |
| `advance(ms)` | Increments time; notifies handlers |
| `setTime(ms)` | Jumps to absolute time (no rewind) |
| `reset(ms)` | Resets clock (can go backward) |
| `onAdvance(handler)` | Registers a callback; returns unsubscribe |

## Scenarios

`gateway/src/adapters/scenarios.ts`

| Scenario | Events | Duration | Description |
|----------|--------|----------|-------------|
| `normal_traffic` | 50 | 2 min | 10 viewers: mode votes, faction joins, general chat |
| `gift_streak` | 30 | 30 s | 1 viewer sends 30 gifts in a streak |
| `viral_burst` | 200 | 10 s | 50 viewers stress-test (rate limiter test) |
| `malformed_payloads` | 30 | 30 s | 20 malformed + 10 valid (normalizer test) |
| `disconnect` | 6 | 15 s | Connection drop mid-stream |
| `reconnect` | 10 | 25 s | Disconnect + reconnect + resume |
| `four_mode_round` | 70+ | ~6 min | Full round: mode vote → lobby → battle → results → next vote |
| `technique_demo` | 6 | 22 s | 3 viewers join red/blue, then send Finger Heart / Galaxy / Lion gifts |

### Disconnect/Reconnect Markers

Events with `user.id === '__system__'` and special comments:
- `comment: '__disconnect__'` → adapter sets `isConnected() = false`
- `comment: '__reconnect__'` → adapter sets `isConnected() = true`

System events are NOT forwarded to the pipeline.

## MockLiveAdapter

`gateway/src/adapters/mock_live_adapter.ts`

```typescript
new MockLiveAdapter({
  scenario: Scenario,
  clock: TestClock,
  pipeline?: Pipeline,
  director?: MatchDirector,
});
```

- `start()` — schedules events on TestClock, connects
- `stop()` — clears pending events, disconnects
- `runToEnd(stepMs?)` — advances clock in increments until all events emitted
- `emittedEvents` — all events emitted so far
- `commands` — all commands produced (from pipeline integration)
- `directorStates` — director state transitions recorded

## Recording

`gateway/src/adapters/recording.ts`

### RecordedSession Schema (schemaVersion: 1)

```typescript
{
  schemaVersion: 1,
  recordedAt: ISO datetime,
  events: ScheduledEvent[],       // { timeMs, event: NormalizedLiveEvent }
  commands: GameCommand[],
  directorSnapshots: DirectorSnapshot[],
}
```

### SessionBuilder

Incrementally builds a RecordedSession:
- `addEvent(timeMs, event)`
- `addCommand(command)`
- `addDirectorSnapshot(snapshot)`
- `build()` → RecordedSession

### save/load

- `saveSession(session, path)` — atomic write (tmp + rename)
- `loadSession(path)` — reads and Zod-validates; throws on malformed files

## Replay

`gateway/src/adapters/replay.ts`

```typescript
new ReplayAdapter({
  session: RecordedSession,
  clock: TestClock,
  pipeline?: Pipeline,
  director?: MatchDirector,
});
```

Replays events at their recorded timestamps. Deterministic: same session → same output.

## CLI

`tools/cli/mock-live.ts`

```bash
npx tsx tools/cli/mock-live.ts --scenario=normal_traffic
npx tsx tools/cli/mock-live.ts --scenario=four_mode_round --record=session.json
npx tsx tools/cli/mock-live.ts --replay=session.json
npx tsx tools/cli/mock-live.ts --list
```

> **Note:** TestClock playback is always instant. The `--speed` flag has been removed;
> there is no real-time pacing. All events are played back as fast as the pipeline
> can process them.

## Dashboard Endpoints

Mock routes are **opt-in** via `enableMockRoutes: true` in `buildApp()`.
They are NOT registered by default in production.

All endpoints require `Authorization: Bearer <LOCAL_SESSION_TOKEN>`.

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/mock/start` | `{ scenario }` | Start a scenario |
| POST | `/mock/stop` | — | Stop running adapter |
| POST | `/mock/advance` | `{ ms }` | Advance TestClock manually |
| POST | `/mock/inject` | `{ kind: 'comment', viewerId?, comment }` or `{ kind: 'gift', viewerId?, giftId, giftName?, providerValue? }` | Inject a single event through the pipeline (no scenario needed); returns `commandTypes`, `dropped`, `reason` |
| GET | `/mock/state` | — | Adapter state and stats (includes `eventsInjected`) |
| POST | `/mock/record` | `{ scenario }` | Run + save RecordedSession |
| POST | `/mock/replay` | `{ sessionPath }` | Replay a saved session |

> **Security:** `/mock/replay` confines `sessionPath` to the recordings directory
> (`gateway/data/recordings`). Path traversal attempts return 400.

> **Note:** Injected events get unique `evt_inject_<uuid>` ids so they never
> collide with scenario event ids in the dedupe store. Gifts only produce
> `CAST_TECHNIQUE` for viewers who already joined a team (comment `red`/`blue`
> while the director is in lobby/battle states); gift cooldowns still apply.

## Known Limitations

- **TikTokLiveAdapter is a stub.** Throws NotImplementedError — Phase 14 territory.
- **Gift mechanics not implemented.** Gift events are emitted but Phase 11 will add
  gameplay effects (captain ultimates, energy bursts).
- **Rate limiter uses real time.** The pipeline's RateLimiter uses `Date.now()`, not
  TestClock. Rate limiting behavior during scenario playback depends on real wall-clock
  speed.
- **Director time advancement is approximate.** The adapter advances director time
  in integer-second increments based on clock delta, which may differ slightly from
  real-time pacing.
