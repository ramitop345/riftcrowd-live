# Viewer Identity and Faction Participation

Phase 7 extends the Match Director with session-scoped viewer profiles, chat command
parsing, champion spawning, contribution tracking, and moderation hooks.

## Viewer Profile Schema

```typescript
{
  schemaVersion: 1,
  viewerId: string,          // 1–128 chars, stable across session
  providerHandle: string,    // raw provider handle (stored but not displayed)
  displayName: string,       // sanitized, max 64 chars
  firstSeenAt: string,       // ISO 8601 datetime
  lastSeenAt: string,        // ISO 8601 datetime, updated on re-encounter
  factionId?: string,        // current faction (set on join)
  switchCount: number,       // total faction switches across session
  isHidden: boolean,         // moderation flag
  contributionCategories: { combat: 0, defense: 0, engagement: 0, gifts: 0 },
  roundsParticipated: number // incremented each round the viewer joined a faction
}
```

## Display Name Sanitization

`sanitizeDisplayName(raw, maxLength?)` applies in order:

1. Coerce non-string input (null, undefined, number, object) to `""`.
2. Strip ASCII control characters (0x00–0x1F, 0x7F).
3. Strip zero-width Unicode characters (U+200B, U+200C, U+200D, U+FEFF).
4. Trim leading/trailing whitespace.
5. Cap at `maxLength` characters (default 64).

**Never throws** on any input.

## Provider Handle Sanitization

`providerHandle` is sanitized on registration via `ViewerRegistry.getOrCreate()`:
ASCII control characters and zero-width Unicode characters are stripped, and the
result is trimmed. Unlike `displayName`, the 64-char cap is NOT applied (handles
are provider-assigned and may be longer). The sanitized form is stored in the
profile; use the raw form only for provider-specific lookups.

## Command Parsing

`CommandParser.parse(event, pack)` returns a discriminated union:

| `kind`          | Trigger                              | Fields                        |
|-----------------|--------------------------------------|-------------------------------|
| `mode_vote`     | First token matches mode keyword     | `modeId` (ContentPackMode)    |
| `join_faction`  | First token matches faction keyword  | `factionId`                   |
| `strategy`      | First token matches strategy keyword | `strategy`                    |
| `unrecognized`  | No keyword match                     | (viewerId, eventId only)      |

Mode keywords (case-insensitive): `1`/`countries`, `2`/`animals`, `3`/`clubs`,
`4`/`cities`.

Faction keywords: resolved via `matchJoinKeyword` against the current content pack,
or against synthetic faction IDs (`faction_alpha`, `faction_beta`) when no pack is
loaded.

Strategy keywords (configurable): `focus`, `defend`, `push`, `retreat`.

All parsing uses the **first-token rule** with a **200-char inspection cap**,
matching Phase 4/5/6 conventions.

## Champion Spawning

`ChampionSpawner.spawnIfNew(viewerId, displayName, factionId, eventId)` emits a
`SPAWN_CHAMPION` GameCommand once per viewer per round. Deduplication is keyed on
`viewerId`, not `factionId` — a viewer who switches factions does not get a second
champion in the same round. `resetRound()` clears the spawned set.

Champion command `id` is a deterministic SHA-1 hash (`champ_<40-hex-chars>`),
guaranteed to fit within the 128-char `GameCommandSchema.id` bound regardless
of viewerId/displayName/factionId lengths.

## Contribution Categories

`ContributionTracker` tracks four integer counters per viewer:

| Category     | Triggered by                                  |
|--------------|-----------------------------------------------|
| `combat`     | Combat-related game events (Phase 8+)        |
| `defense`    | Defense-related game events (Phase 8+)        |
| `engagement` | Every chat event (Phase 7)                    |
| `gifts`      | Gift events (Phase 11)                        |

Each counter is capped at `contributionCategoryCap` (default 1,000,000).
`resetRound()` zeroes all counters; viewer profile `roundsParticipated` is preserved.

## Moderation

- `director.hideViewer(viewerId)` — marks viewer as hidden; hidden viewers are
  rejected from faction joins.
- `director.unhideViewer(viewerId)` — removes the hidden flag.

## Per-Round State Reset

At the RESULTS → MODE_VOTE transition, the MatchDirector:

1. Captures the set of participating viewer IDs (for `roundsParticipated` increment).
2. Clears all per-round maps (`factionJoins`, `selectedFactions`, `voteMap`).
3. Calls `championSpawner.resetRound()` and `contributionTracker.resetRound()`.
4. Increments `roundsParticipated` for each captured participant.
5. Resets each viewer profile's `factionId = undefined` and `switchCount = 0`.

This ensures "one faction per round" (factionId is per-round state) and "one switch
allowed" (switchCount resets each round). Cross-round data (`roundsParticipated`,
contribution totals) is preserved.

## ViewerRegistry API

- `resetRoundState()` — clears per-round fields (factionId, switchCount) for all
  viewers while preserving cross-round persistent data. Call at round boundaries.
- `resetAll()` — clears ALL registered profiles. Destroys cross-round persistent
  state. **WARNING**: only call at session start or full session reset, NOT at
  round boundaries.
- `resetSession()` — deprecated alias for `resetAll()`.

## Configuration

`gateway/config/viewer.json`:

```json
{
  "displayNameMaxLength": 64,
  "chatCommandMaxLength": 200,
  "contributionCategoryCap": 1000000,
  "strategyKeywords": ["focus", "defend", "push", "retreat"]
}
```

Loaded at startup with Zod validation; falls back to defaults on any error.

## Known Limitations

- **Strategy commands are parsed but have no game mechanics.** Effect implementation
  is deferred to Phase 8+.
- **Godot-side champion name display** is Phase 13 dashboard territory.
- **Gift contribution tracking** requires Phase 11 gift economy integration.
- **Cross-session viewer persistence** is not implemented; profiles are
  session-scoped and cleared on process restart.
