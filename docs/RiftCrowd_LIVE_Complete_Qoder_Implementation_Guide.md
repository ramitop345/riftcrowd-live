
# RiftCrowd LIVE
## Complete Game Design and Qoder Implementation Guide

**Working title:** RiftCrowd LIVE  
**Document version:** 1.0  
**Prepared:** 30 July 2026  
**Primary platform:** Windows 10/11, TikTok LIVE, Godot, Node.js, Qoder  
**Game format:** Portrait 9:16 autonomous audience-controlled arena game

> **Purpose of this guide**  
> This is a complete product and development blueprint for creating an original TikTok LIVE game from scratch. Viewers join a faction through comments and influence an automatic battle through likes, follows, shares, subscriptions, and gifts. The same game engine supports four selectable themes: Countries, Animals, fictional Club-Style Nicknames, and Cities.

> **Important legal and platform note**  
> This document is a technical and product guide, not legal advice. Before commercial release, verify TikTok's current LIVE, monetization, virtual-item, and gaming rules, and obtain legal advice for any brand, nickname, emblem, flag, city seal, music, artwork, or third-party integration you plan to use.

## Table of Contents

1. Executive decision and recommended stack
2. The game: RiftCrowd LIVE
3. Why the concept is suitable for TikTok
4. The four game modes
5. Complete match and interaction design
6. Gift, like, comment, follow, and share mechanics
7. Fairness, safety, overload control, and anti-abuse
8. Copyright, trademark, country, city, and club-name rules
9. Technical architecture
10. Repository and data design
11. Windows software and package installation
12. How to work with Qoder correctly
13. Master Qoder bootstrap prompt
14. Development phases and phase prompts
15. Testing strategy
16. Streaming setup with OBS or TikTok LIVE Studio
17. Release, operations, and maintenance
18. Future expansion roadmap
19. Troubleshooting
20. Source notes

# 1. Executive Decision and Recommended Stack

## 1.1 Is the project possible?

Yes. The game itself can be created completely from scratch. A local connector can receive TikTok LIVE events, normalize them, apply safety limits, and send game commands to a Godot game through a local WebSocket connection. OBS Studio or TikTok LIVE Studio then captures the game window and broadcasts it.

The main engineering risk is not the game engine. It is the reliability and permitted use of the TikTok LIVE event source. TikTok's public developer documentation does not currently document a generally available LIVE gift-event endpoint for independent games. Therefore, the system must isolate TikTok connectivity behind a replaceable adapter. The first usable integration can use TikFinity's local LIVE API; a mock adapter must always remain available for development and demonstrations.

## 1.2 Recommended production-minded stack

| Layer | Recommendation | Reason |
|---|---|---|
| Game engine | Godot 4.7.1, standard build, GDScript | Free, open source, excellent 2D workflow, lightweight Windows export, built-in WebSocket client |
| Event gateway | Node.js 24 LTS with TypeScript | Stable long-term-support runtime, strong event and WebSocket ecosystem |
| Creator dashboard | React + Vite, served locally | Easy mapping controls, live status, testing, emergency controls |
| LIVE integration | Provider adapter: Mock first, TikFinity second | Prevents the game from depending permanently on one third-party connector |
| Streaming | OBS Studio or TikTok LIVE Studio | Captures the portrait game window and sends it to TikTok |
| Development | Qoder Quest, Code with Spec, Git worktrees or branches | Suitable for phased, traceable multi-file implementation |
| Persistence | JSON files for MVP; optional SQLite later | Avoids unnecessary database setup for the first working release |

## 1.3 Required local software

You will need to install:

1. Qoder.
2. Git for Windows.
3. Node.js 24 LTS.
4. Godot Engine 4.7.1 Standard for Windows. Do not choose the .NET edition unless you deliberately want C#.
5. OBS Studio **or** TikTok LIVE Studio.
6. TikFinity Desktop when you are ready to test real TikTok events.

Optional tools:

- FFmpeg for recording, converting, and compressing gameplay clips.
- Audacity for editing sound effects.
- Inkscape or Krita for original 2D artwork.
- Blender only if you later move toward 3D.

No global npm package is required. The Qoder prompts will create project-local dependencies and scripts.

# 2. The Game: RiftCrowd LIVE

## 2.1 One-sentence concept

**RiftCrowd LIVE is a fast portrait auto-battler in which TikTok viewers join one of two to four factions, spawn named champions, charge abilities, defend a fortress, and fight for a central Rift Crown through both free engagement and optional gifts.**

## 2.2 The most important design principle

The game must be understandable in two seconds without sound:

- Two or four clearly identified factions.
- A visible central objective.
- Large health or influence meters.
- Viewer names attached to champions.
- One short instruction at the bottom.
- Dramatic, readable reactions when events arrive.

The viewers are not watching someone play. **The viewers collectively are the players.**

## 2.3 Core battlefield

The recommended battlefield is a symmetrical arena with a glowing object called the **Rift Crown** in the center.

Each faction owns:

- A fortress at an edge or corner.
- A faction health meter.
- A faction energy meter.
- Autonomous fighters.
- A captain or hero.
- A capture beam connected to the Rift Crown.

Autonomous units move toward the center, fight opponents, and attempt to hold the Crown. A faction wins by satisfying one of these conditions:

1. Hold the Rift Crown long enough to reach 100% Dominion.
2. Destroy the opposing fortress.
3. Lead in Dominion when the sudden-death timer expires.

## 2.4 Recommended first version

Build a **two-faction MVP** first. Four factions look exciting but multiply navigation, balancing, UI, testing, and event-routing complexity. The architecture should support four factions, but the first live-ready version should show two.

MVP round structure:

| Stage | Duration | Purpose |
|---|---:|---|
| Mode vote | 20 seconds | Audience chooses Countries, Animals, Club-Style Nicknames, or Cities |
| Faction lobby | 35 seconds | Viewers comment a faction keyword to join |
| Opening battle | 120 seconds | Units spawn and fight for the Crown |
| Rift crisis | 60 seconds | Neutral boss or hazard attacks both sides |
| Final surge | 60 seconds | Higher energy generation and stronger visual intensity |
| Sudden death | Up to 45 seconds | No healing; Crown capture accelerates |
| Results | 20 seconds | Winner, top supporters, best free contributor, next-round countdown |

Total target: approximately 5 to 6 minutes per round.

## 2.5 The hook that creates emotional investment

When a viewer joins, the game creates a small champion using the viewer's display name. The viewer sees their identity inside the battle. A champion can level up during the round based on participation, survive multiple encounters, and appear in the result screen.

Examples:

- `@Ramses joined Berlin`.
- `@Maya's Lion reached Level 3`.
- `@Leo defended Brazil's fortress`.
- `@Nina triggered the Crimson Forge ultimate`.

This personal visibility is more important than complicated combat mechanics.

# 3. Why the Concept Is Suitable for TikTok

## 3.1 It creates immediate identity

Countries, animals, cities, and supporter-style factions let viewers choose something quickly. The viewer does not need to learn a complex role-playing system before participating.

## 3.2 It combines rivalry and cooperation

The match contains two emotional loops:

- **Rivalry:** viewers defend their faction and want the opposing faction to lose.
- **Cooperation:** during Rift Crisis, both factions may need to damage a neutral boss to unlock a global reward.

## 3.3 It supports free participation

A viewer must be able to matter without spending money. Comments select factions and tactics, likes charge shared energy, follows create support units, and shares can activate defensive bonuses. Gifts create stronger or more spectacular effects, but they should not be the only way to play.

## 3.4 It produces short highlight moments

The game naturally generates clips:

- A fortress survives with one health point.
- A last-second Crown capture reverses the winner.
- A neutral dragon defeats both factions.
- A viewer's champion lands the final strike.
- A city wins after a sudden wave of likes.

The gateway should log these moments so they can later be found and clipped.

# 4. The Four Game Modes

All four modes use the same combat code. Only data, presentation, sound, units, ability names, arenas, and faction identities change. This **content-pack architecture** is essential: never create four separate games.

## 4.1 Mode A: Countries — Nations of the Rift

### Experience

Countries become original fantasy-tech factions competing for the Crown. Use country names descriptively, but avoid official government seals, coats of arms, military insignia, or any presentation that suggests government endorsement.

### Example launch pack

| Faction | Visual theme | Unit style | Signature ability |
|---|---|---|---|
| Germany | steel, amber energy, geometric engineering | shield engineers | Iron Pulse |
| France | blue light, elegant crystal structures | arc duelists | Lumiere Wave |
| Brazil | green-gold jungle energy | agile guardians | Canopy Surge |
| Nigeria | emerald energy, bronze patterns | thunder sentinels | Emerald Storm |

These are examples only. Use original designs, not national team uniforms.

### Viewer commands

- `germany`, `de`, or a configurable keyword.
- `france`, `fr`.
- `brazil`, `br`.
- `nigeria`, `ng`.

### Safe design rule

Use original geometric banners and text labels. Country flags and emblems can have jurisdiction-specific rules, so keep official symbols optional and reviewed rather than hardcoded into the core game.

## 4.2 Mode B: Animals — Beasts of the Rift

### Experience

This is the easiest mode to own completely and the best long-term merchandising mode.

### Example factions

| Faction | Identity | Passive | Ultimate |
|---|---|---|---|
| Lions | courage and frontline power | stronger near fortress | Solar Roar |
| Wolves | speed and coordinated attacks | pack bonus | Moon Hunt |
| Eagles | range and vision | faster Crown capture | Skyfall |
| Dragons | slow but powerful | resistance to hazards | Rift Flame |

Every animal character must use original artwork, animation, sounds, and names.

## 4.3 Mode C: Club-Style Nicknames — Fan Crews

### Critical legal design decision

The shipping game should **not** include official football club names, logos, jerseys, player names, likenesses, songs, slogans, or famous official nicknames without permission. A nickname can itself function as a valuable brand identifier.

The safe default is a set of entirely original supporter-club-style factions. The UI may call this mode **Fan Crews** or **Club Legends**, but its data is fictional.

### Example original factions

| Faction | Colors | Identity | Ultimate |
|---|---|---|---|
| Crimson Forge | crimson and charcoal | relentless industrial supporters | Forge Breaker |
| Royal Comets | white, violet, and silver | elegant high-speed champions | Crownfall |
| Harbor Kings | navy and copper | defensive coastal crew | Tidal Wall |
| Northern Ravens | black and ice blue | tactical aerial pressure | Raven Eclipse |

Do not create names that are merely misspellings of famous clubs. Do not copy shirt layouts or crests. A future **licensed pack** can be loaded through the same content-pack format after written permission is secured.

## 4.4 Mode D: Cities — Metro Dominion

### Experience

Viewers support a city, home town, current city, dream destination, or diaspora community.

### Example launch pack

| City | Original visual interpretation | Signature ability |
|---|---|---|
| Berlin | neon concrete, transit-like motion without copying transit logos | Pulse Grid |
| Paris | luminous arches and crystal boulevards | City of Light |
| Lagos | coastal energy, vibrant geometric towers | Lagoon Surge |
| London | mist, clockwork-inspired structures without copying protected landmarks as logos | Storm Bell |

City names can generally be used descriptively, but city seals, municipal logos, sports branding, transport logos, and copied skyline artwork require separate review. Build original skyline silhouettes.

## 4.5 Mode selection

Before every round, the game displays the four mode cards. Viewers vote through comments:

- `1` or `countries`
- `2` or `animals`
- `3` or `clubs`
- `4` or `cities`

The vote must be rate-limited to one vote per viewer. Ties use the least recently played mode, not a paid random mechanic.

# 5. Complete Match and Interaction Design

## 5.1 Portrait screen layout

Design at a logical resolution of **1080 x 1920**.

Recommended composition:

| Area | Approximate height | Content |
|---|---:|---|
| Top status | 220 px | mode, round timer, connection indicator, faction scores |
| Battlefield | 1180 px | fortresses, units, Crown, abilities, boss |
| Event spotlight | 220 px | latest important viewer action and gift effect |
| Instruction bar | 300 px | join commands, free actions, next objective |

Keep important text away from TikTok's right-side interaction controls and bottom chat area. Provide configurable safe-zone margins.

## 5.2 Faction joining

A viewer joins by writing the faction keyword. Joining creates or activates a viewer profile for the current session.

Rules:

- One faction per viewer per round.
- A viewer may switch once during the lobby but not after battle begins.
- Duplicate comments do not create duplicate champions.
- Profanity and unsupported glyphs are filtered from display names.
- Long names are shortened visually but preserved internally.
- A viewer avatar image is optional and disabled in the MVP to avoid downloading and storing external profile images.

