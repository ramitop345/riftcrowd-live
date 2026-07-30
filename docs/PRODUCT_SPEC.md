# RiftCrowd LIVE — Product Spec (DRAFT)

> **DRAFT.** This is the Phase 1 working outline, condensed from Sections 2–7 of
> `RiftCrowd_LIVE_Complete_Qoder_Implementation_Guide.md`. The binding product lock, acceptance
> tests, and legal boundaries are **Phase 0** deliverables. Do not treat any number here as final.

## Concept

RiftCrowd LIVE is a fast portrait (1080 x 1920) auto-battler in which TikTok viewers join a faction,
spawn named champions, charge abilities, defend a fortress, and fight for a central **Rift Crown**
through both free engagement and optional gifts. The viewers are not watching someone play — the
viewers collectively are the players.

The game must be readable in two seconds with no sound: clearly identified factions, a visible
central objective, large meters, viewer names attached to champions, one short instruction bar.

## MVP scope: two factions, four-faction-ready data

Ship a **two-faction MVP**. Four factions multiply navigation, balancing, UI, testing, and
event-routing complexity. The architecture, schemas, and content-pack format must support up to four
factions from day one, but the first live-ready build shows two.

Win conditions: reach 100% Dominion by holding the Crown, destroy the opposing fortress, or lead in
Dominion when the sudden-death timer expires.

## Round structure

Approximately 5–6 minutes per round:

1. **Mode vote** — 20 s. Audience picks the content mode. One vote per viewer, rate-limited. Ties
   resolve to the least recently played mode, never a paid or random mechanic.
2. **Faction lobby** — 35 s. Viewers comment a faction keyword to join.
3. **Opening battle** — 120 s. Units spawn and fight for the Crown.
4. **Rift crisis** — 60 s. A neutral boss or hazard attacks both sides.
5. **Final surge** — 60 s. Higher energy generation, stronger visual intensity.
6. **Sudden death** — up to 45 s. No healing, faster Crown capture.
7. **Results** — 20 s. Winner, top supporters, best free contributor, next-round countdown.

## Content modes

All four modes share the same combat code. Only data, presentation, sound, units, ability names,
arenas, and faction identities change. Never build four separate games.

| Mode id              | Player-facing name | Notes                                                     |
| -------------------- | ------------------ | --------------------------------------------------------- |
| `countries`          | Nations of the Rift | Country names used descriptively; original banners only   |
| `animals`            | Beasts of the Rift  | Cleanest ownership; original art, animation, sound, names  |
| `fan_crews_original` | Fan Crews           | Entirely fictional supporter crews, no real club identity  |
| `cities`             | Metro Dominion      | City names descriptive; original skylines, no seals/logos  |

`fan_crews_original` is deliberately named to make the constraint structural: no official club names,
crests, jerseys, player identities, songs, slogans, or famous nicknames, and no near-miss
misspellings of them. A licensed pack could later load through the same format, after written
permission.

## Free engagement must matter

A viewer must be able to matter without spending money.

- **Comments** — join a faction, vote a mode, vote `attack` / `defend` / `crown` in strategy windows,
  and a capped cheer contribution.
- **Likes** — fill the faction community-energy meter. Processed as aggregated milestones, never one
  animation per like.
- **Follows** — spawn a temporary Guardian, add the name to the support wall, restore a small capped
  shield.
- **Shares** — a temporary shield point, a boosted next free-energy milestone, a moderate flare.
- **Subscriptions** — a session badge and a named elite skin. Never permanent unbeatable power.
- **Gifts** — normalized into impact points, then mapped to tiers (Spark, Surge, Epic, Mythic) by an
  editable creator mapping. A large gift guarantees a visible reaction, never a guaranteed win.

The game never assumes a given gift keeps the same name, price, availability, or identifier.

## No gambling, no pressure gifting

Explicitly out of scope, permanently:

- Gifts as lottery tickets, or any hidden odds.
- Random cash, product, or monetary prizes; winner-takes-money pools.
- Any promise that a gift returns value.
- Fake countdowns or any claim that pressures viewers to spend, or that suggests spending is required
  to avoid a penalty or to obtain a real-world reward.

Abilities may contain in-game randomness, but a viewer always receives the visible effect the mapping
described. Free participation methods are displayed prominently.

## Fairness, safety, and overload control

Every incoming event passes: schema validation → sanitization → duplicate detection → gift-streak
aggregation → rate and burst limiting → faction resolution → rules engine → bounded command queue →
paced consumption by the game → acknowledgement and logging.

- Diminishing returns for repeated identical events from one viewer in a short window.
- Per-faction ability cooldowns and a global cinematic cooldown.
- A cap on active summoned units; excess spawn value converts to score or reserve energy.
- A burst of 500 small gifts becomes a small number of visible spawns plus reserve energy plus one
  combined celebration — the supporter still receives full credit for their normalized contribution.
- Display names are sanitized, length-limited, markup-escaped, and filtered against a configurable
  blocked-word list. Viewer avatars are disabled in the MVP.
- One faction per viewer per round; one switch allowed during the lobby only.
- Creator emergency controls: pause battle, disable incoming events, disable gifts only, clear queue,
  end round safely, restart connector.

## Open questions for the Phase 0 lock

- Final two launch factions and their keyword sets.
- Numeric balance for energy milestones, gift tiers, and unit caps.
- Acceptance-test list and pass criteria for a "live-ready" round.
- Session persistence scope: JSON files for the MVP, SQLite later.
