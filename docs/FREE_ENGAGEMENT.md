# Free Engagement Mechanics — Phase 12

## Overview

Phase 12 adds free engagement mechanics so non-paying viewers can meaningfully influence and win rounds:

- **Like milestones** — cumulative per-faction like counts trigger energy/score rewards
- **Follow guardians** — following spawns a temporary Guardian champion
- **Share shields** — sharing applies a temporary shield to the faction
- **Strategy votes** — `!strategy <option>` chat commands aggregate votes and fire abilities
- **Free energy abilities** — `!ability` chat command adds energy per viewer
- **Top contributor tracking** — highest free-engagement contributor gets spotlight at round end
- **Comment spam filter** — per-viewer sliding window prevents chat flooding
- **Duplicate vote prevention** — same viewer + same option within window rejected

## Architecture

```
gateway/src/engagement/
├── free_engagement_config.ts   — Zod schema (gateway/config/free_engagement.json)
├── spam_filter.ts              — per-viewer sliding window
├── like_milestone_aggregator.ts — cumulative like counts → milestones
├── follow_guardian.ts          — follow → SPAWN_CHAMPION (guardian)
├── share_shield.ts             — share → ADD_SHIELD
├── strategy_vote.ts            — !strategy → CAST_ABILITY at minVotes
├── free_energy_ability.ts      — !ability → ADD_ENERGY
├── top_contributor.ts          — weighted contributions → DISPLAY_SPOTLIGHT
├── free_engagement_rule.ts     — CommandRule implementation (pipeline)
└── free_engagement.ts          — orchestrator facade
```

### Pipeline Integration

`FreeEngagementRule` registers via `registerRule()` and routes events:

| Event Type | Routes To | Command Produced |
|---|---|---|
| `like` | LikeMilestoneAggregator | ADD_ENERGY or ADD_SCORE |
| `follow` | FollowGuardian | FOLLOW_GUARDIAN |
| `share` | ShareShield | SHARE_SHIELD |
| `chat` + `!strategy` | StrategyVote | STRATEGY_VOTE |
| `chat` + `!ability` | FreeEnergyAbility | FREE_ENERGY_ABILITY |

Spam filter is applied BEFORE the rules engine processes chat events.

## Configuration

`gateway/config/free_engagement.json`:

| Section | Key | Default | Description |
|---|---|---|---|
| likeMilestones | count | 10/50/100/500 | Cumulative thresholds |
| likeMilestones | reward.type | add_energy/add_score | Reward command type |
| likeMilestones | reward.magnitude | 5/10/20/50 | Reward amount |
| followGuardian | enabled | true | Enable/disable |
| followGuardian | durationMs | 30000 | Guardian duration |
| followGuardian | cooldownMs | 60000 | Per-viewer cooldown |
| followGuardian | championType | guardian | Champion type |
| shareShield | enabled | true | Enable/disable |
| shareShield | durationMs | 15000 | Shield duration |
| shareShield | cooldownMs | 30000 | Per-viewer cooldown |
| shareShield | magnitude | 10 | Shield amount |
| strategyVote | windowMs | 30000 | Vote collection window |
| strategyVote | minVotes | 5 | Votes to trigger |
| strategyVote | options | rush/defend/focus/retreat | Valid options |
| freeEnergyAbility | cooldownMs | 30000 | Per-viewer cooldown |
| freeEnergyAbility | magnitude | 5 | Energy amount |
| freeEnergyAbility | maxPerViewerPerRound | 3 | Max uses per round |
| spam | maxCommentsPerWindowMs | 5 | Max comments per window |
| spam | windowMs | 10000 | Sliding window size |
| spam | duplicateVoteWindowMs | 60000 | Duplicate vote prevention |
| topContributor | enabled | true | Enable/disable |
| topContributor | rewardType | spotlight | Reward type |
| topContributor | magnitude | 1 | Reward amount |
| bounds | maxActiveGuardiansPerFaction | 3 | Guardian limit |
| bounds | maxActiveShieldsPerFaction | 5 | Shield limit |

## HTTP Endpoints

All endpoints require `Authorization: Bearer <LOCAL_SESSION_TOKEN>`.

| Method | Path | Description |
|---|---|---|
| GET | `/engagement/config` | Returns current config |
| POST | `/engagement/config` | Hot-reload config (Zod-validated) |
| GET | `/engagement/stats` | Returns orchestrator stats |
| GET | `/engagement/top` | Returns top contributors list |

## Command Schema

Phase 12 bumps `COMMAND_SCHEMA_VERSION` from 2 to 3, adding:

- `FOLLOW_GUARDIAN` — guardian spawn from follow
- `SHARE_SHIELD` — shield from share
- `STRATEGY_VOTE` — strategy vote result
- `FREE_ENERGY_ABILITY` — free energy from !ability
- `ADD_SCORE` — score from like milestones

## Top Contributor

Weighted scoring:
- Like: 1 point
- Follow: 5 points
- Share: 5 points
- Vote: 1 point
- Ability: 1 point

Ties broken alphabetically by viewerId. At round end (RESULTS stage), top contributor gets `DISPLAY_SPOTLIGHT`.

## Spam Filter

Per-viewer sliding window: if > `maxCommentsPerWindowMs` comments within `windowMs`, further comments are rejected. Applied BEFORE the rules engine.

## Godot Integration

### CommandDispatcher

New signals:
- `follow_guardian(payload: Dictionary)` — guardian spawn
- `share_shield(payload: Dictionary)` — shield apply
- `strategy_vote(payload: Dictionary)` — strategy triggered
- `free_energy_ability(payload: Dictionary)` — free energy
- `add_score(payload: Dictionary)` — score from milestones

### FreeEngagement (game/scripts/engagement/free_engagement.gd)

Subscribes to CommandDispatcher signals. Tracks active guardians and shields per faction with expiry cleanup.

### HUD (game/scenes/ui/FreeEngagementInstructions.tscn)

Non-intrusive instructions displayed in Battle scene:
- Follow for Guardian (60s cooldown)
- Share for Shield (30s cooldown)
- !strategy <option> to vote
- !ability for free energy
- Like milestones: 10/50/100/500

## Acceptance Gate

`free_engagement_fixture.test.ts` proves:
- faction_alpha: 50 likes + 10 follows + 5 shares + 5 strategy votes
- faction_beta: 5 likes
- faction_alpha's cumulative score > faction_beta's
- faction_alpha wins via free engagement alone (no gifts)
- ≥10 assertions pass

## Known Limitations

- **Godot NOT installed.** All GDScript is hand-authored and desk-checked only.
- **Hot-reload resets all in-flight state.** `reloadConfig()` replaces all internal components.
- **Single-server only.** Each gateway instance maintains its own state.
- **Dashboard UI not wired.** Creator Dashboard (Phase 13) will add UI controls.
- **Spam filter is chat-only.** The spam filter applies only to chat events. Automated like/follow/share floods are not throttled by this filter (they are subject to the pipeline's rate limiter and per-viewer/per-faction cooldowns instead).
- **CRLF format drift is pre-existing.** Cosmetic only.