## 5.3 Autonomous champion behavior

Each champion uses a simple deterministic state machine:

1. Spawn.
2. Move toward nearest objective.
3. Attack a nearby enemy.
4. Retreat briefly at low health.
5. Defend fortress when it is threatened.
6. Rejoin the Crown fight.

Do not begin with advanced machine learning. A readable state machine is easier to debug and more entertaining when animations clearly communicate intent.

## 5.4 Unit types

MVP unit types:

- **Champion:** named after a viewer; balanced all-round unit.
- **Guardian:** spawned by follows or defensive events.
- **Striker:** faster unit created by attack actions.
- **Healer drone:** temporary support unit with strict healing caps.
- **Faction captain:** one larger AI hero per faction.
- **Rift boss:** neutral event unit.

## 5.5 Combat model

Use a simplified combat system:

- Health.
- Attack damage.
- Attack interval.
- Movement speed.
- Target priority.
- Ability cooldown.
- Knockback resistance.

Avoid inventories, dozens of statistics, or complex equipment in version one.

## 5.6 Crown capture

A faction gains Dominion when it has more effective presence inside the capture zone than its opponent. Use a smoothed capture value so it moves visibly rather than jumping.

Suggested calculation:

`capture_pressure = champions + 0.6 * guardians + 1.5 * captain + temporary_bonuses`

The exact constants must be data-driven and tested.

## 5.7 Rift crisis

At the crisis stage, a neutral boss or environmental event appears. Examples:

- Rift Dragon.
- Meteor storm.
- Energy blackout.
- Giant guardian.
- Gravity inversion.

The crisis should temporarily reduce direct faction advantage and create a new objective. A faction may earn a reward based on its contribution, but the boss event should not erase the entire match arbitrarily.

## 5.8 Results screen

Show:

- Winning faction.
- Dominion percentage.
- Fortress health.
- Top contributor from gifts.
- Top contributor from free engagement.
- Most valuable defender.
- Final-strike champion.
- Next mode vote countdown.

Do not show monetary values or imply a financial return.

# 6. Gift, Like, Comment, Follow, and Share Mechanics

## 6.1 Design goals

The interaction economy must satisfy five requirements:

1. Easy to explain.
2. Spectacular on screen.
3. Safe under large bursts.
4. Fair enough that viewers understand what happened.
5. Compliant with rules against gambling-like behavior and pressure-based gifting.

## 6.2 Event categories

### Comments

- Join faction.
- Vote for mode.
- Vote `attack`, `defend`, or `crown` during strategy windows.
- Cheer command that adds a small capped morale contribution.

### Likes

Likes fill a faction's community-energy meter. To prevent one device from overwhelming the system, process likes in aggregated milestones rather than one animation per like.

Example milestones:

- Every 100 accepted likes: small energy pulse.
- Every 1,000 accepted likes: faction-wide movement boost.
- At full energy: audience chooses one of two free abilities.

### Follows

A follow can:

- Spawn one temporary Guardian.
- Add the follower's name to the support wall.
- Restore a small, capped amount of fortress shield.

### Shares

A share can:

- Add a temporary shield point.
- Increase the next free-energy milestone.
- Trigger a visible but moderate flare effect.

### Subscriptions

Subscriptions can create a persistent session badge and a named elite visual skin, but should not create permanent unbeatable power.

### Gifts

Gifts are normalized into **impact points**, then translated into abilities. The game must not rely on gift names remaining constant.

## 6.3 Data-driven gift tiers

Example default mapping:

| Impact tier | Gameplay effect | Visual effect | Limit |
|---|---|---|---|
| Spark | one striker or small energy pulse | name banner and particles | aggregated during bursts |
| Surge | squad spawn or shield wave | camera pulse and faction animation | short cooldown |
| Epic | faction ability | cinematic banner and stronger VFX | one active at a time per faction |
| Mythic | captain ultimate or global event modifier | short full-screen sequence | long cooldown and queue protection |

The provider adapter supplies gift metadata. A creator mapping file assigns each gift to a tier. The game never assumes that a Rose always has the same price, availability, or identifier.

## 6.4 Fairness controls

Recommended rules:

- Diminishing returns for repeated identical events from the same viewer inside a short window.
- Per-faction ability cooldowns.
- Global cinematic cooldown.
- Maximum active summoned units.
- Excess spawn value converts into score or reserve energy.
- A large gift creates a guaranteed visible reaction, but not a guaranteed match victory.
- Free engagement remains meaningful through energy, strategy votes, and named champions.

## 6.5 Gift streak handling

Some providers report gift streaks through repeated events or a final repeat count. The gateway must avoid double counting.

Use a streak aggregator with:

- Provider event identifier.
- Gift identifier.
- Viewer identifier.
- Repeat count.
- Streak end flag when available.
- Timeout fallback.

Only emit the final normalized impact difference.

## 6.6 No gambling-like mechanics

Do not implement:

- Gifts as lottery tickets.
- Random cash, product, or monetary prizes.
- A promise that a gift will return value.
- Winner-takes-money pools.
- Hidden odds.
- Fake countdowns or claims that pressure viewers to spend.

Abilities can contain game randomness, but the viewer should receive the visible effect described by the mapping.

# 7. Fairness, Safety, Overload Control, and Anti-Abuse

## 7.1 Event pipeline

Every incoming event passes through this sequence:

1. Provider adapter receives raw event.
2. Schema validation.
3. User and text sanitization.
4. Duplicate detection.
5. Gift-streak aggregation.
6. Rate and burst limiting.
7. Faction resolution.
8. Rules engine creates one or more game commands.
9. Command queue merges compatible commands.
10. Godot game consumes commands at a safe rate.
11. Result is acknowledged and logged.

## 7.2 Burst strategy

A burst of 500 small gift events must not spawn 500 animated objects simultaneously.

Example conversion:

- First 20 impact points: spawn visible units.
- Next 80: add reserve energy.
- Remaining points: create a faction score surge and one combined visual celebration.

The supporter still receives credit for the full normalized contribution.

## 7.3 Moderation and text safety

- Sanitize names before rendering.
- Remove control characters.
- Escape markup.
- Limit display length.
- Maintain a configurable blocked-word list.
- Allow creator to hide a viewer from on-screen display.
- Never execute text from comments as code, commands, paths, or URLs.

## 7.4 Local network security

- Bind gateway services to `127.0.0.1` by default.
- Require a locally generated session token between dashboard, gateway, and game.
- Keep `.env` out of Git.
- Never log TikTok account cookies or API keys.
- Do not expose debug ports to the public internet.
- Validate all WebSocket messages with Zod before processing.

## 7.5 Emergency controls

The creator dashboard needs large controls for:

- Pause battle.
- Disable incoming events.
- Disable gifts only.
- Clear queue.
- End round safely.
- Restart connector.
- Switch to mock mode.
- Hide a username.
- Trigger a neutral fallback scene.

The game should continue autonomously if the dashboard is closed.

# 8. Copyright, Trademark, Country, City, and Club-Name Rules

## 8.1 What you own when you build it properly

Your original code, artwork, animations, characters, story, sound design, UI, faction names, logos, and game title can become intellectual property owned by you or your company, subject to contributor and asset licenses.

## 8.2 Club-style mode

Treat all official club identifiers as restricted until proven otherwise:

- Club name.
- Official nickname.
- Logo or crest.
- Jersey pattern.
- Sponsor placement.
- Mascot.
- Stadium branding.
- Player name, face, body, signature celebration, voice, or likeness.
- Anthem or supporter song.

The default content pack must contain original factions. Store licensed and fictional packs separately so you cannot accidentally ship protected content.

Recommended directories:

- `content/packs/fan_crews_original/`
- `content/packs/licensed/` excluded from public builds unless approved.

## 8.3 Countries

Country names can be used as factual identifiers, but official flags, emblems, seals, military marks, and national-team designs may be controlled by special rules. The safest base pack uses:

- Text country names.
- Original geometric patterns.
- Original color palettes.
- No government seals or national-team uniforms.
- No suggestion of official endorsement.

## 8.4 Cities

City names can be used descriptively, but avoid copying:

- Municipal seals.
- Tourism logos.
- Transit logos and maps.
- Sports-team identities.
- Photographs or skyline illustrations without an appropriate license.

Create original skyline silhouettes from basic geometry.

## 8.5 Animals

Animal concepts are generally the cleanest ownership option. Still ensure the specific illustrations, sounds, models, and animation files are original or properly licensed.

## 8.6 Game title search

`RiftCrowd LIVE` is a working title, not a legal clearance. Before public branding:

1. Search web, app stores, game stores, social platforms, domain names, EUIPO, and WIPO databases.
2. Check confusingly similar names, not only exact matches.
3. Obtain professional trademark advice before a major launch.
4. Keep evidence of licenses and contributor assignments.

## 8.7 Platform conduct

TikTok's current LIVE guidance prohibits gambling or gambling-like activities and warns against tricking or pressuring viewers to give Gifts. Design every call-to-action as optional participation, display free methods prominently, and avoid claims that viewers must spend to prevent punishment or receive a real-world reward.

# 9. Technical Architecture

## 9.1 High-level flow

```text
TikTok LIVE
    |
    | gifts, likes, comments, follows, shares
    v
Provider Adapter
(Mock / TikFinity / future official provider)
    |
    v
Event Normalizer and Validator
    |
    v
Rules, Dedupe, Streak Aggregation, Rate Limits
    |
    v
Safe Game Command Queue
    |
    +---------------------> Creator Dashboard
    |
    v
Local WebSocket Server (127.0.0.1)
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

## 9.2 Components

### Godot game

Responsible for:

- Rendering.
- Autonomous simulation.
- Match state.
- Units and abilities.
- Visual and audio feedback.
- Result display.
- Safe reconnection to gateway.

The game must not contain TikTok-specific parsing logic.

### Node event gateway

Responsible for:

- Provider connections.
- Event normalization.
- Validation and sanitization.
- Team assignment.
- Gift mapping.
- Rate limiting.
- Command generation.
- Session logs.
- Dashboard API.
- Test-event generation.

### Dashboard

Responsible for:

- Start and stop.
- Provider selection.
- Username and connection settings.
- Gift mapping.
- Mode and faction settings.
- Test buttons.
- Health indicators.
- Emergency actions.

### Content packs

Responsible for:

- Mode names.
- Factions.
- Colors and patterns.
- Unit scene references.
- Ability labels.
- Arena settings.
- Audio references.
- Join keywords.

## 9.3 Adapter interface

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

Providers:

- `MockLiveAdapter`: always available; replays fixture files and generates events.
- `TikFinityAdapter`: connects to the local TikFinity endpoint configured by the creator.
- `UnofficialTikTokAdapter`: optional experimental module, disabled by default and clearly labeled unsupported.
- `OfficialTikTokAdapter`: reserved for a future approved API.

## 9.4 Reliability rules

- Gateway and game reconnect automatically with exponential backoff.
- Commands have unique IDs.
- Game acknowledges commands.
- Gateway keeps a short in-memory retry buffer.
- Commands are idempotent where possible.
- The simulation remains playable when disconnected.
- Provider loss displays a small status icon, not a full game crash.

# 10. Repository and Data Design

## 10.1 Recommended repository

```text
riftcrowd-live/
├─ AGENTS.md
├─ README.md
├─ PROJECT_STATUS.md
├─ package.json
├─ .gitignore
├─ .env.example
├─ .qoder/
│  └─ rules/
│     ├─ architecture.md
│     ├─ security.md
│     ├─ testing.md
│     └─ phase-discipline.md
├─ docs/
│  ├─ PRODUCT_SPEC.md
│  ├─ ARCHITECTURE.md
│  ├─ EVENT_PROTOCOL.md
│  ├─ CONTENT_PACK_FORMAT.md
│  ├─ STREAMING_RUNBOOK.md
│  └─ IP_AND_PLATFORM_CHECKLIST.md
├─ shared/
│  ├─ schemas/
│  └─ fixtures/
├─ gateway/
│  ├─ src/
│  │  ├─ adapters/
│  │  ├─ domain/
│  │  ├─ rules/
│  │  ├─ queue/
│  │  ├─ transport/
│  │  ├─ storage/
│  │  └─ app.ts
│  ├─ test/
│  └─ package.json
├─ dashboard/
│  ├─ src/
│  ├─ public/
│  └─ package.json
├─ game/
│  ├─ project.godot
│  ├─ scenes/
│  ├─ scripts/
│  ├─ resources/
│  ├─ content/
│  ├─ assets/
│  └─ tests/
├─ content/
│  ├─ packs/
│  │  ├─ countries/
│  │  ├─ animals/
│  │  ├─ fan_crews_original/
│  │  └─ cities/
│  └─ gift-mappings/
└─ tools/
   ├─ event-replay/
   └─ asset-validation/
