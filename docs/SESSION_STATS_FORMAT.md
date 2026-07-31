# Session Stats Format

**File:** `gateway/data/session-stats.json` (runtime state, gitignored)

## Schema (version 1)

```json
{
  "schemaVersion": 1,
  "roundsPlayed": 0,
  "modeCounts": {
    "countries": 3,
    "animals": 2,
    "fan_crews_original": 1,
    "cities": 4
  },
  "factionWinCounts": {
    "faction_alpha": 6,
    "faction_beta": 4
  },
  "recentModes": ["cities", "animals", "countries", "fan_crews_original"],
  "lastSavedAt": "2026-07-31T12:00:00.000Z"
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | `1` | Schema version literal. Must be `1`. |
| `roundsPlayed` | `number` | Total rounds completed this session. |
| `modeCounts` | `Record<string, number>` | Count of rounds per mode ID. |
| `factionWinCounts` | `Record<string, number>` | Count of wins per faction ID. |
| `recentModes` | `string[]` | Last 10 mode IDs played (newest first). Used for LRU tie-breaking. |
| `lastSavedAt` | `string` | ISO 8601 datetime of last save. |

## Atomic Write Behavior

Writes are atomic to prevent corruption:

1. Stats are serialized to JSON.
2. Written to `session-stats.json.tmp`.
3. Renamed to `session-stats.json` (atomic on most filesystems).

If the write fails (e.g., EACCES, disk full), the error is logged and the in-memory stats continue. The file may be stale but is never corrupted.

## Corruption Recovery

On load, the following recovery strategies apply:

| Condition | Behavior |
|-----------|----------|
| File missing (ENOENT) | Returns default stats (roundsPlayed: 0, empty maps). No warning. |
| Invalid JSON | Returns default stats. Logs warning. |
| Schema validation failure | Returns default stats. Logs warning with details. |
| EACCES / permission error | Returns default stats. Logs warning. |

Default stats:
```json
{
  "schemaVersion": 1,
  "roundsPlayed": 0,
  "modeCounts": {},
  "factionWinCounts": {},
  "recentModes": [],
  "lastSavedAt": "1970-01-01T00:00:00.000Z"
}
```

## Zod Schema

```typescript
import { z } from 'zod';

export const SessionStatsSchema = z.object({
  schemaVersion: z.literal(1),
  roundsPlayed: z.number().int().min(0),
  modeCounts: z.record(z.string(), z.number().int().min(0)),
  factionWinCounts: z.record(z.string(), z.number().int().min(0)),
  recentModes: z.array(z.string()).max(10),
  lastSavedAt: z.string(),
});
```

## Update Function

`recordRound(stats, modeId, winningFactionId)` is a pure function that returns new stats:

- `roundsPlayed` incremented by 1
- `modeCounts[modeId]` incremented
- `factionWinCounts[winningFactionId]` incremented
- `recentModes` prepended with `modeId`, capped at 10
- `lastSavedAt` updated to current ISO datetime
