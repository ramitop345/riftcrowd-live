# Match Director (Phase 6)

The Match Director is a Node.js state machine that orchestrates the round lifecycle for RiftCrowd LIVE. It runs entirely in the gateway process (no Godot dependency).

## State Diagram

```
IDLE → MODE_VOTE → FACTION_LOBBY → BATTLE_OPENING → BATTLE_CRISIS →
BATTLE_FINAL_SURGE → BATTLE_SUDDEN_DEATH → BATTLE_ENDED → RESULTS → MODE_VOTE (next round)
```

## Stage Timings (Default)

| Stage | Duration | Config Key |
|-------|----------|------------|
| Mode Vote | 20s | `modeVoteDuration` |
| Faction Lobby | 35s | `factionLobbyDuration` |
| Battle Opening | 120s | `battleConfig.opening` |
| Battle Crisis | 60s | `battleConfig.crisis` |
| Battle Final Surge | 60s | `battleConfig.finalSurge` |
| Battle Sudden Death | 45s | `battleConfig.suddenDeath` |
| Results | 20s | `resultsDuration` |

Config file: `gateway/config/director.json`

## Mode Vote Keywords

Viewers vote for the next mode by commenting one of these keywords (case-insensitive, first token only):

| Keyword | Mode ID |
|---------|---------|
| `1` / `countries` | `countries` |
| `2` / `animals` | `animals` |
| `3` / `clubs` | `fan_crews_original` |
| `4` / `cities` | `cities` |

### Rules

- **First vote wins**: duplicate votes from the same viewer are ignored.
- **Tie-breaking**: highest vote count wins. On tie → least-recently-played (LRU) mode wins. On first round with no history → alphabetical mode ID.
- **No votes**: LRU fallback (or alphabetical on no history).

## Faction Lobby

During FACTION_LOBBY, viewers join a faction by commenting a faction keyword (first token, case-insensitive).

### Rules

- One faction per viewer per round.
- **One switch allowed**: after the first join, a viewer may switch faction once. Subsequent joins are ignored.
- **No joins**: if no viewers join, 2 mock players auto-join (one per synthetic faction) to prevent empty rounds.

## MockSimulation

The director uses a deterministic mock simulation (mulberry32 PRNG) that produces snapshots matching the Phase 5 SimWorld shape. No Godot dependency.

### Snapshot Shape

```typescript
interface MockSnapshot {
  tick: number;
  elapsed: number;
  stage: string;
  stage_time_left: number;
  dominion: [number, number];
  fortress_health: [number, number];
  capture_pressure: [number, number];
  winner: number;
  victory_type: string;
  units: MockUnit[];
  projectiles: MockProjectile[];
  events: string[];
  pool_stats: Record<string, number>;
}
```

### Stage Events

- **Crisis start**: emits `events: ["boss_spawned"]`
- **Victory**: emits `events: ["victory:<winner>:<victory_type>"]`

## Creator Command HTTP API

All endpoints require `Authorization: Bearer <LOCAL_SESSION_TOKEN>` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/director/skip` | Jump to next stage |
| `POST` | `/director/pause` | Freeze timers + mock sim |
| `POST` | `/director/resume` | Unfreeze |
| `POST` | `/director/end` | Force RESULTS with current winner |
| `POST` | `/director/restart` | Force MODE_VOTE with fresh seed |
| `GET` | `/director/state` | Read current director state |

### Error Responses

| Status | Condition |
|--------|-----------|
| `503` | `LOCAL_SESSION_TOKEN` env var not set |
| `401` | Missing, malformed, or invalid token |
| `409` | Command invalid for current state (e.g., `end` when IDLE) |

## Public API

### `createDirector(opts)`

```typescript
import { createDirector } from './director/index.js';

const director = createDirector({
  sessionStatsPath: 'gateway/data/session-stats.json',
  modeVoteDuration: 20,
  factionLobbyDuration: 35,
  battleConfig: { opening: 120, crisis: 60, finalSurge: 60, suddenDeath: 45 },
  resultsDuration: 20,
  onAnnouncement: (a) => console.log(a),
});

director.start();
director.advanceTime(1); // advance clock by 1 second
director.handleModeVote('viewer_123', 'countries');
director.handleFactionJoin('viewer_123', 'faction_alpha');
```

### `MatchDirector` Methods

| Method | Description |
|--------|-------------|
| `start()` | Loads stats, transitions to MODE_VOTE |
| `advanceTime(deltaSeconds)` | Advances clock, triggers transitions |
| `handleModeVote(viewerId, rawComment)` | Records a mode vote |
| `handleFactionJoin(viewerId, rawComment)` | Records a faction join |
| `advanceMockSimTick()` | Ticks MockSimulation, returns snapshot |
| `skipStage()` | Creator: skip to next stage (no-op in BATTLE_ENDED) |
| `pause()` | Creator: freeze timers |
| `resume()` | Creator: unfreeze |
| `forceEnd()` | Creator: force RESULTS |
| `restart()` | Creator: fresh MODE_VOTE |
| `get_state()` | Returns DirectorStateSnapshot |

### Announcements

```typescript
type Announcement =
  | { kind: 'mode_selected'; message: string; data: { modeId, voteCounts, tieBrokenBy } }
  | { kind: 'stage_changed'; message: string; data: { from, to } }
  | { kind: 'round_ended'; message: string; data: { winningFaction, dominion, fortressHealth, victoryType } };
```

## Skip Stage Behavior

`skipStage()` unconditionally advances to the next stage:
- **MODE_VOTE** → FACTION_LOBBY (resolves vote immediately)
- **FACTION_LOBBY** → BATTLE_OPENING (finalizes factions)
- **BATTLE_OPENING** → BATTLE_CRISIS (syncs mock sim stage)
- **BATTLE_CRISIS** → BATTLE_FINAL_SURGE (syncs mock sim stage)
- **BATTLE_FINAL_SURGE** → BATTLE_SUDDEN_DEATH (syncs mock sim stage)
- **BATTLE_SUDDEN_DEATH** → BATTLE_ENDED (syncs mock sim stage)
- **BATTLE_ENDED** → no-op (auto-transitions to RESULTS via timer=0)
- **RESULTS** → MODE_VOTE (records round and resets)

## Limitations (Phase 6)

- **Godot-side Match Director integration** is Phase 13 dashboard territory.
- Creator commands are Node-only (HTTP REST), not exposed to the Godot client.
- Faction matching uses synthetic factions (`faction_alpha`, `faction_beta`); real pack-based factions require Phase 7+ platform adapter.
- No real viewer engagement data (gifts, top contributors) — placeholder empty arrays in results screen data.

## Next Phase

Phase 7 — Viewer Identity and Faction Participation: session-scoped viewer profiles, faction join commands, one faction per round enforcement, named champion spawning.