```

## 10.2 Normalized event model

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

## 10.3 Game command model

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

## 10.4 Content-pack example

```json
{
  "schemaVersion": 1,
  "id": "animals_launch",
  "displayName": "Beasts of the Rift",
  "mode": "animals",
  "factions": [
    {
      "id": "lions",
      "displayName": "Lions",
      "joinKeywords": ["lion", "lions", "1"],
      "primaryColor": "#D49A27",
      "secondaryColor": "#3A2210",
      "pattern": "sunburst",
      "captainScene": "res://scenes/units/captain_lion.tscn",
      "ultimateId": "solar_roar"
    }
  ]
}
```

## 10.5 Configuration files

Use editable configuration instead of hardcoded values:

- `gateway/config/gameplay.json`
- `gateway/config/rate-limits.json`
- `content/gift-mappings/default.json`
- `game/content/packs/*.json`
- `.env` for local ports and provider credentials.

Example `.env.example`:

```dotenv
APP_ENV=development
HOST=127.0.0.1
GATEWAY_PORT=8787
GAME_WS_PORT=8788
DASHBOARD_PORT=5173
LOCAL_SESSION_TOKEN=change-me
LIVE_PROVIDER=mock
TIKTOK_USERNAME=
TIKFINITY_WS_URL=
LOG_LEVEL=info
```

# 11. Windows Software and Package Installation

## 11.1 Qoder

Download and install Qoder from its official site. Sign in, then create or open the project folder. Qoder supports Agent and Quest workflows; for this project use **Quest -> Code with Spec** for each major phase.

Verification: open Qoder and confirm its integrated terminal can run PowerShell.

## 11.2 Git for Windows

Install Git for Windows from the official Git website. During setup, keep the default option that allows Git from the command line.

Verify in PowerShell:

```powershell
git --version
```

Configure identity:

```powershell
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

## 11.3 Node.js

Install Node.js **24 LTS**, not the short-lived Current release, for the gateway and dashboard.

Verify:

```powershell
node --version
npm --version
```

Expected major version: `v24`.

## 11.4 Godot

Download the standard Windows x86_64 build of Godot 4.7.1. It is portable:

1. Extract it to a stable directory such as `C:\Tools\Godot`.
2. Run the executable.
3. Install matching export templates from the Godot editor when prompted before creating a Windows release build.
4. Do not use the .NET edition for this guide.

## 11.5 OBS Studio or TikTok LIVE Studio

Install OBS Studio if you want flexible scenes and recording. TikTok LIVE Studio can also capture the game directly when available for your account. OBS supports Windows 10 and 11.

For early development, OBS is optional. The game and gateway can be tested without streaming.

## 11.6 TikFinity Desktop

Install TikFinity only when the mock integration is stable. The TikFinity desktop application must run on the same computer for its local LIVE API. Configure its WebSocket URL in `.env`; do not hardcode an endpoint because the application can expose or change connection details.

## 11.7 Optional FFmpeg

Install FFmpeg only for video conversion, automated highlight extraction, or media processing. It is not required to run the game.

Verify:

```powershell
ffmpeg -version
ffprobe -version
```

## 11.8 Project creation

Use a path without spaces to reduce tooling problems:

```powershell
mkdir C:\Deviftcrowd-live
cd C:\Deviftcrowd-live
git init
```

Open this exact folder in Qoder.

## 11.9 Packages Qoder should install locally

Gateway production dependencies:

```text
fastify
@fastify/cors
@fastify/static
ws
zod
pino
pino-pretty
dotenv
nanoid
```

Gateway development dependencies:

```text
typescript
tsx
vitest
eslint
@eslint/js
prettier
@types/node
@types/ws
```

Dashboard dependencies:

```text
react
react-dom
vite
typescript
zod
```

Do not install these globally. Qoder should create package files and use `npm install` inside the repository.

# 12. How to Work with Qoder Correctly

## 12.1 Do not paste every phase at once

Use one phase prompt at a time. After Qoder completes a phase:

1. Read its delivery summary.
2. Inspect changed files.
3. Run all commands and tests yourself.
4. Launch the game or service.
5. Fix failures before moving on.
6. Update `PROJECT_STATUS.md`.
7. Commit the phase.

## 12.2 Recommended Qoder mode

For each phase:

1. Open Quest.
2. Choose **Code with Spec**.
3. Prefer a Git Worktree for large phases or a dedicated branch for simpler phases.
4. Paste the phase prompt.
5. Review the generated specification and acceptance criteria.
6. Correct the spec before selecting Run.
7. Apply changes only after tests pass.

## 12.3 Qoder project rules

Create these rules in `.qoder/rules/` and commit them.

### `architecture.md`

```markdown
Always preserve the adapter architecture. The Godot game must never parse TikTok-specific payloads. Provider integrations belong in gateway/src/adapters. Shared messages are validated, versioned, and documented. Prefer data-driven content packs over hardcoded faction logic.
```

### `security.md`

```markdown
Bind local services to 127.0.0.1 by default. Validate all external data with Zod. Sanitize viewer names and comments before displaying them. Never log credentials, session cookies, API keys, or raw secrets. Keep .env ignored. Do not execute user-provided text.
```

### `testing.md`

```markdown
Every feature requires tests or a deterministic manual test harness. Provider work must include fixtures. Event processing must be testable without TikTok or internet access. Do not claim completion until lint, typecheck, tests, and the relevant smoke test pass.
```

### `phase-discipline.md`

```markdown
Work only on the requested phase. Inspect the repository and existing documentation first. Do not rewrite unrelated working code. Avoid placeholder implementations that always return success. Update documentation and PROJECT_STATUS.md. End with exact commands to verify the phase.
```

## 12.4 Recommended `AGENTS.md`

```markdown
# RiftCrowd LIVE Agent Rules

- Read PRODUCT_SPEC.md, ARCHITECTURE.md, EVENT_PROTOCOL.md, and PROJECT_STATUS.md before modifying code.
- Preserve separation between provider adapters, normalized events, rules, game commands, and Godot simulation.
- Use TypeScript strict mode and GDScript static typing where practical.
- Treat every provider payload as untrusted.
- Bind all development servers to localhost unless a task explicitly changes it.
- Never commit secrets, generated builds, logs, or downloaded profile images.
- Prefer deterministic behavior and configuration files.
- Keep the game playable in mock mode with no TikTok connection.
- Include tests, error handling, reconnect behavior, and useful logs.
- Complete only the current phase and report remaining risks honestly.
```

## 12.5 Git rhythm

Suggested commits:

```text
chore: bootstrap repository and documentation
feat(game): add portrait arena foundation
feat(gateway): add normalized event pipeline
feat(integration): connect mock events to Godot
feat(content): add four launch content packs
feat(stream): add creator dashboard and runbook
```

# 13. Master Qoder Bootstrap Prompt

Use this once in a new empty Git repository. It creates the planning structure and project skeleton, not the entire finished game.

```text
You are the lead architect for a production-minded Windows desktop project called RiftCrowd LIVE.

PRODUCT GOAL
Create a portrait 1080x1920 autonomous TikTok LIVE audience game. Viewers join factions through comments and influence an automatic arena battle through likes, follows, shares, subscriptions, and gifts. The same core game supports four content-pack modes:
1. Countries, using descriptive country names and original visuals without government emblems or sports uniforms.
2. Animals, using completely original characters and artwork.
3. Club-style supporter nicknames, using fictional original factions only; no official club names, nicknames, logos, jerseys, songs, players, or likenesses.
4. Cities, using city names and original skyline art without municipal, transport, tourism, or sports logos.

TECHNOLOGY
- Godot 4.7.1 Standard and GDScript for the game.
- Node.js 24 LTS and strict TypeScript for a local event gateway.
- React and Vite for a local creator dashboard.
- WebSocket between gateway and Godot.
- Provider adapter interface with MockLiveAdapter first and TikFinityAdapter later.
- JSON persistence for MVP; no cloud database.
- OBS Studio or TikTok LIVE Studio captures the game window.

NON-NEGOTIABLE ARCHITECTURE
- The game never parses TikTok-specific raw payloads.
- All provider data is normalized and validated before rules execute.
- All services bind to 127.0.0.1 by default.
- The application remains fully testable in mock mode without TikTok, TikFinity, or internet access.
- Gift names, IDs, and values are data-driven, never hardcoded as permanent platform facts.
- Handle duplicates, gift streaks, burst aggregation, cooldowns, queue limits, reconnects, and malformed data.
- Free engagement must matter. Do not implement gambling, lotteries, cash prizes, hidden odds, or pressure-based gifting.
- Use original placeholder SVGs and Godot primitives; do not download copyrighted art.

TASK
1. Inspect the repository.
2. Create a structured technical specification before implementation.
3. Create the repository skeleton described below without implementing advanced gameplay yet:
   AGENTS.md, README.md, PROJECT_STATUS.md, .gitignore, .env.example, .qoder/rules, docs, shared, gateway, dashboard, game, content, and tools.
4. Initialize the root npm workspace for gateway and dashboard.
5. Initialize a strict TypeScript gateway with lint, typecheck, test, dev, and build scripts.
6. Initialize a minimal Vite React dashboard.
7. Create a Godot project configured for a 1080x1920 portrait viewport with stretch settings, but only a simple boot screen.
8. Define versioned schemas for NormalizedLiveEvent and GameCommand in documentation and TypeScript.
9. Add fixture examples and a small schema test.
10. Add Qoder rules for architecture, security, testing, and phase discipline.
11. Add exact Windows PowerShell commands to install dependencies and run each component.
12. Do not add a real TikTok integration in this phase.

QUALITY GATES
- npm install succeeds.
- npm run lint succeeds.
- npm run typecheck succeeds.
- npm test succeeds.
- gateway starts locally and exposes /health.
- dashboard starts locally and displays gateway status placeholder.
- Godot project opens without missing resources.
- No secrets are committed.
- Documentation explains architecture and next phase.

At the end, provide: changed files, commands run, results, remaining risks, and exact manual verification steps.
```
# 14. Development Phases and Phase Prompts


Use the Master Prompt once, then use the following prompts in order. Each prompt assumes all previous accepted phases are committed. Replace bracketed placeholders only when necessary. Never tell Qoder to implement several phases together.

## Phase 0: Product Lock, Legal Boundaries, and Acceptance Tests

**Objective:** Freeze the MVP so Qoder does not continuously redesign it.

**Required work:**

- Confirm two-faction MVP and four-faction-compatible data structures.
- Write PRODUCT_SPEC.md with round timing, interaction rules, exclusions, and launch content.
- Write IP_AND_PLATFORM_CHECKLIST.md.
- Define measurable acceptance criteria and a non-goals section.
- Choose a neutral internal working title and mark it as not trademark-cleared.

**Deliverable:** Approved specifications only; no gameplay code.

**Acceptance gate:** The product spec is unambiguous enough that two developers would build the same MVP.

**Copy-ready Qoder prompt:**

```text
You are implementing Phase 0 of RiftCrowd LIVE: Product Lock, Legal Boundaries, and Acceptance Tests.

READ FIRST
- AGENTS.md
- docs/PRODUCT_SPEC.md
- docs/ARCHITECTURE.md
- docs/EVENT_PROTOCOL.md
- PROJECT_STATUS.md
- all code and tests relevant to this phase

PHASE OBJECTIVE
Freeze the MVP so Qoder does not continuously redesign it.

REQUIRED WORK
- Confirm two-faction MVP and four-faction-compatible data structures.
- Write PRODUCT_SPEC.md with round timing, interaction rules, exclusions, and launch content.
- Write IP_AND_PLATFORM_CHECKLIST.md.
- Define measurable acceptance criteria and a non-goals section.
- Choose a neutral internal working title and mark it as not trademark-cleared.

DELIVERABLE
Approved specifications only; no gameplay code.

NON-NEGOTIABLE RULES
- Work only on this phase and preserve working behavior from previous phases.
- Keep provider-specific raw data outside the Godot game.
- Keep all network listeners bound to 127.0.0.1 by default.
- Treat all viewer and provider data as untrusted, validate it, and sanitize display text.
- Keep the complete experience testable in MockLiveAdapter mode with no internet.
- Do not use official club brands, nicknames, crests, jerseys, player identities, copyrighted music, or copied artwork.
- Do not implement gambling, prizes of monetary value, hidden odds, or pressure-based gifting.
- Prefer configuration, schemas, tests, pooling, and bounded queues over hardcoded behavior.
- Do not create fake stubs that always report success.

PROCESS
1. Inspect the current implementation and identify conflicts or missing prerequisites.
2. Produce or update the Qoder Spec with a task breakdown, file plan, risks, and acceptance tests.
3. Implement the smallest coherent solution that completely satisfies this phase.
4. Add or update automated tests and deterministic fixtures.
5. Run lint, typecheck, tests, builds, and the relevant smoke test.
6. Update documentation and PROJECT_STATUS.md with completed work, commands, results, known limitations, and the exact next phase.
7. Do not proceed to a later phase.

ACCEPTANCE GATE
The product spec is unambiguous enough that two developers would build the same MVP.

FINAL RESPONSE
Report changed files, architectural decisions, commands run, test results, manual verification steps, remaining risks, and any item that could not be completed. Do not claim success without evidence.
```

## Phase 1: Repository Bootstrap and Development Tooling

**Objective:** Create a reproducible monorepo and basic local applications.

**Required work:**

- Create root workspace, gateway, dashboard, Godot project, docs, and shared fixtures.
- Configure strict TypeScript, ESLint, Prettier, Vitest, and scripts.
- Configure .gitignore and .env.example.
- Add local health checks and a boot screen.
- Add Qoder rules and AGENTS.md.

**Deliverable:** A clean repository that installs and starts.

**Acceptance gate:** All baseline commands pass on Windows and the Godot project opens.

**Copy-ready Qoder prompt:**

```text
You are implementing Phase 1 of RiftCrowd LIVE: Repository Bootstrap and Development Tooling.

READ FIRST
- AGENTS.md
- docs/PRODUCT_SPEC.md
- docs/ARCHITECTURE.md
- docs/EVENT_PROTOCOL.md
- PROJECT_STATUS.md
- all code and tests relevant to this phase

PHASE OBJECTIVE
Create a reproducible monorepo and basic local applications.

REQUIRED WORK
- Create root workspace, gateway, dashboard, Godot project, docs, and shared fixtures.
- Configure strict TypeScript, ESLint, Prettier, Vitest, and scripts.
- Configure .gitignore and .env.example.
- Add local health checks and a boot screen.
- Add Qoder rules and AGENTS.md.

DELIVERABLE
A clean repository that installs and starts.

NON-NEGOTIABLE RULES
- Work only on this phase and preserve working behavior from previous phases.
- Keep provider-specific raw data outside the Godot game.
- Keep all network listeners bound to 127.0.0.1 by default.
- Treat all viewer and provider data as untrusted, validate it, and sanitize display text.
- Keep the complete experience testable in MockLiveAdapter mode with no internet.
- Do not use official club brands, nicknames, crests, jerseys, player identities, copyrighted music, or copied artwork.
- Do not implement gambling, prizes of monetary value, hidden odds, or pressure-based gifting.
- Prefer configuration, schemas, tests, pooling, and bounded queues over hardcoded behavior.
- Do not create fake stubs that always report success.

PROCESS
1. Inspect the current implementation and identify conflicts or missing prerequisites.
2. Produce or update the Qoder Spec with a task breakdown, file plan, risks, and acceptance tests.
3. Implement the smallest coherent solution that completely satisfies this phase.
4. Add or update automated tests and deterministic fixtures.
5. Run lint, typecheck, tests, builds, and the relevant smoke test.
6. Update documentation and PROJECT_STATUS.md with completed work, commands, results, known limitations, and the exact next phase.
7. Do not proceed to a later phase.

ACCEPTANCE GATE
All baseline commands pass on Windows and the Godot project opens.

FINAL RESPONSE
Report changed files, architectural decisions, commands run, test results, manual verification steps, remaining risks, and any item that could not be completed. Do not claim success without evidence.
```

## Phase 2: Shared Protocol and Schema Validation

**Objective:** Create the contract that allows the gateway and game to evolve independently.

**Required work:**

- Implement NormalizedLiveEvent and GameCommand schemas with version fields.
- Add JSON fixtures for valid and invalid events.
- Add deterministic IDs and raw-payload hashes.
- Document acknowledgment, error, snapshot, and heartbeat messages.
- Generate or mirror matching typed GDScript DTO parsing helpers.

**Deliverable:** Versioned event protocol with tests.

**Acceptance gate:** Malformed messages are rejected and fixtures parse consistently in TypeScript and Godot.

**Copy-ready Qoder prompt:**

```text
You are implementing Phase 2 of RiftCrowd LIVE: Shared Protocol and Schema Validation.

READ FIRST
- AGENTS.md
- docs/PRODUCT_SPEC.md
- docs/ARCHITECTURE.md
- docs/EVENT_PROTOCOL.md
- PROJECT_STATUS.md
- all code and tests relevant to this phase

PHASE OBJECTIVE
Create the contract that allows the gateway and game to evolve independently.

REQUIRED WORK
- Implement NormalizedLiveEvent and GameCommand schemas with version fields.
- Add JSON fixtures for valid and invalid events.
- Add deterministic IDs and raw-payload hashes.
- Document acknowledgment, error, snapshot, and heartbeat messages.
- Generate or mirror matching typed GDScript DTO parsing helpers.

DELIVERABLE
Versioned event protocol with tests.

NON-NEGOTIABLE RULES
- Work only on this phase and preserve working behavior from previous phases.
- Keep provider-specific raw data outside the Godot game.
- Keep all network listeners bound to 127.0.0.1 by default.
- Treat all viewer and provider data as untrusted, validate it, and sanitize display text.
- Keep the complete experience testable in MockLiveAdapter mode with no internet.
- Do not use official club brands, nicknames, crests, jerseys, player identities, copyrighted music, or copied artwork.
- Do not implement gambling, prizes of monetary value, hidden odds, or pressure-based gifting.
- Prefer configuration, schemas, tests, pooling, and bounded queues over hardcoded behavior.
- Do not create fake stubs that always report success.

PROCESS
1. Inspect the current implementation and identify conflicts or missing prerequisites.
2. Produce or update the Qoder Spec with a task breakdown, file plan, risks, and acceptance tests.
3. Implement the smallest coherent solution that completely satisfies this phase.
4. Add or update automated tests and deterministic fixtures.
5. Run lint, typecheck, tests, builds, and the relevant smoke test.
6. Update documentation and PROJECT_STATUS.md with completed work, commands, results, known limitations, and the exact next phase.
7. Do not proceed to a later phase.

ACCEPTANCE GATE
Malformed messages are rejected and fixtures parse consistently in TypeScript and Godot.

FINAL RESPONSE
Report changed files, architectural decisions, commands run, test results, manual verification steps, remaining risks, and any item that could not be completed. Do not claim success without evidence.
```

## Phase 3: Godot Portrait Foundation

**Objective:** Build the reliable 9:16 application shell.

**Required work:**

- Configure 1080x1920 viewport and safe zones.
- Create Boot, MainMenu, Lobby, Battle, Results, and ErrorOverlay scenes.
- Add an application state machine.
- Add responsive layout behavior and readable typography.
- Add a debug panel and FPS display available only in development.

**Deliverable:** Navigable portrait application shell.

**Acceptance gate:** The app scales correctly in windowed portrait sizes without clipped controls.

**Copy-ready Qoder prompt:**

```text
You are implementing Phase 3 of RiftCrowd LIVE: Godot Portrait Foundation.

READ FIRST
- AGENTS.md
- docs/PRODUCT_SPEC.md
- docs/ARCHITECTURE.md
- docs/EVENT_PROTOCOL.md
- PROJECT_STATUS.md
- all code and tests relevant to this phase

PHASE OBJECTIVE
Build the reliable 9:16 application shell.

REQUIRED WORK
- Configure 1080x1920 viewport and safe zones.
- Create Boot, MainMenu, Lobby, Battle, Results, and ErrorOverlay scenes.
- Add an application state machine.
- Add responsive layout behavior and readable typography.
- Add a debug panel and FPS display available only in development.

DELIVERABLE
Navigable portrait application shell.

NON-NEGOTIABLE RULES
- Work only on this phase and preserve working behavior from previous phases.
- Keep provider-specific raw data outside the Godot game.
- Keep all network listeners bound to 127.0.0.1 by default.
- Treat all viewer and provider data as untrusted, validate it, and sanitize display text.
- Keep the complete experience testable in MockLiveAdapter mode with no internet.
- Do not use official club brands, nicknames, crests, jerseys, player identities, copyrighted music, or copied artwork.
- Do not implement gambling, prizes of monetary value, hidden odds, or pressure-based gifting.
- Prefer configuration, schemas, tests, pooling, and bounded queues over hardcoded behavior.
- Do not create fake stubs that always report success.

PROCESS
1. Inspect the current implementation and identify conflicts or missing prerequisites.
2. Produce or update the Qoder Spec with a task breakdown, file plan, risks, and acceptance tests.
3. Implement the smallest coherent solution that completely satisfies this phase.
4. Add or update automated tests and deterministic fixtures.
5. Run lint, typecheck, tests, builds, and the relevant smoke test.
6. Update documentation and PROJECT_STATUS.md with completed work, commands, results, known limitations, and the exact next phase.
7. Do not proceed to a later phase.

ACCEPTANCE GATE
The app scales correctly in windowed portrait sizes without clipped controls.

FINAL RESPONSE
Report changed files, architectural decisions, commands run, test results, manual verification steps, remaining risks, and any item that could not be completed. Do not claim success without evidence.
```

## Phase 4: Content-Pack System and Four Launch Packs

**Objective:** Make countries, animals, fan crews, and cities data-driven.

**Required work:**

- Define content-pack schema and validation.
- Create launch packs for all four modes with at least four factions each.
- Use original SVG placeholders, patterns, and icons.
- Create join keyword handling and collision detection.
- Add a content-pack preview scene and validation tool.

**Deliverable:** Four selectable validated content packs.

**Acceptance gate:** A new faction can be added through data and assets without changing combat code.

**Copy-ready Qoder prompt:**

```text
You are implementing Phase 4 of RiftCrowd LIVE: Content-Pack System and Four Launch Packs.

READ FIRST
- AGENTS.md
- docs/PRODUCT_SPEC.md
- docs/ARCHITECTURE.md
- docs/EVENT_PROTOCOL.md
- PROJECT_STATUS.md
- all code and tests relevant to this phase

PHASE OBJECTIVE
Make countries, animals, fan crews, and cities data-driven.

REQUIRED WORK
- Define content-pack schema and validation.
- Create launch packs for all four modes with at least four factions each.
- Use original SVG placeholders, patterns, and icons.
- Create join keyword handling and collision detection.
- Add a content-pack preview scene and validation tool.

DELIVERABLE
Four selectable validated content packs.

NON-NEGOTIABLE RULES
- Work only on this phase and preserve working behavior from previous phases.
- Keep provider-specific raw data outside the Godot game.
- Keep all network listeners bound to 127.0.0.1 by default.
- Treat all viewer and provider data as untrusted, validate it, and sanitize display text.
- Keep the complete experience testable in MockLiveAdapter mode with no internet.
- Do not use official club brands, nicknames, crests, jerseys, player identities, copyrighted music, or copied artwork.
- Do not implement gambling, prizes of monetary value, hidden odds, or pressure-based gifting.
- Prefer configuration, schemas, tests, pooling, and bounded queues over hardcoded behavior.
- Do not create fake stubs that always report success.

PROCESS
1. Inspect the current implementation and identify conflicts or missing prerequisites.
2. Produce or update the Qoder Spec with a task breakdown, file plan, risks, and acceptance tests.
3. Implement the smallest coherent solution that completely satisfies this phase.
4. Add or update automated tests and deterministic fixtures.
5. Run lint, typecheck, tests, builds, and the relevant smoke test.
6. Update documentation and PROJECT_STATUS.md with completed work, commands, results, known limitations, and the exact next phase.
7. Do not proceed to a later phase.

ACCEPTANCE GATE
A new faction can be added through data and assets without changing combat code.

FINAL RESPONSE
Report changed files, architectural decisions, commands run, test results, manual verification steps, remaining risks, and any item that could not be completed. Do not claim success without evidence.
```

## Phase 5: Autonomous Arena Simulation

**Objective:** Implement the core game without any LIVE events.

**Required work:**

- Create fortress, Rift Crown, capture zone, champion, guardian, striker, captain, projectile, and boss scenes.
- Implement typed state machines for units.
- Implement targeting, damage, death, pooling, capture pressure, Dominion, fortress health, and victory rules.
- Use deterministic seeded randomness for tests and replays.
- Add a simulation sandbox with speed controls.

**Deliverable:** A complete automatic battle using local bots.

**Acceptance gate:** A full round can start, progress, end, and restart repeatedly without memory growth or manual intervention.

**Copy-ready Qoder prompt:**

```text
You are implementing Phase 5 of RiftCrowd LIVE: Autonomous Arena Simulation.

READ FIRST
- AGENTS.md
- docs/PRODUCT_SPEC.md
- docs/ARCHITECTURE.md
- docs/EVENT_PROTOCOL.md
- PROJECT_STATUS.md
- all code and tests relevant to this phase

PHASE OBJECTIVE
Implement the core game without any LIVE events.

REQUIRED WORK
- Create fortress, Rift Crown, capture zone, champion, guardian, striker, captain, projectile, and boss scenes.
- Implement typed state machines for units.
- Implement targeting, damage, death, pooling, capture pressure, Dominion, fortress health, and victory rules.
- Use deterministic seeded randomness for tests and replays.
- Add a simulation sandbox with speed controls.

DELIVERABLE
A complete automatic battle using local bots.

NON-NEGOTIABLE RULES
- Work only on this phase and preserve working behavior from previous phases.
- Keep provider-specific raw data outside the Godot game.
- Keep all network listeners bound to 127.0.0.1 by default.
- Treat all viewer and provider data as untrusted, validate it, and sanitize display text.
- Keep the complete experience testable in MockLiveAdapter mode with no internet.
- Do not use official club brands, nicknames, crests, jerseys, player identities, copyrighted music, or copied artwork.
- Do not implement gambling, prizes of monetary value, hidden odds, or pressure-based gifting.
- Prefer configuration, schemas, tests, pooling, and bounded queues over hardcoded behavior.
- Do not create fake stubs that always report success.

PROCESS
1. Inspect the current implementation and identify conflicts or missing prerequisites.
2. Produce or update the Qoder Spec with a task breakdown, file plan, risks, and acceptance tests.
3. Implement the smallest coherent solution that completely satisfies this phase.
4. Add or update automated tests and deterministic fixtures.
5. Run lint, typecheck, tests, builds, and the relevant smoke test.
6. Update documentation and PROJECT_STATUS.md with completed work, commands, results, known limitations, and the exact next phase.
7. Do not proceed to a later phase.

ACCEPTANCE GATE
A full round can start, progress, end, and restart repeatedly without memory growth or manual intervention.

FINAL RESPONSE
Report changed files, architectural decisions, commands run, test results, manual verification steps, remaining risks, and any item that could not be completed. Do not claim success without evidence.
```

## Phase 6: Match Director and Round Lifecycle

**Objective:** Turn the simulation into a repeatable TikTok show.

**Required work:**

- Implement mode vote, faction lobby, battle, crisis, final surge, sudden death, and results.
- Add timers, announcements, transitions, and fallback behavior.
- Implement tie breaking and least-recently-played mode selection.
- Persist session statistics locally.
- Add creator-controlled skip, pause, end, and restart commands.

**Deliverable:** Autonomous multi-round show loop.

**Acceptance gate:** Ten consecutive mock rounds complete without state leakage or a manual reset.

**Copy-ready Qoder prompt:**

```text
You are implementing Phase 6 of RiftCrowd LIVE: Match Director and Round Lifecycle.

READ FIRST
- AGENTS.md
- docs/PRODUCT_SPEC.md
- docs/ARCHITECTURE.md
- docs/EVENT_PROTOCOL.md
- PROJECT_STATUS.md
- all code and tests relevant to this phase

PHASE OBJECTIVE
Turn the simulation into a repeatable TikTok show.

REQUIRED WORK
- Implement mode vote, faction lobby, battle, crisis, final surge, sudden death, and results.
- Add timers, announcements, transitions, and fallback behavior.
- Implement tie breaking and least-recently-played mode selection.
- Persist session statistics locally.
- Add creator-controlled skip, pause, end, and restart commands.

DELIVERABLE
Autonomous multi-round show loop.

NON-NEGOTIABLE RULES
- Work only on this phase and preserve working behavior from previous phases.
- Keep provider-specific raw data outside the Godot game.
- Keep all network listeners bound to 127.0.0.1 by default.
- Treat all viewer and provider data as untrusted, validate it, and sanitize display text.
- Keep the complete experience testable in MockLiveAdapter mode with no internet.
- Do not use official club brands, nicknames, crests, jerseys, player identities, copyrighted music, or copied artwork.
- Do not implement gambling, prizes of monetary value, hidden odds, or pressure-based gifting.
- Prefer configuration, schemas, tests, pooling, and bounded queues over hardcoded behavior.
- Do not create fake stubs that always report success.

PROCESS
1. Inspect the current implementation and identify conflicts or missing prerequisites.
2. Produce or update the Qoder Spec with a task breakdown, file plan, risks, and acceptance tests.
3. Implement the smallest coherent solution that completely satisfies this phase.
4. Add or update automated tests and deterministic fixtures.
5. Run lint, typecheck, tests, builds, and the relevant smoke test.
6. Update documentation and PROJECT_STATUS.md with completed work, commands, results, known limitations, and the exact next phase.
7. Do not proceed to a later phase.

ACCEPTANCE GATE
Ten consecutive mock rounds complete without state leakage or a manual reset.

FINAL RESPONSE
Report changed files, architectural decisions, commands run, test results, manual verification steps, remaining risks, and any item that could not be completed. Do not claim success without evidence.
```

## Phase 7: Viewer Identity and Faction Participation

**Objective:** Make viewers visible and personally invested.

**Required work:**

- Create session-scoped viewer profiles.
- Parse join and strategy commands from normalized chat events.
- Enforce one faction per round and lobby-only switching.
- Spawn named champions and track contribution categories.
- Sanitize names, limit lengths, and support moderation hides.

**Deliverable:** Named viewers join and affect a mock match.

**Acceptance gate:** Duplicate comments do not duplicate profiles and unsafe display names cannot break the UI.

**Copy-ready Qoder prompt:**

```text
You are implementing Phase 7 of RiftCrowd LIVE: Viewer Identity and Faction Participation.

READ FIRST
- AGENTS.md
- docs/PRODUCT_SPEC.md
- docs/ARCHITECTURE.md
- docs/EVENT_PROTOCOL.md
- PROJECT_STATUS.md
- all code and tests relevant to this phase

PHASE OBJECTIVE
Make viewers visible and personally invested.

REQUIRED WORK
- Create session-scoped viewer profiles.
- Parse join and strategy commands from normalized chat events.
- Enforce one faction per round and lobby-only switching.
- Spawn named champions and track contribution categories.
- Sanitize names, limit lengths, and support moderation hides.

DELIVERABLE
Named viewers join and affect a mock match.

NON-NEGOTIABLE RULES
- Work only on this phase and preserve working behavior from previous phases.
- Keep provider-specific raw data outside the Godot game.
- Keep all network listeners bound to 127.0.0.1 by default.
- Treat all viewer and provider data as untrusted, validate it, and sanitize display text.
- Keep the complete experience testable in MockLiveAdapter mode with no internet.
- Do not use official club brands, nicknames, crests, jerseys, player identities, copyrighted music, or copied artwork.
- Do not implement gambling, prizes of monetary value, hidden odds, or pressure-based gifting.
- Prefer configuration, schemas, tests, pooling, and bounded queues over hardcoded behavior.
- Do not create fake stubs that always report success.

PROCESS
1. Inspect the current implementation and identify conflicts or missing prerequisites.
2. Produce or update the Qoder Spec with a task breakdown, file plan, risks, and acceptance tests.
3. Implement the smallest coherent solution that completely satisfies this phase.
4. Add or update automated tests and deterministic fixtures.
5. Run lint, typecheck, tests, builds, and the relevant smoke test.
6. Update documentation and PROJECT_STATUS.md with completed work, commands, results, known limitations, and the exact next phase.
7. Do not proceed to a later phase.

ACCEPTANCE GATE
Duplicate comments do not duplicate profiles and unsafe display names cannot break the UI.

FINAL RESPONSE
Report changed files, architectural decisions, commands run, test results, manual verification steps, remaining risks, and any item that could not be completed. Do not claim success without evidence.
```

## Phase 8: Node Gateway Core

**Objective:** Build the local reliability layer before connecting TikTok.

**Required work:**

- Implement Fastify health, status, config, and control endpoints.
- Implement event bus, normalization boundary, dedupe store, rate limits, command rules, command queue, and structured logging.
- Bind to localhost and require a local session token.
- Implement graceful shutdown and configuration validation.
- Create unit and integration tests.

**Deliverable:** Local gateway with tested event-to-command pipeline.

**Acceptance gate:** Fixture events produce expected commands and malformed events never reach the rules engine.

**Copy-ready Qoder prompt:**

```text
You are implementing Phase 8 of RiftCrowd LIVE: Node Gateway Core.

READ FIRST
- AGENTS.md
- docs/PRODUCT_SPEC.md
- docs/ARCHITECTURE.md
- docs/EVENT_PROTOCOL.md
- PROJECT_STATUS.md
- all code and tests relevant to this phase

PHASE OBJECTIVE
Build the local reliability layer before connecting TikTok.

REQUIRED WORK
- Implement Fastify health, status, config, and control endpoints.
- Implement event bus, normalization boundary, dedupe store, rate limits, command rules, command queue, and structured logging.
- Bind to localhost and require a local session token.
- Implement graceful shutdown and configuration validation.
- Create unit and integration tests.

DELIVERABLE
Local gateway with tested event-to-command pipeline.

NON-NEGOTIABLE RULES
- Work only on this phase and preserve working behavior from previous phases.
- Keep provider-specific raw data outside the Godot game.
- Keep all network listeners bound to 127.0.0.1 by default.
- Treat all viewer and provider data as untrusted, validate it, and sanitize display text.
- Keep the complete experience testable in MockLiveAdapter mode with no internet.
- Do not use official club brands, nicknames, crests, jerseys, player identities, copyrighted music, or copied artwork.
- Do not implement gambling, prizes of monetary value, hidden odds, or pressure-based gifting.
- Prefer configuration, schemas, tests, pooling, and bounded queues over hardcoded behavior.
- Do not create fake stubs that always report success.

PROCESS
1. Inspect the current implementation and identify conflicts or missing prerequisites.
2. Produce or update the Qoder Spec with a task breakdown, file plan, risks, and acceptance tests.
3. Implement the smallest coherent solution that completely satisfies this phase.
4. Add or update automated tests and deterministic fixtures.
5. Run lint, typecheck, tests, builds, and the relevant smoke test.
6. Update documentation and PROJECT_STATUS.md with completed work, commands, results, known limitations, and the exact next phase.
7. Do not proceed to a later phase.

ACCEPTANCE GATE
Fixture events produce expected commands and malformed events never reach the rules engine.

FINAL RESPONSE
Report changed files, architectural decisions, commands run, test results, manual verification steps, remaining risks, and any item that could not be completed. Do not claim success without evidence.
```

## Phase 9: Mock LIVE Adapter and Event Studio

**Objective:** Make the project fully testable without a live account.

**Required work:**

- Implement MockLiveAdapter.
- Create scripted scenarios: normal traffic, gift streak, viral burst, malformed payloads, disconnect, reconnect, and four-mode round.
- Create CLI and dashboard test buttons.
- Support recording and replaying normalized event sessions.
- Add deterministic timestamps or a test clock.

**Deliverable:** A comprehensive LIVE simulator.

**Acceptance gate:** A developer can demonstrate every major feature offline.

**Copy-ready Qoder prompt:**

```text
You are implementing Phase 9 of RiftCrowd LIVE: Mock LIVE Adapter and Event Studio.

READ FIRST
- AGENTS.md
- docs/PRODUCT_SPEC.md
- docs/ARCHITECTURE.md
- docs/EVENT_PROTOCOL.md
- PROJECT_STATUS.md
- all code and tests relevant to this phase

PHASE OBJECTIVE
Make the project fully testable without a live account.

REQUIRED WORK
- Implement MockLiveAdapter.
- Create scripted scenarios: normal traffic, gift streak, viral burst, malformed payloads, disconnect, reconnect, and four-mode round.
- Create CLI and dashboard test buttons.
- Support recording and replaying normalized event sessions.
- Add deterministic timestamps or a test clock.

DELIVERABLE
A comprehensive LIVE simulator.

NON-NEGOTIABLE RULES
- Work only on this phase and preserve working behavior from previous phases.
- Keep provider-specific raw data outside the Godot game.
- Keep all network listeners bound to 127.0.0.1 by default.
- Treat all viewer and provider data as untrusted, validate it, and sanitize display text.
- Keep the complete experience testable in MockLiveAdapter mode with no internet.
- Do not use official club brands, nicknames, crests, jerseys, player identities, copyrighted music, or copied artwork.
- Do not implement gambling, prizes of monetary value, hidden odds, or pressure-based gifting.
- Prefer configuration, schemas, tests, pooling, and bounded queues over hardcoded behavior.
- Do not create fake stubs that always report success.

PROCESS
1. Inspect the current implementation and identify conflicts or missing prerequisites.
2. Produce or update the Qoder Spec with a task breakdown, file plan, risks, and acceptance tests.
3. Implement the smallest coherent solution that completely satisfies this phase.
4. Add or update automated tests and deterministic fixtures.
5. Run lint, typecheck, tests, builds, and the relevant smoke test.
6. Update documentation and PROJECT_STATUS.md with completed work, commands, results, known limitations, and the exact next phase.
7. Do not proceed to a later phase.

ACCEPTANCE GATE
A developer can demonstrate every major feature offline.

FINAL RESPONSE
Report changed files, architectural decisions, commands run, test results, manual verification steps, remaining risks, and any item that could not be completed. Do not claim success without evidence.
```

## Phase 10: Gateway-to-Godot WebSocket Integration

**Objective:** Connect real-time commands to the game safely.

**Required work:**

- Implement localhost WebSocket server and Godot WebSocket client.
- Add handshake, protocol version, heartbeat, reconnect, command acknowledgment, snapshot, and error messages.
- Make command handling idempotent.
- Add a bounded retry buffer.
- Display non-intrusive connection status in the game.

**Deliverable:** End-to-end mock event reaction in Godot.

**Acceptance gate:** Mock comment and gift events create visible correct actions with reconnect recovery.

**Copy-ready Qoder prompt:**

```text
You are implementing Phase 10 of RiftCrowd LIVE: Gateway-to-Godot WebSocket Integration.

READ FIRST
- AGENTS.md
- docs/PRODUCT_SPEC.md
- docs/ARCHITECTURE.md
- docs/EVENT_PROTOCOL.md
- PROJECT_STATUS.md
- all code and tests relevant to this phase

PHASE OBJECTIVE
Connect real-time commands to the game safely.

REQUIRED WORK
- Implement localhost WebSocket server and Godot WebSocket client.
- Add handshake, protocol version, heartbeat, reconnect, command acknowledgment, snapshot, and error messages.
- Make command handling idempotent.
- Add a bounded retry buffer.
- Display non-intrusive connection status in the game.

DELIVERABLE
End-to-end mock event reaction in Godot.

NON-NEGOTIABLE RULES
- Work only on this phase and preserve working behavior from previous phases.
- Keep provider-specific raw data outside the Godot game.
- Keep all network listeners bound to 127.0.0.1 by default.
- Treat all viewer and provider data as untrusted, validate it, and sanitize display text.
- Keep the complete experience testable in MockLiveAdapter mode with no internet.
- Do not use official club brands, nicknames, crests, jerseys, player identities, copyrighted music, or copied artwork.
- Do not implement gambling, prizes of monetary value, hidden odds, or pressure-based gifting.
- Prefer configuration, schemas, tests, pooling, and bounded queues over hardcoded behavior.
- Do not create fake stubs that always report success.

PROCESS
1. Inspect the current implementation and identify conflicts or missing prerequisites.
2. Produce or update the Qoder Spec with a task breakdown, file plan, risks, and acceptance tests.
3. Implement the smallest coherent solution that completely satisfies this phase.
4. Add or update automated tests and deterministic fixtures.
5. Run lint, typecheck, tests, builds, and the relevant smoke test.
6. Update documentation and PROJECT_STATUS.md with completed work, commands, results, known limitations, and the exact next phase.
7. Do not proceed to a later phase.

ACCEPTANCE GATE
Mock comment and gift events create visible correct actions with reconnect recovery.

FINAL RESPONSE
Report changed files, architectural decisions, commands run, test results, manual verification steps, remaining risks, and any item that could not be completed. Do not claim success without evidence.
```

## Phase 11: Gift Economy, Streaks, and Burst Aggregation

**Objective:** Create exciting but stable gift reactions.

**Required work:**

- Implement configurable impact tiers and gift mappings.
- Implement streak aggregation without double counting.
- Implement per-user, per-faction, ability, cinematic, and global cooldowns.
- Implement overflow conversion to reserve energy or score.
- Add transparent logs and a mapping preview.

**Deliverable:** Balanced data-driven interaction economy.

**Acceptance gate:** A 1,000-event fixture completes without crash, unbounded queue, or more active units than configured.

**Copy-ready Qoder prompt:**

```text
You are implementing Phase 11 of RiftCrowd LIVE: Gift Economy, Streaks, and Burst Aggregation.

READ FIRST
- AGENTS.md
- docs/PRODUCT_SPEC.md
- docs/ARCHITECTURE.md
- docs/EVENT_PROTOCOL.md
- PROJECT_STATUS.md
- all code and tests relevant to this phase

PHASE OBJECTIVE
Create exciting but stable gift reactions.

REQUIRED WORK
- Implement configurable impact tiers and gift mappings.
- Implement streak aggregation without double counting.
- Implement per-user, per-faction, ability, cinematic, and global cooldowns.
- Implement overflow conversion to reserve energy or score.
- Add transparent logs and a mapping preview.

DELIVERABLE
Balanced data-driven interaction economy.

NON-NEGOTIABLE RULES
- Work only on this phase and preserve working behavior from previous phases.
- Keep provider-specific raw data outside the Godot game.
- Keep all network listeners bound to 127.0.0.1 by default.
- Treat all viewer and provider data as untrusted, validate it, and sanitize display text.
- Keep the complete experience testable in MockLiveAdapter mode with no internet.
- Do not use official club brands, nicknames, crests, jerseys, player identities, copyrighted music, or copied artwork.
- Do not implement gambling, prizes of monetary value, hidden odds, or pressure-based gifting.
- Prefer configuration, schemas, tests, pooling, and bounded queues over hardcoded behavior.
- Do not create fake stubs that always report success.

PROCESS
1. Inspect the current implementation and identify conflicts or missing prerequisites.
2. Produce or update the Qoder Spec with a task breakdown, file plan, risks, and acceptance tests.
3. Implement the smallest coherent solution that completely satisfies this phase.
4. Add or update automated tests and deterministic fixtures.
5. Run lint, typecheck, tests, builds, and the relevant smoke test.
6. Update documentation and PROJECT_STATUS.md with completed work, commands, results, known limitations, and the exact next phase.
7. Do not proceed to a later phase.

ACCEPTANCE GATE
A 1,000-event fixture completes without crash, unbounded queue, or more active units than configured.

FINAL RESPONSE
Report changed files, architectural decisions, commands run, test results, manual verification steps, remaining risks, and any item that could not be completed. Do not claim success without evidence.
```

## Phase 12: Free Engagement Mechanics

**Objective:** Ensure comments, likes, follows, and shares matter.

**Required work:**

- Aggregate likes into milestones.
- Implement follow Guardians, share shields, strategy votes, and free-energy abilities.
- Track top free contributor separately.
- Prevent comment spam and duplicate votes.
- Display free participation instructions as prominently as gift actions.

**Deliverable:** A complete non-paying participation loop.

**Acceptance gate:** A faction can meaningfully influence and win a round through free engagement in mock scenarios.

**Copy-ready Qoder prompt:**

```text
You are implementing Phase 12 of RiftCrowd LIVE: Free Engagement Mechanics.

READ FIRST
- AGENTS.md
- docs/PRODUCT_SPEC.md
- docs/ARCHITECTURE.md
- docs/EVENT_PROTOCOL.md
- PROJECT_STATUS.md
- all code and tests relevant to this phase

PHASE OBJECTIVE
Ensure comments, likes, follows, and shares matter.

REQUIRED WORK
- Aggregate likes into milestones.
- Implement follow Guardians, share shields, strategy votes, and free-energy abilities.
- Track top free contributor separately.
- Prevent comment spam and duplicate votes.
- Display free participation instructions as prominently as gift actions.

DELIVERABLE
A complete non-paying participation loop.

NON-NEGOTIABLE RULES
- Work only on this phase and preserve working behavior from previous phases.
- Keep provider-specific raw data outside the Godot game.
- Keep all network listeners bound to 127.0.0.1 by default.
- Treat all viewer and provider data as untrusted, validate it, and sanitize display text.
- Keep the complete experience testable in MockLiveAdapter mode with no internet.
- Do not use official club brands, nicknames, crests, jerseys, player identities, copyrighted music, or copied artwork.
- Do not implement gambling, prizes of monetary value, hidden odds, or pressure-based gifting.
- Prefer configuration, schemas, tests, pooling, and bounded queues over hardcoded behavior.
- Do not create fake stubs that always report success.

PROCESS
1. Inspect the current implementation and identify conflicts or missing prerequisites.
2. Produce or update the Qoder Spec with a task breakdown, file plan, risks, and acceptance tests.
3. Implement the smallest coherent solution that completely satisfies this phase.
4. Add or update automated tests and deterministic fixtures.
5. Run lint, typecheck, tests, builds, and the relevant smoke test.
6. Update documentation and PROJECT_STATUS.md with completed work, commands, results, known limitations, and the exact next phase.
7. Do not proceed to a later phase.

ACCEPTANCE GATE
A faction can meaningfully influence and win a round through free engagement in mock scenarios.

FINAL RESPONSE
Report changed files, architectural decisions, commands run, test results, manual verification steps, remaining risks, and any item that could not be completed. Do not claim success without evidence.
```

## Phase 13: Creator Dashboard

**Objective:** Give the streamer safe operational control.

**Required work:**

- Build status cards for gateway, provider, game, queue, FPS, and round state.
- Build provider settings, mode selection, gift mapping, cooldown, and content-pack screens.
- Add test-event buttons and scenario replay.
- Add emergency pause, disable gifts, clear queue, end round, reconnect, and hide-user actions.
- Protect all mutations with the local session token.

**Deliverable:** Usable local control panel.

**Acceptance gate:** A creator can operate a complete mock stream without editing files or using the terminal.

**Copy-ready Qoder prompt:**

```text
You are implementing Phase 13 of RiftCrowd LIVE: Creator Dashboard.

READ FIRST
- AGENTS.md
- docs/PRODUCT_SPEC.md
- docs/ARCHITECTURE.md
- docs/EVENT_PROTOCOL.md
- PROJECT_STATUS.md
- all code and tests relevant to this phase

PHASE OBJECTIVE
Give the streamer safe operational control.

REQUIRED WORK
- Build status cards for gateway, provider, game, queue, FPS, and round state.
- Build provider settings, mode selection, gift mapping, cooldown, and content-pack screens.
- Add test-event buttons and scenario replay.
- Add emergency pause, disable gifts, clear queue, end round, reconnect, and hide-user actions.
- Protect all mutations with the local session token.

DELIVERABLE
Usable local control panel.

NON-NEGOTIABLE RULES
- Work only on this phase and preserve working behavior from previous phases.
- Keep provider-specific raw data outside the Godot game.
- Keep all network listeners bound to 127.0.0.1 by default.
- Treat all viewer and provider data as untrusted, validate it, and sanitize display text.
- Keep the complete experience testable in MockLiveAdapter mode with no internet.
- Do not use official club brands, nicknames, crests, jerseys, player identities, copyrighted music, or copied artwork.
- Do not implement gambling, prizes of monetary value, hidden odds, or pressure-based gifting.
- Prefer configuration, schemas, tests, pooling, and bounded queues over hardcoded behavior.
- Do not create fake stubs that always report success.

PROCESS
1. Inspect the current implementation and identify conflicts or missing prerequisites.
2. Produce or update the Qoder Spec with a task breakdown, file plan, risks, and acceptance tests.
3. Implement the smallest coherent solution that completely satisfies this phase.
4. Add or update automated tests and deterministic fixtures.
5. Run lint, typecheck, tests, builds, and the relevant smoke test.
6. Update documentation and PROJECT_STATUS.md with completed work, commands, results, known limitations, and the exact next phase.
7. Do not proceed to a later phase.

ACCEPTANCE GATE
A creator can operate a complete mock stream without editing files or using the terminal.

FINAL RESPONSE
Report changed files, architectural decisions, commands run, test results, manual verification steps, remaining risks, and any item that could not be completed. Do not claim success without evidence.
```

## Phase 14: TikFinity Adapter

**Objective:** Receive real LIVE events through a replaceable provider.

**Required work:**

- Read the current TikFinity local LIVE API documentation and configuration displayed by the installed app.
- Implement a configurable WebSocket adapter without hardcoding unstable URLs.
- Store representative raw fixtures after redacting secrets and personal data.
- Map chat, like, follow, share, subscription, and gift events into NormalizedLiveEvent.
- Handle disconnects, malformed fields, changed payloads, and unknown event types.
- Keep MockLiveAdapter as the default provider.

**Deliverable:** Real provider integration isolated behind the adapter.

**Acceptance gate:** During a private test LIVE, supported events appear in gateway logs and cause correct game actions; provider loss does not crash the game.

**Copy-ready Qoder prompt:**

```text
You are implementing Phase 14 of RiftCrowd LIVE: TikFinity Adapter.

READ FIRST
- AGENTS.md
- docs/PRODUCT_SPEC.md
- docs/ARCHITECTURE.md
- docs/EVENT_PROTOCOL.md
- PROJECT_STATUS.md
- all code and tests relevant to this phase

PHASE OBJECTIVE
Receive real LIVE events through a replaceable provider.

REQUIRED WORK
- Read the current TikFinity local LIVE API documentation and configuration displayed by the installed app.
- Implement a configurable WebSocket adapter without hardcoding unstable URLs.
- Store representative raw fixtures after redacting secrets and personal data.
- Map chat, like, follow, share, subscription, and gift events into NormalizedLiveEvent.
- Handle disconnects, malformed fields, changed payloads, and unknown event types.
- Keep MockLiveAdapter as the default provider.

DELIVERABLE
Real provider integration isolated behind the adapter.

NON-NEGOTIABLE RULES
- Work only on this phase and preserve working behavior from previous phases.
- Keep provider-specific raw data outside the Godot game.
- Keep all network listeners bound to 127.0.0.1 by default.
- Treat all viewer and provider data as untrusted, validate it, and sanitize display text.
- Keep the complete experience testable in MockLiveAdapter mode with no internet.
- Do not use official club brands, nicknames, crests, jerseys, player identities, copyrighted music, or copied artwork.
- Do not implement gambling, prizes of monetary value, hidden odds, or pressure-based gifting.
- Prefer configuration, schemas, tests, pooling, and bounded queues over hardcoded behavior.
- Do not create fake stubs that always report success.

PROCESS
1. Inspect the current implementation and identify conflicts or missing prerequisites.
2. Produce or update the Qoder Spec with a task breakdown, file plan, risks, and acceptance tests.
3. Implement the smallest coherent solution that completely satisfies this phase.
4. Add or update automated tests and deterministic fixtures.
5. Run lint, typecheck, tests, builds, and the relevant smoke test.
6. Update documentation and PROJECT_STATUS.md with completed work, commands, results, known limitations, and the exact next phase.
7. Do not proceed to a later phase.

ACCEPTANCE GATE
During a private test LIVE, supported events appear in gateway logs and cause correct game actions; provider loss does not crash the game.

FINAL RESPONSE
Report changed files, architectural decisions, commands run, test results, manual verification steps, remaining risks, and any item that could not be completed. Do not claim success without evidence.
```

## Phase 15: Visual Effects, Audio, and TikTok Readability

**Objective:** Transform the functional game into an attention-grabbing show.

**Required work:**

- Create original particles, hit flashes, trails, faction overlays, camera impulses, and ability sequences.
- Add pooled VFX and quality levels.
- Add original or properly licensed music and sound effects with volume groups.
- Create event spotlight cards and supporter callouts.
- Add color-blind patterns, motion-reduction option, and readable safe-zone layouts.

**Deliverable:** Polished launch visual language.

**Acceptance gate:** Effects remain readable on a phone screen and do not drop below the chosen frame-rate budget in stress tests.

**Copy-ready Qoder prompt:**

```text
You are implementing Phase 15 of RiftCrowd LIVE: Visual Effects, Audio, and TikTok Readability.

READ FIRST
- AGENTS.md
- docs/PRODUCT_SPEC.md
- docs/ARCHITECTURE.md
- docs/EVENT_PROTOCOL.md
- PROJECT_STATUS.md
- all code and tests relevant to this phase

PHASE OBJECTIVE
Transform the functional game into an attention-grabbing show.

REQUIRED WORK
- Create original particles, hit flashes, trails, faction overlays, camera impulses, and ability sequences.
- Add pooled VFX and quality levels.
- Add original or properly licensed music and sound effects with volume groups.
- Create event spotlight cards and supporter callouts.
- Add color-blind patterns, motion-reduction option, and readable safe-zone layouts.

DELIVERABLE
Polished launch visual language.

NON-NEGOTIABLE RULES
- Work only on this phase and preserve working behavior from previous phases.
- Keep provider-specific raw data outside the Godot game.
- Keep all network listeners bound to 127.0.0.1 by default.
- Treat all viewer and provider data as untrusted, validate it, and sanitize display text.
- Keep the complete experience testable in MockLiveAdapter mode with no internet.
- Do not use official club brands, nicknames, crests, jerseys, player identities, copyrighted music, or copied artwork.
- Do not implement gambling, prizes of monetary value, hidden odds, or pressure-based gifting.
- Prefer configuration, schemas, tests, pooling, and bounded queues over hardcoded behavior.
- Do not create fake stubs that always report success.

PROCESS
1. Inspect the current implementation and identify conflicts or missing prerequisites.
2. Produce or update the Qoder Spec with a task breakdown, file plan, risks, and acceptance tests.
3. Implement the smallest coherent solution that completely satisfies this phase.
4. Add or update automated tests and deterministic fixtures.
5. Run lint, typecheck, tests, builds, and the relevant smoke test.
6. Update documentation and PROJECT_STATUS.md with completed work, commands, results, known limitations, and the exact next phase.
7. Do not proceed to a later phase.

ACCEPTANCE GATE
Effects remain readable on a phone screen and do not drop below the chosen frame-rate budget in stress tests.

FINAL RESPONSE
Report changed files, architectural decisions, commands run, test results, manual verification steps, remaining risks, and any item that could not be completed. Do not claim success without evidence.
```

## Phase 16: OBS and TikTok LIVE Studio Runbook

**Objective:** Make launching a stream repeatable.

**Required work:**

- Create a borderless portrait window mode.
- Create OBS scene instructions for 1080x1920 capture, audio, overlays, and recording.
- Create TikTok LIVE Studio capture instructions.
- Add a preflight screen and stream-safe fallback scene.
- Create a one-page start and stop checklist.

**Deliverable:** Documented streaming workflow.

**Acceptance gate:** A fresh Windows user can launch a mock stream from the runbook without developer help.

**Copy-ready Qoder prompt:**

```text
You are implementing Phase 16 of RiftCrowd LIVE: OBS and TikTok LIVE Studio Runbook.

READ FIRST
- AGENTS.md
- docs/PRODUCT_SPEC.md
- docs/ARCHITECTURE.md
- docs/EVENT_PROTOCOL.md
- PROJECT_STATUS.md
- all code and tests relevant to this phase

PHASE OBJECTIVE
Make launching a stream repeatable.

REQUIRED WORK
- Create a borderless portrait window mode.
- Create OBS scene instructions for 1080x1920 capture, audio, overlays, and recording.
- Create TikTok LIVE Studio capture instructions.
- Add a preflight screen and stream-safe fallback scene.
- Create a one-page start and stop checklist.

DELIVERABLE
Documented streaming workflow.

NON-NEGOTIABLE RULES
- Work only on this phase and preserve working behavior from previous phases.
- Keep provider-specific raw data outside the Godot game.
- Keep all network listeners bound to 127.0.0.1 by default.
- Treat all viewer and provider data as untrusted, validate it, and sanitize display text.
- Keep the complete experience testable in MockLiveAdapter mode with no internet.
- Do not use official club brands, nicknames, crests, jerseys, player identities, copyrighted music, or copied artwork.
- Do not implement gambling, prizes of monetary value, hidden odds, or pressure-based gifting.
- Prefer configuration, schemas, tests, pooling, and bounded queues over hardcoded behavior.
- Do not create fake stubs that always report success.

PROCESS
1. Inspect the current implementation and identify conflicts or missing prerequisites.
2. Produce or update the Qoder Spec with a task breakdown, file plan, risks, and acceptance tests.
3. Implement the smallest coherent solution that completely satisfies this phase.
4. Add or update automated tests and deterministic fixtures.
5. Run lint, typecheck, tests, builds, and the relevant smoke test.
6. Update documentation and PROJECT_STATUS.md with completed work, commands, results, known limitations, and the exact next phase.
7. Do not proceed to a later phase.

ACCEPTANCE GATE
A fresh Windows user can launch a mock stream from the runbook without developer help.

FINAL RESPONSE
Report changed files, architectural decisions, commands run, test results, manual verification steps, remaining risks, and any item that could not be completed. Do not claim success without evidence.
```

## Phase 17: Testing, Performance, and Failure Recovery

**Objective:** Prove the game survives real live-stream conditions.

**Required work:**

- Add unit, integration, replay, and smoke tests.
- Add soak test for repeated rounds.
- Add burst tests, reconnect tests, malformed payload tests, and low-FPS degradation behavior.
- Add object pooling and caps.
- Write a test report with measured results and remaining limits.

**Deliverable:** Release-candidate reliability evidence.

**Acceptance gate:** All automated gates pass and an extended mock session finishes without crash or unbounded memory/queue growth.

**Copy-ready Qoder prompt:**

```text
You are implementing Phase 17 of RiftCrowd LIVE: Testing, Performance, and Failure Recovery.

READ FIRST
- AGENTS.md
- docs/PRODUCT_SPEC.md
- docs/ARCHITECTURE.md
- docs/EVENT_PROTOCOL.md
- PROJECT_STATUS.md
- all code and tests relevant to this phase

PHASE OBJECTIVE
Prove the game survives real live-stream conditions.

REQUIRED WORK
- Add unit, integration, replay, and smoke tests.
- Add soak test for repeated rounds.
- Add burst tests, reconnect tests, malformed payload tests, and low-FPS degradation behavior.
- Add object pooling and caps.
- Write a test report with measured results and remaining limits.

DELIVERABLE
Release-candidate reliability evidence.

NON-NEGOTIABLE RULES
- Work only on this phase and preserve working behavior from previous phases.
- Keep provider-specific raw data outside the Godot game.
- Keep all network listeners bound to 127.0.0.1 by default.
- Treat all viewer and provider data as untrusted, validate it, and sanitize display text.
- Keep the complete experience testable in MockLiveAdapter mode with no internet.
- Do not use official club brands, nicknames, crests, jerseys, player identities, copyrighted music, or copied artwork.
- Do not implement gambling, prizes of monetary value, hidden odds, or pressure-based gifting.
- Prefer configuration, schemas, tests, pooling, and bounded queues over hardcoded behavior.
- Do not create fake stubs that always report success.

PROCESS
1. Inspect the current implementation and identify conflicts or missing prerequisites.
2. Produce or update the Qoder Spec with a task breakdown, file plan, risks, and acceptance tests.
3. Implement the smallest coherent solution that completely satisfies this phase.
4. Add or update automated tests and deterministic fixtures.
5. Run lint, typecheck, tests, builds, and the relevant smoke test.
6. Update documentation and PROJECT_STATUS.md with completed work, commands, results, known limitations, and the exact next phase.
7. Do not proceed to a later phase.

ACCEPTANCE GATE
All automated gates pass and an extended mock session finishes without crash or unbounded memory/queue growth.

FINAL RESPONSE
Report changed files, architectural decisions, commands run, test results, manual verification steps, remaining risks, and any item that could not be completed. Do not claim success without evidence.
```

## Phase 18: Packaging, Release, and Operations

**Objective:** Create a creator-friendly Windows release.

**Required work:**

- Export the Godot Windows build with matching templates.
- Build the gateway and dashboard for production.
- Create a launcher script or small launcher that starts gateway, dashboard, and game in order.
- Create configuration migration and backup behavior.
- Add version display, logs folder, diagnostic export, and update notes.
- Create license inventory and final IP/platform checklist.

**Deliverable:** Versioned local release package.

**Acceptance gate:** A creator can extract or install the release, configure it, run a mock session, and stop it cleanly.

**Copy-ready Qoder prompt:**

```text
You are implementing Phase 18 of RiftCrowd LIVE: Packaging, Release, and Operations.

READ FIRST
- AGENTS.md
- docs/PRODUCT_SPEC.md
- docs/ARCHITECTURE.md
- docs/EVENT_PROTOCOL.md
- PROJECT_STATUS.md
- all code and tests relevant to this phase

PHASE OBJECTIVE
Create a creator-friendly Windows release.

REQUIRED WORK
- Export the Godot Windows build with matching templates.
- Build the gateway and dashboard for production.
- Create a launcher script or small launcher that starts gateway, dashboard, and game in order.
- Create configuration migration and backup behavior.
- Add version display, logs folder, diagnostic export, and update notes.
- Create license inventory and final IP/platform checklist.

DELIVERABLE
Versioned local release package.

NON-NEGOTIABLE RULES
- Work only on this phase and preserve working behavior from previous phases.
- Keep provider-specific raw data outside the Godot game.
- Keep all network listeners bound to 127.0.0.1 by default.
- Treat all viewer and provider data as untrusted, validate it, and sanitize display text.
- Keep the complete experience testable in MockLiveAdapter mode with no internet.
- Do not use official club brands, nicknames, crests, jerseys, player identities, copyrighted music, or copied artwork.
- Do not implement gambling, prizes of monetary value, hidden odds, or pressure-based gifting.
- Prefer configuration, schemas, tests, pooling, and bounded queues over hardcoded behavior.
- Do not create fake stubs that always report success.

PROCESS
1. Inspect the current implementation and identify conflicts or missing prerequisites.
2. Produce or update the Qoder Spec with a task breakdown, file plan, risks, and acceptance tests.
3. Implement the smallest coherent solution that completely satisfies this phase.
4. Add or update automated tests and deterministic fixtures.
5. Run lint, typecheck, tests, builds, and the relevant smoke test.
6. Update documentation and PROJECT_STATUS.md with completed work, commands, results, known limitations, and the exact next phase.
7. Do not proceed to a later phase.

ACCEPTANCE GATE
A creator can extract or install the release, configure it, run a mock session, and stop it cleanly.

FINAL RESPONSE
Report changed files, architectural decisions, commands run, test results, manual verification steps, remaining risks, and any item that could not be completed. Do not claim success without evidence.
```

# 15. Testing Strategy

## 15.1 Automated test layers

### Gateway unit tests

- Event schema validation.
- Sanitization.
- Duplicate detection.
- Gift streak accounting.
- Rate limits.
- Faction resolution.
- Rule-to-command mapping.
- Queue merge and caps.

### Gateway integration tests

- Fastify endpoints.
- WebSocket handshake.
- Authentication token rejection.
- Command acknowledgment and retry.
- Provider reconnect.

### Godot tests

Godot's built-in scripting and a test add-on or custom headless test runner can test:

- Content pack parsing.
- Unit state transitions.
- Damage and death.
- Crown capture.
- Round transitions.
- Idempotent command handling.
- Pool return behavior.

### Replay tests

A recorded normalized-event fixture must produce the same high-level results when run with the same seed and configuration.

## 15.2 Required scenarios

| Scenario | Expected behavior |
|---|---|
| Empty stream | AI battle continues and rounds end normally |
| One active viewer | viewer joins once and receives a named champion |
| Comment spam | accepted actions are capped; UI remains stable |
| Gift streak | total counted once, with correct incremental effect |
| Viral burst | queue aggregates and remains bounded |
| Provider disconnect | game continues; status changes; reconnect recovers |
| Gateway restart | Godot reconnects and receives a state snapshot |
| Godot restart | gateway reconnects and resumes without replaying expired commands |
| Invalid payload | event rejected and logged safely |
| Offensive display name | filtered or hidden without breaking UI |
| Ten rounds | no stale faction state or increasing active-object count |

## 15.3 Performance budgets

Initial targets, to be measured and adjusted:

- 60 FPS preferred, 30 FPS minimum on the target streaming PC.
- Maximum visible dynamic units configured by quality profile.
- No unbounded arrays, queues, logs, or scene nodes.
- Local event-to-visible-action target below 500 milliseconds under normal load.
- Expensive cinematics serialized rather than stacked.
- Object pooling for units, projectiles, damage labels, and particles.

## 15.4 Definition of done

A feature is not complete because the code compiles. It is complete when:

1. Tests pass.
2. The manual scenario works.
3. Logs are useful.
4. Failure behavior is defined.
5. Documentation is updated.
6. The feature works in mock mode.
7. It does not violate architecture, security, or content rules.

# 16. Streaming Setup with OBS or TikTok LIVE Studio

## 16.1 Recommended development scene

Create an OBS portrait canvas:

- Base canvas: 1080 x 1920.
- Output: 1080 x 1920 or a supported TikTok portrait setting.
- Game Capture or Window Capture: Godot release window.
- Optional browser source: dashboard status should **not** be visible to viewers unless a dedicated overlay is created.
- Audio sources: game audio and microphone if used.
- Record locally during tests.

## 16.2 Game window

Add release options:

- Borderless portrait window.
- Always-on-top optional.
- Configurable monitor.
- Safe fallback scene.
- Cursor hidden inside game window.
- Development overlays disabled in release mode.

## 16.3 Stream preflight checklist

1. TikTok account has LIVE access and is in good standing.
2. Game starts in mock mode.
3. Gateway health is green.
4. Godot connection is green.
5. Audio levels are safe.
6. OBS or LIVE Studio captures the correct window.
7. No dashboard, secret, console, notification, or private browser window is visible.
8. Switch provider to TikFinity.
9. Confirm one harmless test event.
10. Start the mode vote.

## 16.4 Stream shutdown checklist

1. End the current round cleanly.
2. Disable incoming events.
3. Stop the broadcast.
4. Disconnect the provider.
5. Stop the game and gateway.
6. Save logs and replay file.
7. Review errors and highlight timestamps.
8. Back up changed mappings and content packs.

# 17. Release, Operations, and Maintenance

## 17.1 Release contents

```text
RiftCrowd-LIVE-v1.x/
├─ RiftCrowd.exe
├─ RiftCrowd.pck
├─ gateway/
├─ dashboard/
├─ config/
├─ content/
├─ logs/
├─ launcher.ps1
├─ README_FIRST.txt
├─ STREAMING_RUNBOOK.pdf-or-html
├─ LICENSES.txt
└─ VERSION.txt
```

## 17.2 Diagnostics

Add a dashboard button that exports a ZIP containing:

- Application versions.
- Redacted configuration.
- Last log files.
- Queue metrics.
- Provider status history.
- Recent errors.
- Content-pack validation report.

Never include API keys, cookies, tokens, or raw private data.

## 17.3 Maintenance risks

- TikTok can change event behavior or policies.
- Gift catalogs can change.
- TikFinity can change payloads or connection details.
- Godot, Node, OBS, and Qoder versions change.
- New Windows security prompts can affect local networking.
- Content packs can create trademark or cultural issues.

The adapter and schema boundaries are designed to make these changes survivable.

## 17.4 Update policy

- Pin tested dependency versions in lockfiles.
- Review Node and npm security updates regularly.
- Update one major component at a time.
- Replay the full fixture suite after every provider or engine update.
- Keep the last known-good release available for rollback.

# 18. Future Expansion Roadmap

After the first reliable public version, consider:

## 18.1 Four-faction battles

Use four corners, radial Crown capture, and quadrant safe zones. Do not add this before the two-faction version is readable and stable.

## 18.2 Seasonal original content

- Ocean kingdoms.
- Mythical elements.
- Space colonies.
- Historical-inspired fictional empires without copied insignia.
- Creator-designed community factions.

## 18.3 Progression without unfair power

- Session badges.
- Cosmetic champion trails.
- Non-purchased achievements.
- Faction history.
- Viewer contribution records with privacy controls.

Avoid permanent paid combat advantages.

## 18.4 Highlight generator

The gateway can record moments such as:

- Lead reversal.
- Fortress below 5% health.
- Mythic ability.
- Boss defeat.
- Final strike.

A later FFmpeg tool can cut short vertical clips around logged timestamps.

## 18.5 Multi-language presentation

Move all UI text to translation files. Initial target languages could be English, French, and German. Join keywords can support aliases per language.

## 18.6 Licensed packs

The same content-pack format can later support licensed teams, events, influencers, or brands when written rights and platform approvals exist.

# 19. Troubleshooting

## Qoder changes too much at once

Stop the task, revert unrelated edits, strengthen `phase-discipline.md`, and rerun with one phase only. Use a Worktree for experimental phases.

## Godot cannot connect to the gateway

- Confirm gateway is running.
- Confirm host is `127.0.0.1`.
- Confirm ports match `.env` and game settings.
- Confirm the local session token matches.
- Check Windows Firewall prompts.
- Test the gateway health endpoint.

## OBS shows a black game window

Try Window Capture instead of Game Capture, run OBS and the game with the same privilege level, disable conflicting overlays, and confirm the game is not minimized.

## TikFinity events do not arrive

- Confirm the TikTok stream is live.
- Confirm TikFinity is connected to the correct account.
- Confirm its desktop app is running on the same machine.
- Read the current LIVE API connection details inside TikFinity.
- Check the configured WebSocket URL.
- Return to MockLiveAdapter to prove the rest of the system still works.

## Gifts are counted more than once

Inspect repeat count, streak identifier, end flag, and raw event hash. Replay the captured fixture and add a regression test before changing live behavior.

## The game slows during a burst

- Verify active-object caps.
- Confirm pooling.
- Merge spawn commands.
- Reduce simultaneous damage labels and particles.
- Serialize cinematics.
- Convert overflow to reserve energy.
- Use the lower quality profile.

## Viewer names break the layout

Normalize Unicode, remove control characters, escape markup, use a maximum grapheme count, and apply ellipsis. Never rely only on byte length.

## Club-style faction feels too similar to a real club

Change the name, palette, crest shape, slogans, kit pattern, unit design, and lore. Similarity is assessed as a whole; a minor spelling change is not a safe strategy.

# 20. Source Notes

The following sources were reviewed on 30 July 2026. Product versions and platform rules can change; check the latest pages again before implementation and release.

- **S1 — TikTok Developer Portal:** https://developers.tiktok.com/
- **S2 — TikTok Developer Guidelines and app review:** https://developers.tiktok.com/doc/our-guidelines-developer-guidelines
- **S3 — TikTok Webhooks overview:** https://developers.tiktok.com/doc/webhooks-overview
- **S4 — TikTok Community Guidelines, accounts and features / LIVE:** https://www.tiktok.com/community-guidelines/en/accounts-features
- **S5 — TikTok Gifts support:** https://support.tiktok.com/en/live-gifts-wallet/gifts/gifts
- **S6 — TikFinity LIVE API:** https://tikfinity.zerody.one/tiktok/dapi
- **S7 — TikFinity Actions and Events:** https://tikfinity.zerody.one/tiktok/actionsandevents
- **S8 — Unofficial TikTok-Live-Connector project:** https://github.com/zerodytrash/TikTok-Live-Connector
- **S9 — Qoder documentation:** https://docs.qoder.com/
- **S10 — Qoder Spec-driven development:** https://docs.qoder.com/user-guide/quest/spec-driven
- **S11 — Qoder project rules:** https://docs.qoder.com/user-guide/rules
- **S12 — Godot Windows download:** https://godotengine.org/download/windows/
- **S13 — Godot WebSocket support:** https://docs.godotengine.org/en/4.7/about/list_of_features.html
- **S14 — Node.js releases:** https://nodejs.org/en/about/previous-releases
- **S15 — OBS Studio download:** https://obsproject.com/download
- **S16 — WIPO trademarks:** https://www.wipo.int/en/web/trademarks/
- **S17 — WIPO intellectual property and esports:** https://www.wipo.int/en/web/sports/esports
- **S18 — WIPO guidelines for esports players:** https://www.wipo.int/web-publications/guidelines-for-esports-players/en/what-should-players-look-out-for.html

## Final implementation advice

Start with Phase 0 and Phase 1. Do not install TikFinity or attempt real gift handling until the MockLiveAdapter can run complete, stable, exciting rounds. A reliable offline simulation is the foundation that allows every later connector to be swapped, tested, and repaired.
