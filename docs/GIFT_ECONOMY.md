# Gift Economy — Phase 11

## Architecture Overview

The gift economy translates viewer gift events into gameplay effects through a
five-stage pipeline:

```
GiftMapper → StreakAggregator → CooldownManager → OverflowConverter → GameCommand(s)
```

1. **Mapper** — resolves a raw gift ID + repeat count to a tier and impact type.
2. **Streak aggregator** — detects per-viewer, per-tier streaks within a sliding
   window and applies a magnitude multiplier.
3. **Cooldown manager** — enforces five independent timers to prevent gift spam.
4. **Overflow converter** — when unit bounds are reached, converts magnitude to
   reserve energy/score.
5. **Command production** — the final `GameCommand[]` is enqueued for the Godot
   client.

The orchestrator class is `GiftEconomy` (`gateway/src/gifts/gift_economy.ts`).
The pipeline rule is `GiftRule` (`gateway/src/gifts/gift_rule.ts`).

## Tier System

Three default tiers (configurable via `gateway/config/gifts.json`):

| Tier ID      | Name    | Value Range | Impact Type        | Magnitude | Cinematic |
|-------------|---------|-------------|--------------------|-----------|-----------|
| tier_spark  | Spark   | 1–9         | add_energy         | 10        | no        |
| tier_flare  | Flare   | 10–99       | spawn_champion     | 1         | no        |
| tier_nova   | Nova    | 100–100000  | start_world_event  | 1         | yes       |

Tiers are validated at config load time; unknown tier IDs in mappings are
rejected by the schema (`superRefine` cross-validation).

## Gift Mappings

20 default gifts (`gift_001` through `gift_020`) mapped across the three tiers:

- **Spark** (gift_001–gift_007): Rose, Heart, Star, Sparkle, Gem, Flame, Bolt
- **Flare** (gift_008–gift_014): Blaze, Crown, Shield, Sword, Scroll, Potion, Rune
- **Nova** (gift_015–gift_020): Phoenix, Dragon, Titan, Aurora, Eclipse, Supernova

Mappings are extendable by adding entries to `gifts.json` and reloading via
POST /gifts/config.

## Streak Mechanics

- **Window**: 5,000 ms (configurable `streaks.windowMs`).
- **Minimum count**: 3 gifts of the same tier from the same viewer within the
  window (configurable `streaks.minCount`, minimum 2).
- **Multiplier**: 1.5× base magnitude (configurable `streaks.multiplier`, minimum 1).
- **No double counting**: once a streak fires, subsequent gifts in the same
  window do not trigger a new streak until the window elapses.
- **Happy-path only**: streaks are recorded only for gifts that pass cooldown
  and overflow checks — cooldown-blocked or overflowed gifts do not consume
  streak state.

## Cooldown Model

Five independent timers (all configurable in `cooldowns` section):

| Timer          | Key                   | Default | Scope                          |
|---------------|----------------------|---------|---------------------------------|
| Per-user       | `perUserMs`          | 3,000   | Same viewerId                   |
| Per-faction    | `perFactionMs`       | 2,000   | Same factionId                  |
| Ability        | `abilityMs`          | 10,000  | Same ability ID                 |
| Cinematic      | `cinematicMs`        | 30,000  | Same cinematic tierId           |
| Global         | `globalMs`           | 1,000   | All viewers and factions        |

All five timers must have expired before a gift impact can fire. Ability
cooldown applies to `cast_ability` impacts; cinematic cooldown applies to
`start_world_event` and `display_spotlight` impacts when `cinematic: true`.

## Overflow Rules

When a gift impact would spawn more units than bounds allow, the magnitude is
converted to reserve energy/score at the configured `conversionRate` (default 5).

- **Reserve cap**: 1,000,000. Amounts that would exceed the cap are clamped;
  `reserveAdded` reports the actual (net) amount added.
- **Bounds** (configurable):
  - Max active champions per faction: 5
  - Max active squads per faction: 3
  - Max active world events: 2
  - Max command queue size: 500

## HTTP Endpoints

All endpoints require `Authorization: Bearer <LOCAL_SESSION_TOKEN>`.

| Method | Path            | Description                              |
|--------|-----------------|------------------------------------------|
| GET    | /gifts/config   | Returns current gift economy config      |
| POST   | /gifts/config   | Hot-reloads config (validates via Zod)   |
| GET    | /gifts/preview  | Returns mapping preview table            |
| GET    | /gifts/stats    | Returns orchestrator stats               |

POST /gifts/config rejects invalid configs with a 400 status and Zod issue
details.

## Faction Resolution

Gift commands are routed to the viewer's registered faction (from
`ViewerRegistry` via `handleFactionJoin`). If the viewer has no registered
faction, a deterministic hash-based fallback is used (even char-sum →
`faction_alpha`, odd → `faction_beta`). A warning is logged when the fallback
is used.

## Fixture Methodology

The 1,000-event fixture test (`gift_fixture.test.ts`) builds a deterministic
event stream (mulberry32 PRNG, seed 42):

- 70% gift events, 20% chat events, 10% malformed events
- 50 viewers, 20 gift IDs
- Zero cooldowns (to stress overflow behavior)

Asserts: no crashes, queue bounded, active units within bounds, overflow
conversions logged, reserve accumulated.

Economy-only and pipeline-only passes are separated to avoid double-processing
shared streak/cooldown state.

## Known Limitations

- **Hot-reload resets all in-flight state.** `reloadConfig()` replaces the
  mapper, streak aggregator, cooldown manager, overflow converter, and gift
  rule. Active streaks, cooldown timers, and the reserve counter are all
  reset to initial state. This is a non-obvious side effect — operators
  should be aware before hot-reloading during an active session.
- **Godot-side gift effects are deferred.** The `GIFT_APPLY` command type is
  defined in `GameCommandTypeSchema` (schema version 2) and the GDScript
  `command_dispatcher.gd` declares the `gift_apply` signal, but actual
  gameplay effects (captain ultimates, energy bursts) are not yet wired.
- **COMMAND_SCHEMA_VERSION bumped to 2.** The addition of `GIFT_APPLY` to
  `GameCommandTypeSchema` expanded the command vocabulary. Phase 10 WS
  clients will now receive a new command type they may not recognize.
- **Single-server only.** Each gateway instance maintains its own gift
  economy state; no clustering or cross-instance state sharing.
- **Schema validation is at config load time only.** Runtime mutations to
  individual config fields are not supported; use POST /gifts/config to
  replace the entire config atomically.
