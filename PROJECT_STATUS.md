# RiftCrowd LIVE — Project Status

- **Working title:** RiftCrowd LIVE
- **Current phase:** Phase 18 — Packaging, Release, and Operations (next)
- **Status:** Phase 17 COMPLETED
- **Last updated:** 1 August 2026

## Phase tracker

- Phase 0 — Product Lock, Legal Boundaries, and Acceptance Tests: **not started** (product spec
  ships here as a draft; the full lock is Phase 0 work)
- Phase 1 — Repository Bootstrap and Development Tooling: **COMPLETED**
- Phase 2 — Shared Protocol and Schema Validation: **COMPLETED**
- Phase 3 — Godot Portrait Foundation: **COMPLETED**
- Phase 4 — Content-Pack System and Four Launch Packs: **COMPLETED**
- Phase 5 — Autonomous Arena Simulation: **COMPLETED**
- Phase 6 — Match Director and Round Lifecycle: **COMPLETED**
- Phase 7 — Viewer Identity and Faction Participation: **COMPLETED**
- Phase 8 — Node Gateway Core: **COMPLETED**
- Phase 9 — Mock LIVE Adapter and Event Studio: **COMPLETED**
- Phase 10 — Gateway-to-Godot WebSocket Integration: **COMPLETED**
- Phase 11 — Gift Economy, Streaks, and Burst Aggregation: **COMPLETED**
- Phase 12 — Free Engagement Mechanics: **COMPLETED**
- Phase 13 — Creator Dashboard: **COMPLETED**
- Phase 14 — TikFinity Adapter: **COMPLETED**
- Phase 15 — Visual Effects, Audio, and TikTok Readability: **COMPLETED**
- Phase 16 — OBS and TikTok LIVE Studio Runbook: **COMPLETED**
- Phase 17 — Testing, Performance, and Failure Recovery: **COMPLETED**
- Phase 18 — Packaging, Release, and Operations: not started

## Phase 1 — completed work

Repository skeleton and tooling:

- [x] Root monorepo with npm workspaces (`shared`, `gateway`, `dashboard`).
- [x] Strict TypeScript, ESLint 9 flat config, Prettier, and Vitest configured.
- [x] `.gitignore` and `.env.example` (all specified variables).
- [x] Qoder rules in `.qoder/rules/`: `architecture.md`, `security.md`, `testing.md`,
  `phase-discipline.md`.
- [x] `AGENTS.md` (verbatim from guide).

Documentation:

- [x] `docs/ARCHITECTURE.md`
- [x] `docs/EVENT_PROTOCOL.md`
- [x] `docs/PRODUCT_SPEC.md` (draft)
- [x] `docs/CONTENT_PACK_FORMAT.md`
- [x] `docs/STREAMING_RUNBOOK.md` (placeholder)
- [x] `docs/IP_AND_PLATFORM_CHECKLIST.md` (draft)

Shared package:

- [x] `NormalizedLiveEvent` and `GameCommand` Zod schemas with versioning.
- [x] Fixtures: 8 valid + 8 invalid event samples.

Gateway:

- [x] Fastify `/health` endpoint.
- [x] `LiveProviderAdapter` interface and `MockLiveAdapter` (honest stub).
- [x] Config loading with Zod validation.

Dashboard:

- [x] React + Vite app; fetches gateway `/health` and shows ok/unreachable status.

Godot project:

- [x] 1080x1920 portrait, `Boot.tscn` with "RiftCrowd LIVE" + "Boot OK — Phase 1" labels.

Content and tools:

- [x] Content structure: `packs/{countries,animals,fan_crews_original,cities}`,
  `gift-mappings/default.json`.
- [x] Tools: `event-replay` and `asset-validation` (deferred).

## Phase 2 — completed work

Shared protocol and schema validation:

- [x] Versioned Zod schemas in `shared/schemas/`: `NormalizedLiveEventSchema` and
  `GameCommandSchema` carry a required `schemaVersion: 1` literal; all objects are `.strict()`.
- [x] String length and numeric range bounds on every untrusted field (overlong input is
  rejected, not truncated).
- [x] Deterministic identity helpers in `shared/schemas/identity.ts`: `stableStringify`,
  `computeRawHash` (`sha256:` + 64 hex), `deterministicEventId` / `deterministicCommandId`
  (collision-proof tuple derivation via `stableStringify`, `evt_`/`cmd_` + 24 hex). Node-only,
  exposed ONLY via the `@riftcrowd/shared/identity` subpath so the root export stays browser-safe.
- [x] Six protocol message kinds under `PROTOCOL_VERSION = 1` (`event`, `command`, `ack`, `error`,
  `snapshot`, `heartbeat`), discriminated on `kind`, documented in `docs/EVENT_PROTOCOL.md`.
- [x] Four fixture files in `shared/fixtures/`: 8 valid events, 10 invalid events, 6 valid
  messages (one per kind), 7 invalid messages — each invalid entry labelled with its
  `expectedInvalidPath`.
- [x] TypeScript tests (`gateway/test/`): fixtures parse/reject at the documented Zod issue path;
  identity helper stability, divergence, and delimiter-collision cases.
- [x] GDScript mirror `game/scripts/protocol/protocol_validator.gd` (accepts any Variant root,
  rejects non-object JSON) + headless fixture test `game/tests/test_protocol.gd` consuming the
  same shared fixtures.

Commands run and results:

- `npm run lint` — **PASS** (zero errors/warnings)
- `npm run typecheck` — **PASS** (shared, gateway, dashboard all clean)
- `npm test` — **PASS** (21 tests in 4 files: identity 15, messages 3, schemas 2, health 1)
- Godot headless test — **MANUAL STEP REQUIRED** (Godot not installed; see limitations)

Phase 2 known limitations:

- **Godot headless test pending manual run.** Godot is not installed on this machine. Run from
  the `game/` directory: `godot --headless --script res://tests/test_protocol.gd` (exits 0 on
  success).
- **`snapshot.state` is untyped** (`Record<string, unknown>`) until the WebSocket integration
  firms it up in Phase 10.
- **GDScript datetime regex is shape-only.** It mirrors what Zod's `z.string().datetime()`
  accepts structurally but does not validate calendar semantics (e.g. month 13 passes the shape).
- **Game test depends on the monorepo layout.** `game/tests/test_protocol.gd` loads fixtures from
  `../shared/fixtures` relative to `game/`; it will not run from an exported/relocated game build.

## Phase 3 — completed work

Godot portrait foundation (`game/`):

- [x] 1080x1920 portrait viewport with `canvas_items` stretch, `keep` aspect, and handheld
  orientation locked to portrait. No `window/size/*_override` values: they would shrink exported
  and streaming builds too, so dev runs simply resize the window and let stretch scale the shell.
- [x] Safe-zone margins for the TikTok LIVE mobile overlays centralised in
  `scripts/ui/ui_config.gd` (`SAFE_TOP` 30, `SAFE_RIGHT` 60, `SAFE_BOTTOM` 80, `SAFE_LEFT` 30) and
  applied to every screen's root `MarginContainer` via `UiConfig.apply_safe_margins`.
- [x] Six scenes: `Boot`, `MainMenu`, `Lobby`, `Battle`, `Results`, `ErrorOverlay` — all with a
  `Control` root, a shared theme, and anchor-based responsive containers (no fixed pixel layout).
  `Battle.tscn` blocks out the portrait layout budget (top status, battlefield, event spotlight,
  instruction bar).
- [x] `AppState` autoload state machine with a validated transition table (`ALLOWED`): screens call
  `AppState.goto` instead of `change_scene_to_file`, invalid transitions are refused (warning +
  debug-only overlay), and `can_transition` is a pure `static func` so the table is testable
  headlessly.
- [x] Theme typography in `themes/default_theme.tres` (body/label 28, button 32) with
  `UiConfig.FONT_SIZE_HEADING` / `FONT_SIZE_BODY` / `FONT_SIZE_SMALL` wired into every screen
  script's `_ready` as the heading font-size override, so the constants are the single source of
  truth rather than dead code.
- [x] Dev-only `DebugPanel` autoload (layer 100): FPS, frame time, and current scene name refreshed
  every 0.25 s; **F1** toggles visibility, **F2** raises a test error. Fully inert in release builds
  and in pure server exports (`not OS.is_debug_build() or OS.has_feature("server")`).
- [x] `ErrorOverlay` autoload (layer 90) driven by `scenes/ErrorOverlay.tscn`: messages are treated
  as untrusted text — ASCII control characters (including DEL) stripped and length capped at
  `MAX_MESSAGE_LENGTH` = 300 before reaching a `Label`. Node lookups are defensive
  (`get_node_or_null` + `push_error`, documented path contract) so a scene/script drift degrades
  instead of crashing.
- [x] Headless shell test `game/tests/test_shell.gd` (37 assertions): all six scenes load and
  instantiate with a `Control` root, every allowed and forbidden transition pair (including
  `LOBBY → MAIN_MENU`), every `SCENE_PATHS` target exists, safe-zone margins are positive,
  typography constants clear a 20 px readability floor, and `ErrorOverlay._sanitize` strips control
  characters, truncates a 400-char input to exactly 300, and leaves plain text untouched.

Commands run and results:

- `npm run lint` — **PASS** (zero errors/warnings)
- `npm run typecheck` — **PASS** (shared, gateway, dashboard all clean)
- `npm test` — **PASS** (21 tests in 4 files: identity 15, messages 3, schemas 2, health 1)
- Static validation of all `.tscn` / `.gd` files — **PASS** (desk-checked: `load_steps` match the
  declared `ext_resource` counts, every `@onready` path resolves against its scene tree, autoload
  paths in `project.godot` exist)
- Godot headless and interactive runs — **MANUAL STEP REQUIRED** (Godot not installed; see below)

Phase 3 known limitations:

- **Godot is not installed on this machine**, so the live run and the acceptance resize check are
  pending. Run these manually from the `game/` directory:

  ```powershell
  cd "c:\Program Files\Developper\riftcrowd-live\game"
  & "C:\path\to\Godot_v4.3-stable_win64.exe" --headless --script res://tests/test_shell.gd
  & "C:\path\to\Godot_v4.3-stable_win64.exe" --headless --script res://tests/test_protocol.gd
  & "C:\path\to\Godot_v4.3-stable_win64.exe" .
  ```

  Expected: `SHELL TESTS: 37 passed, 0 failed` and `PROTOCOL TESTS: 30 passed, 0 failed` (exit 0).
  The interactive run must boot to the main menu, click through Main Menu → Lobby → Battle →
  Results → Lobby / Main Menu (and Lobby → Main Menu back), toggle the debug panel with F1, raise
  the error overlay with F2 and dismiss it, and stay readable while the window is resized (portrait,
  narrow, and wide) with nothing important entering the safe-zone margins.
- **State only persists in autoloads across scene swaps.** Screens are swapped with
  `change_scene_to_file`, so per-screen node state is discarded; a dedicated `SessionState` autoload
  is recommended before Phase 5/6 need round data to survive transitions.
- **`UiConfig` constants are code-level configuration.** Safe-zone margins and font sizes live in
  GDScript; moving them into a tweakable `Resource` is a Phase 12 (UX/readability) concern.
- **Screen scripts are navigation-only stubs.** Battle regions, lobby factions, and results summary
  are placeholder labels until Phases 5–7 land.

## Phase 4 — completed work

Content-pack system and four launch packs:

- [x] Versioned content-pack schema in `shared/schemas/packs.ts`: `ContentPackSchema` /
  `FactionSchema` carry a required `schemaVersion: 1` literal, are `.strict()`, and bound every
  authored string (ids snake_case, colors `#RRGGBB`, 2–4 factions, 1–8 keywords each).
  `superRefine` enforces unique faction ids and case-insensitive keyword uniqueness across ALL
  factions of a pack.
- [x] Pure keyword helpers in the shared package: `buildKeywordIndex` (lowercased keyword →
  faction id, throws on unvalidated collisions) and `matchJoinKeyword` (untrusted text: 200-char
  inspection cap, trim, lowercase, first-token-only match, never throws; non-string input returns
  `null`). `matchJoinKeyword` reuses a private per-pack-object `WeakMap` index cache;
  `buildKeywordIndex` itself stays exported and pure.
- [x] Four launch packs under `content/packs/<mode>/` (`countries`, `animals`,
  `fan_crews_original`, `cities`), four factions each, plus 20 original placeholder SVGs
  (4 × 4 patterns + 4 pack icons): hand-authored geometry, `viewBox 0 0 256 256`, self-contained,
  each marked as original artwork.
- [x] `npm run validate:packs` (`tools/asset-validation/validate-packs.ts`): schema validation,
  pack-dir/mode match, pack-id uniqueness, `svg/pack_icon.svg` existence, pattern-SVG existence,
  and an SVG self-containment check (`href`, `url(`, `<image`, `<script`, `data:`, `javascript:`,
  `&#58;`, `&#40;` all forbidden, checked lowercased) for icons and patterns. Missing
  `captainScene` files are warnings until Phase 5 ships the scenes.
- [x] Fixtures in `shared/fixtures/`: 2 valid packs (one kept byte-identical to the shipping
  animals pack by a test) and 10 invalid packs, each labelled with its `expectedInvalidPath`.
- [x] TypeScript tests (`gateway/test/packs.test.ts`, 12 tests): launch packs parse with 4
  factions, fixtures parse/reject at the documented Zod path, keyword index contents, collision
  throw, cache purity (fresh index per `buildKeywordIndex` call, identical matches for repeated
  calls and structural clones), matching rules, and hostile-input behavior.
- [x] GDScript mirror `game/scripts/packs/pack_validator.gd` (strict keys, bounds, cross-faction
  rules, error paths like `factions[1].joinKeywords[0]`; `match_join_keyword` takes a Variant and
  returns `""` for non-string input, mirroring the TS guard) and loader
  `game/scripts/packs/pack_loader.gd` (scans `../content/packs` resolved from `res://`, never
  copies packs into `game/`, reports failures with file + reasons, rasterizes SVGs defensively).
- [x] `PackRegistry` autoload (loads once at boot, exposes `packs` / `failures` /
  `select_pack` / `find_pack`) and `PackPreview` screen (`scenes/PackPreview.tscn` +
  `scripts/screens/pack_preview.gd`): one button per pack with the pack icon rasterized from
  `svg/pack_icon.svg` beside it (missing icon degrades silently), faction cards with color
  swatches, sanitized display text, join keywords, and pattern art; failure list below. Reached
  through the new `PACK_PREVIEW` state in `AppState` (menu ↔ preview side trip).
- [x] Headless test `game/tests/test_packs.gd` (61 assertions): shared fixtures parse/reject at
  the documented paths, every launch pack ships 4 factions with `mode` == directory, every pack
  directory carries `svg/pack_icon.svg` at the loader-provided path, `load_packs_from_dir`
  returns 4 packs / 0 failures, keyword index and matching rules mirror TypeScript (including
  the non-string guard), and non-object JSON roots are rejected.

Commands run and results:

- `npm run lint` — **PASS** (zero errors/warnings)
- `npm run typecheck` — **PASS** (shared, gateway, dashboard, tools all clean)
- `npm test` — **PASS** (33 tests in 5 files: identity 15, packs 12, messages 3, schemas 2,
  health 1)
- `npm run validate:packs` — **PASS** (exit 0; `4 pack(s) checked — 0 passed, 4 with warnings,
  0 failed`; exactly 16 warnings, all `captainScene ... not found under game/ (expected —
  captain scenes arrive in Phase 5)`; 0 errors)
- Static validation of all `.tscn` / `.gd` files — **PASS** (desk-checked: `load_steps` match the
  declared `ext_resource` counts, every `@onready` path resolves against its scene tree,
  PackPreview builds its icon/button rows in code, autoload paths in `project.godot` exist)
- Godot headless tests — **MANUAL STEP REQUIRED** (Godot not installed; see below)

Phase 4 known limitations:

- **Godot execution is MANUAL-PENDING.** Godot is not installed on this machine, so the three
  headless suites are desk-checked only. Run manually:

  ```powershell
  cd "c:\Program Files\Developper\riftcrowd-live\game"
  & "C:\path\to\Godot_v4.3-stable_win64.exe" --headless --script res://tests/test_shell.gd
  & "C:\path\to\Godot_v4.3-stable_win64.exe" --headless --script res://tests/test_protocol.gd
  & "C:\path\to\Godot_v4.3-stable_win64.exe" --headless --script res://tests/test_packs.gd
  ```

  Expected: `SHELL TESTS: 43 passed, 0 failed`, `PROTOCOL TESTS: 30 passed, 0 failed`, and
  `PACK TESTS: 61 passed, 0 failed` (each exit 0).
- **`captainScene` targets do not exist yet.** Every launch pack points at
  `res://scenes/units/captain_*.tscn`; the validator reports these as 16 warnings by design.
  Phase 5 ships the scenes, at which point missing targets get promoted to errors.
- **Pack root assumes the repository layout.** The game loads packs from `../content/packs`
  relative to `game/`, so exported/packaged builds need a copy step or a configurable pack root
  in a later phase (documented in `docs/CONTENT_PACK_FORMAT.md` and
  `tools/asset-validation/README.md`).
- **CRLF format drift is pre-existing.** Files on this Windows checkout carry CRLF endings;
  Prettier's check reports the drift repo-wide. Cosmetic only — lint, typecheck, and tests are
  unaffected.
- **SVG rasterization is not exercised headlessly.** `test_packs.gd` checks pack-icon existence
  only; `load_svg_texture` needs the SVG module, so rasterization is verified in the interactive
  PackPreview run.

## Phase 5 — completed work

Autonomous arena simulation core, scenes, sandbox, and tests:

- [x] Headless simulation core (`game/scripts/simulation/`): `SimWorld`, `SimUnit`, `SimRng`,
  `SimProjectile`, `UnitPool`, `ProjectilePool`, `GameplayConfig` — deterministic seeded RNG,
  typed state machines (SPAWNING → ADVANCE → ATTACK ↔ RETREAT → DEFEND → DEAD), combat (melee
  and projectile), death events, pool acquire/release/reuse, capture pressure, Dominion accrual
  with framerate-independent exponential smoothing, fortress health, stage progression (opening →
  crisis → final_surge → sudden_death → ended), victory rules (dominion 100, fortress destruction,
  sudden-death tiebreaker), boss spawn in crisis with capture-bonus reward.
- [x] Two-pass projectile resolution: accumulates all projectile damage before killing units,
  preventing lost hits when multiple projectiles strike the same target in one tick. Kill
  attribution uses `last_hit_faction` on the target (latest projectile to hit wins).
- [x] Deterministic tie-breaker in `_find_nearest_enemy`: equidistant enemies resolved by
  lowest unit id, removing hidden positional bias from pool iteration order.
- [x] Boss pool routing: `_get_pool("boss")` returns the champion pool (singletons reuse the
  large pool), eliminating the dead-code branch in `_resolve_cleanup`.
- [x] `GameplayConfig` validator (`gameplay_config.gd`): loads and validates `game/config/gameplay.json`
  with type, range, and required-key checks; rejects malformed configs with descriptive errors.
- [x] Arena scene (`game/scenes/Arena.tscn` + `scripts/arena/arena.gd`): fortress, crown,
  capture-zone, unit and projectile visual nodes with pooled reuse; `apply_snapshot()` syncs
  every visual from the sim snapshot each frame; `restart()` public method encapsulates
  clear + setup.
- [x] 9 unit scenes: Fortress, Crown, CaptureZone, Champion, Guardian, Striker, Captain,
  Projectile, Boss.
- [x] 16 captain faction scenes (`captain_lions.tscn` through `captain_northern_ravens.tscn`)
  satisfying all pack `captainScene` references — `validate:packs` now reports 0 warnings.
- [x] `SimulationSandbox` (`simulation_sandbox.gd`): wraps `SimWorld` with time-based
  advancement and playback speeds [0.0, 0.5, 1.0, 2.0, 4.0]; tick_budget default 500 covers
  60 fps × 4× × 20 Hz = 4800 ticks/s worst case.
- [x] `BattlePresenter` (`battle_presenter.gd`): bridges sandbox → arena; `setup`, `present`,
  `set_speed`, `toggle_pause`, `restart` (uses `arena.restart()`).
- [x] Updated Battle screen (`scenes/Battle.tscn` + `scripts/screens/battle.gd`): HUD with
  dominion bars, fortress health, stage label, speed/pause controls; pack selection from
  `PackRegistry`.
- [x] Design seam comments in `sim_world.gd`: Phase 6 `enqueue_stage_override` /
  `stage_changed` signal; Phase 8 `enqueue_command` for `GameCommand` injection.
- [x] Headless simulation test `game/tests/test_simulation.gd` (137 assertions): config
  load + parse rejection, determinism, state machine transitions, combat, pooling,
  capture/dominion, fortress victory, sudden death, 5-round full-round acceptance, snapshot
  shape, crisis-stage boss spawn, and ProjectilePool exhaustion.
- [x] Headless sandbox test `game/tests/test_sandbox.gd` (39 assertions): creation, speed
  values, tick counts at 1×/2×/4×, pause, toggle, reset cleanliness, multiple resets,
  speed changes.
- [x] Headless shell test `game/tests/test_shell.gd` (92 assertions): all shell scenes,
  transitions, SCENE_PATHS, UI config, typography, sanitize, arena scene, 9 unit scenes,
  16 captain scenes, sandbox speeds.

Commands run and results:

- `npm run lint` — **PASS** (zero errors/warnings)
- `npm run typecheck` — **PASS** (shared, gateway, dashboard, tools all clean)
- `npm test` — **PASS** (33 tests in 5 files: identity 15, packs 12, messages 3, schemas 2,
  health 1)
- `npm run validate:packs` — **PASS** (exit 0; `4 pack(s) checked — 4 passed, 0 with warnings,
  0 failed`; 0 warnings — captain scenes now exist)
- Static desk-check of all `.gd` / `.tscn` files — **PASS**
- Godot headless tests — **MANUAL STEP REQUIRED** (Godot not installed; see below)

Phase 5 known limitations:

- **Godot execution is MANUAL-PENDING.** Godot is not installed on this machine, so the five
  headless suites are desk-checked only. Run manually:

  ```powershell
  cd "c:\Program Files\Developper\riftcrowd-live\game"
  & "C:\path\to\Godot_v4.3-stable_win64.exe" --headless --script res://tests/test_shell.gd
  & "C:\path\to\Godot_v4.3-stable_win64.exe" --headless --script res://tests/test_protocol.gd
  & "C:\path\to\Godot_v4.3-stable_win64.exe" --headless --script res://tests/test_packs.gd
  & "C:\path\to\Godot_v4.3-stable_win64.exe" --headless --script res://tests/test_simulation.gd
  & "C:\path\to\Godot_v4.3-stable_win64.exe" --headless --script res://tests/test_sandbox.gd
  ```

  Expected: `SHELL TESTS: 92 passed, 0 failed`, `PROTOCOL TESTS: 30 passed, 0 failed`,
  `PACK TESTS: 61 passed, 0 failed`, `SIMULATION TESTS: 137 passed, 0 failed`, and
  `SANDBOX TESTS: 39 passed, 0 failed` (each exit 0).
- **Captains' ultimates/abilities are NOT implemented** until Phase 11 (gift economy).
  Captain units exist as plain combatants only.
- **No command-input hook in SimWorld** until Phase 8. The `enqueue_command(cmd)` seam is
  documented in the file header but not yet wired.
- **No stage-override seam** until Phase 6. Stage progression is driven internally by
  `_advance_stage()`; the `enqueue_stage_override(stage)` / `stage_changed` signal is
  documented but not implemented.
- **No healing** — the `healingAllowed: false` config flag is carried but no healing logic
  exists; reserved for future phases.
- **CRLF format drift is pre-existing.** Files on this Windows checkout carry CRLF endings;
  Prettier's check reports the drift repo-wide. Cosmetic only — lint, typecheck, and tests
  are unaffected.

## Phase 6 — completed work

Match Director and Round Lifecycle (Node.js gateway):

- [x] `MockSimulation` (`gateway/src/director/mock_simulation.ts`): deterministic mulberry32 PRNG,
  20Hz tick rate, stage progression (opening → crisis → final_surge → sudden_death → ended),
  snapshots matching Phase 5 SimWorld shape, `boss_spawned` event at crisis start,
  `victory:<winner>:<victory_type>` event at ended, safety cap (100k ticks).
- [x] `SessionStats` (`gateway/src/director/session_stats.ts`): Zod schema (versioned,
  schemaVersion 1), atomic write (.tmp → rename), load with ENOENT/parse/schema-failure recovery,
  pure `recordRound` function (roundsPlayed++, modeCounts, factionWinCounts, recentModes capped
  at 10 newest-first).
- [x] `MatchDirector` (`gateway/src/director/match_director.ts`): 9-state machine (IDLE →
  MODE_VOTE → FACTION_LOBBY → BATTLE_OPENING → BATTLE_CRISIS → BATTLE_FINAL_SURGE →
  BATTLE_SUDDEN_DEATH → BATTLE_ENDED → RESULTS → MODE_VOTE), mode vote keywords
  (1/countries, 2/animals, 3/clubs→fan_crews_original, 4/cities), first-vote-wins,
  tie-breaking (highest votes → LRU → alphabetical), faction lobby (one switch allowed,
  mock players on empty), creator commands (skip/pause/resume/end/restart).
- [x] Creator commands HTTP API (`gateway/src/director/creator_commands.ts` + routes):
  POST `/director/{skip,pause,resume,end,restart}`, GET `/director/state`, all requiring
  `Authorization: Bearer <LOCAL_SESSION_TOKEN>` (503 if unset, 401 on invalid token, 409 on
  invalid state).
- [x] Director orchestration factory (`gateway/src/director/index.ts`): `createDirector(opts)`
  and `createAndRegisterDirector(app, opts)` wiring MatchDirector + creator routes + stats
  auto-save on RESULTS transition.
- [x] `gateway/config/director.json`: default stage durations matching guide (modeVote 20s,
  factionLobby 35s, opening 120s, crisis 60s, finalSurge 60s, suddenDeath 45s, results 20s).
- [x] `buildApp` wired with `enableDirector` option (opt-in, non-breaking for existing code).
- [x] `gateway/data/` added to `.gitignore` (runtime state).
- [x] 48 tests in `gateway/test/director.test.ts`: MockSimulation determinism (400 ticks),
  stage progression, event emission, snapshot shape; SessionStats load/save/corrupt/schema/atomic
  write/recordRound; MatchDirector state transitions, announcements, mode vote rules, tie-breaking,
  faction join rules; creator commands (skip/pause/resume/end/restart); HTTP endpoint auth (503/401/200);
  10-round acceptance test (stats, recentModes cap, heap growth <2x, clean round-over).
- [x] Docs: `docs/SESSION_STATS_FORMAT.md` (schema, atomic write, corruption recovery),
  `docs/MATCH_DIRECTOR.md` (state diagram, timings, API, limitations).

Commands run and results:

- `npm run lint` — **PASS** (zero errors/warnings)
- `npm run typecheck` — **PASS** (shared, gateway, dashboard, tools all clean)
- `npm test` — **PASS** (81 tests in 6 files: identity 15, packs 12, director 48, messages 3,
  schemas 2, health 1)
- `npm run validate:packs` — **PASS** (exit 0; 4 packs checked, 4 passed, 0 warnings, 0 failed)

Phase 6 known limitations:

- **Godot-side Match Director integration** is Phase 13 dashboard territory. The Node.js
  director is gateway-only; the Godot client does not yet consume director state.
- **Creator commands are Node-only** (HTTP REST). Not exposed to the Godot client until
  Phase 10 (Gateway-to-Godot WebSocket).
- **Faction matching uses synthetic factions** (`faction_alpha`, `faction_beta`). Real
  pack-based faction resolution requires Phase 7+ platform adapter integration.
- **No real viewer engagement data** (gifts, top contributors, free-engagement tracking) —
  results screen data carries placeholder empty arrays. Gift economy is Phase 11.
- **No stage-override seam wired** from the Node director into the Godot SimWorld. Stage
  progression is driven by the MockSimulation in Phase 6; Phase 8 will bridge real sim
  snapshots from the Godot sandbox.
- **CRLF format drift is pre-existing.** Cosmetic only — lint, typecheck, and tests are
  unaffected.

## Phase 1 — quality gate results

- `npm install` — **PASS** (322 packages, 6 audit advisories — upstream deps, non-blocking)
- `npm run lint` — **PASS** (zero errors/warnings)
- `npm run typecheck` — **PASS** (shared, gateway, dashboard all clean)
- `npm test` — **PASS** (3 tests in 2 files, 2.07s)
- Gateway `/health` — **PASS** (HTTP 200, correct JSON shape)
- Dashboard — **PASS** (serves HTML with title "RiftCrowd LIVE — Creator Dashboard", shows
  gateway status)
- Godot project opens — **MANUAL STEP REQUIRED** (Godot not on system PATH)

## Known limitations and deviations

- **Node version.** Node.js v22.16.0 in use; guide recommends Node 24 LTS. No incompatibilities
  observed but documented as deviation.
- **Godot verification is manual.** Godot 4.7.1 is not installed on PATH; opening
  `game/project.godot` is a manual verification step.
- **Shared package ships raw TypeScript.** `shared/` exports raw `.ts` (consumed by tsx/vitest);
  future phases may add a build step if needed for non-tsx consumers.
- **Audit advisories.** 6 npm audit advisories (all in upstream transitive dependencies).

## Phase 9 — completed work

Mock LIVE Adapter and Event Studio:

- [x] **LiveAdapter Interface** (`gateway/src/adapters/live_adapter.ts`): abstract `LiveAdapter`
  interface with `start()`, `stop()`, `onEvent()`, `isConnected()`. `TikTokLiveAdapter` placeholder
  throws NotImplementedError from every method (Phase 14 territory).
- [x] **TestClock** (`gateway/src/adapters/test_clock.ts`): deterministic clock with `now()`,
  `advance(ms)`, `setTime(ms)`, `reset(ms)`, `onAdvance(handler)`. MockLiveAdapter uses TestClock
  instead of `Date.now()` for reproducible scenarios.
- [x] **Scripted Scenarios** (`gateway/src/adapters/scenarios.ts`): 7 deterministic scenarios —
  `normal_traffic` (50 events, 10 viewers, 2 min), `gift_streak` (30 gifts, 1 viewer, 30 s),
  `viral_burst` (200 events, 50 viewers, 10 s stress test), `malformed_payloads` (20 malformed +
  10 valid events), `disconnect` (connection drop mid-stream), `reconnect` (disconnect + reconnect +
  resume), `four_mode_round` (full round: mode vote → faction lobby → battle → results → next
  mode vote, ~6 min). Builder helpers: `makeChatEvent`, `makeGiftEvent`, `makeLikeEvent`,
  `makeJoinEvent`, `makeMalformedEvent`. Scenario registry with `getScenario(name)` and
  `listScenarios()`.
- [x] **MockLiveAdapter** (`gateway/src/adapters/mock_live_adapter.ts`): scenario-driven adapter
  that plays back events at scheduled timestamps via TestClock. Integrates with Pipeline (processes
  events) and MatchDirector (feeds chat events, advances time for state transitions). Disconnect/
  reconnect markers toggle `isConnected()` state. `runToEnd(stepMs)` advances clock in increments
  until all events are emitted.
- [x] **Recording** (`gateway/src/adapters/recording.ts`): `RecordedSession` Zod schema
  (schemaVersion 1: events, commands, directorSnapshots, recordedAt). `SessionBuilder` for
  incremental construction. `saveSession(path)` uses atomic write (tmp + rename). `loadSession(path)`
  reads and Zod-validates with clear error messages.
- [x] **Replay** (`gateway/src/adapters/replay.ts`): `ReplayAdapter` replays a RecordedSession at
  recorded timestamps. Deterministic: same session → same event sequence → same commands.
- [x] **Dashboard Endpoints** (`gateway/src/routes/mock_routes.ts`): 6 token-protected endpoints —
  POST `/mock/start`, `/mock/stop`, `/mock/advance`, `/mock/record`, `/mock/replay`; GET
  `/mock/state`. Token auth on all `/mock/*` endpoints. Start/stop/advance/record/replay/state
  with full observability.
- [x] **CLI Tool** (`tools/cli/mock-live.ts`): `--scenario=<name>` or `--replay=<path>`, optional
  `--record=<path>` and `--list`. Progress bar and live command count to stdout.
- [x] **App Integration** (`gateway/src/app.ts`): mock routes registered when pipeline is enabled
  (opt-out via `enableMockRoutes: false`).
- [x] **74 tests** in `gateway/test/mock_adapter.test.ts`: LiveAdapter interface (4), TestClock (11),
  Scenarios (12), MockLiveAdapter (9), Recording (8), Replay (5), Dashboard endpoints (11),
  four_mode_round integration (14).
- [x] Docs: `docs/MOCK_LIVE_ADAPTER.md` (interface, scenarios, CLI, dashboard endpoints,
  recording/replay, TestClock semantics).

Commands run and results:

- `npm run lint` — **PASS** (zero errors/warnings)
- `npm run typecheck` — **PASS** (shared, gateway, dashboard, tools all clean)
- `npm test` — **PASS** (387 tests in 10 files: gateway_core 123, mock_adapter 74, viewer 74,
  director 61, viewer_fixes 22, identity 15, packs 12, messages 3, schemas 2, health 1)
- `npm run validate:packs` — **PASS** (exit 0; 4 packs checked, 4 passed, 0 warnings, 0 failed)

Phase 9 known limitations:

- **TikTokLiveAdapter is a stub.** Every method throws NotImplementedError. Real TikTok integration
  is Phase 14 territory.
- **Gift mechanics not implemented in Phase 9 scenarios.** Gift events are emitted (gift_streak
  scenario) but Phase 11 will add gameplay effects (captain ultimates, energy bursts).
- **Rate limiter uses real time.** The pipeline's RateLimiter uses `Date.now()`, not TestClock.
  Rate limiting behavior during scenario playback depends on real wall-clock speed.
- **Director time advancement is approximate.** The adapter advances director time in integer-second
  increments based on TestClock delta, which may differ slightly from real-time pacing.
- **Strategy commands have no game mechanics.** The CommandParser recognizes focus/defend/push/retreat
  keywords (used in four_mode_round battle phase) but no gameplay effects are implemented.
- **CRLF format drift is pre-existing.** Cosmetic only — lint, typecheck, and tests are unaffected.

## Next phase

**Phase 15 — Visual Effects, Audio, and TikTok Readability** (per the guide):
Transform the functional game into an attention-grabbing show.

## Phase 14 — completed work

TikFinity Adapter — real provider integration isolated behind the LiveAdapter interface:

- [x] **TikFinityAdapter** (`gateway/src/adapters/tikfinity_adapter.ts`): implements `LiveAdapter`
  interface (start/stop/onEvent/isConnected). Configurable WebSocket URL (no hardcoded unstable
  URLs); URL validated to start with `ws://` or `wss://`. Connects to TikFinity local LIVE
  WebSocket. Subscribes to all supported event types (chat, like, follow, share, subscription,
  gift). Parses incoming JSON payloads with Zod validation per event type. Maps each TikFinity
  event into `NormalizedLiveEvent`. Exponential backoff reconnect (configurable base, 30s cap,
  max 10 retries). Heartbeat ping/pong (configurable interval, 5s pong timeout); `sendPing`
  clears existing `pongTimer` before creating a new one. `handleClose(code, reason)` captures
  and logs close code + reason. Malformed payloads and unknown event types dropped with warning
  (never crash). Unknown fields stripped by Zod for forward compatibility. Event counter is an
  instance field (FIX 1) + per-instance `instanceSalt` for cross-instance uniqueness; `rawHash`
  computes real SHA-256 of raw JSON payload (FIX 11). Optional `onFatal` callback fires when
  max reconnect attempts are reached (FIX 8).
- [x] **Config Schema** (`gateway/src/config.ts`): `tikfinity` config block with `url`, `token`,
  `reconnectMs`, `heartbeatMs`, `enabled`. Reads from `TIKFINITY_URL`, `TIKFINITY_TOKEN`,
  `TIKFINITY_RECONNECT_MS`, `TIKFINITY_HEARTBEAT_MS` env vars. Defaults: `enabled: false`,
  `url: 'ws://127.0.0.1:23184/ws'`, `reconnectMs: 5000`, `heartbeatMs: 30000`. Zod-validated.
- [x] **Provider Selection** (`gateway/src/app.ts` + `gateway/src/server.ts`): `LIVE_PROVIDER`
  env supports `'mock'` (default) or `'tikfinity'`. MockLiveAdapter remains default (no internet
  required). TikFinity adapter wired when `LIVE_PROVIDER=tikfinity`. Unknown values rejected
  (exit 1). Mock routes only exposed in mock provider mode. `server.ts` derives
  `isMockProvider` / `isTikfinity` from Zod-validated `config.liveProvider` (FIX 6 — dead-code
  belt-and-suspenders guard removed).
- [x] **Redacted Raw Fixtures** (`gateway/test/fixtures/tikfinity/`): 6 representative fixtures
  (chat, like, follow, share, subscription, gift). All secrets and personal data redacted with
  synthetic placeholders (user_001, viewer_alpha, example.com URLs).
- [x] **Fixture Replay Tests** (`gateway/test/tikfinity_replay.test.ts`): 12 tests loading each
  fixture, feeding through parser, asserting NormalizedLiveEvent shape, pipeline integration,
  dedup, malformed drop.
- [x] **Adapter Tests** (`gateway/test/tikfinity_adapter.test.ts`): 40 tests covering config
  schema (5), Zod parsing (14), event mapping (9), connection lifecycle (7), fault tolerance (5).
- [x] **Acceptance Test** (`gateway/test/tikfinity_acceptance.test.ts`): 1 test with 34+
  assertions — 52 events (8-10 per type + unknown-drop probe), all flow through adapter →
  pipeline → event bus. Command emission verified (`JOIN_FACTION` from faction_alpha chat,
  `PAUSE_EVENTS` from `!pause` chat) (FIX 2). Disconnect tolerance, malformed drop, and
  unknown event type drop (FIX 3) all asserted.
- [x] **Config Tests** (`gateway/test/config_tikfinity.test.ts`): 7 tests for config validation,
  defaults, and overrides.
- [x] **Docs** (`docs/PROVIDER_TIKFINITY.md`): overview, configuration, event mapping table,
  fault handling, redacted fixtures, known limitations.
- [x] **LiveAdapter stub preserved**: `TikTokLiveAdapter` in `live_adapter.ts` remains as
  backward-compatible stub (Phase 9 tests unaffected).

Commands run and results:

- `npm run lint` — **PASS** (zero errors/warnings)
- `npm run typecheck` — **PASS** (shared, gateway, dashboard, tools all clean)
- `npm test` — **PASS** (804 tests: 719 gateway + 85 dashboard, all passing)
  - New: 66 tests (config 9, adapter 42, replay 13, acceptance 1/34+ assertions)
  - Previous: 738 tests from Phases 1-13
- `npm run validate:packs` — **PASS** (exit 0; 4 packs checked, 4 passed, 0 warnings, 0 failed)
- `npm run build` (dashboard) — **PASS** (dist/ with index.html + 278 KB JS, ~81 KB gzipped)

Phase 14 review fixes applied (9 total, from Tina/Jack/Sam triple review):

**Critical:**
1. `tikfinity_adapter.ts` — module-level `eventCounter` moved to instance field; per-instance
   `instanceSalt` added via `randomUUID().slice(0,8)` for cross-instance uniqueness.
2. `tikfinity_acceptance.test.ts` — command emission now asserted (`JOIN_FACTION`, `PAUSE_EVENTS`).
3. `tikfinity_acceptance.test.ts` — unknown event type drop scenario added (3-part fault coverage).

**Warnings:**
4. `tikfinity_adapter.ts` — `handleClose(code, reason)` now captures and logs WebSocket close
   code + reason (was blind to normal vs abnormal shutdown).
5. `tikfinity_adapter.ts` — `sendPing()` clears existing `pongTimer` before creating new one
   (prevents orphaned timers).
6. `server.ts` — dead-code belt-and-suspenders provider guard removed; now derives
   `isMockProvider` / `isTikfinity` from Zod-validated `config.liveProvider`.
7. `config.ts` + `tikfinity_adapter.ts` — `TIKFINITY_URL` validated to start with `ws://` or
   `wss://` (both env schema and `TikFinityConfigSchema.url`).
8. `tikfinity_adapter.ts` — `onFatal` callback added to `TikFinityAdapterOptions`; fires when
   max reconnect attempts are reached (observable signal for Phase 18 monitoring).

**Suggestions:**
11. `tikfinity_adapter.ts` — `rawHash` now computes real SHA-256 of raw JSON payload (was
    misleading `sha256:tikfinity_{counter}` placeholder; now 64-hex-char actual hash).

Deferred (tracked in limitations):
- FIX 9: `/health` or `/status` endpoint does not yet expose `providerConnected: boolean`
  (Phase 18 observability scope).
- FIX 10: `PROVIDER_TIKFINITY.md` does not yet include production deployment guidance
  (firewall rules, token rotation, systemd service, log aggregation — Phase 18 scope).

Phase 14 known limitations:

- **Subscription mapping.** `subscription` events map to `subscribe` type. The `months` field
  is not carried because the shared schema lacks it. Schema extension needed if gameplay uses
  subscription duration.
- **Heartbeat assumption.** Uses standard WebSocket ping/pong frames. TikFinity may use
  application-level heartbeats — verify against actual TikFinity instance.
- **URL stability.** Default `ws://127.0.0.1:23184/ws` may change across TikFinity versions.
  Always configure via `TIKFINITY_URL` env var.
- **Raw payload shape assumed.** Without authoritative TikFinity API docs, Zod schemas are
  based on common patterns. `.strip()` ensures forward compatibility but field names may
  need adjustment.
- **No authentication flow.** Optional token query param only; no OAuth or handshake.
- **Godot not installed.** All gateway-side code tested via Vitest. Godot client integration
  not exercised.
- **Provider connection not observable from `/health`.** `providerConnected: boolean` is not
  yet exposed on the health endpoint; Phase 18 will need this for production monitoring when
  the adapter permanently disconnects after max retries (FIX 9 deferred).
- **Production deployment guidance missing.** `PROVIDER_TIKFINITY.md` covers local dev but
  omits firewall rules, token rotation, systemd/Windows service setup, and log aggregation
  (FIX 10 deferred to Phase 18).
- **CRLF format drift is pre-existing.** Cosmetic only — lint, typecheck, and tests unaffected.

## Phase 12 — completed work

Free Engagement Mechanics:

- [x] **Free Engagement Config** (`gateway/src/engagement/free_engagement_config.ts`): Zod-validated
  config with like milestones (4 monotonic thresholds enforced via `superRefine`), follow guardian,
  share shield, strategy vote, free energy ability, spam filter, top contributor, and per-faction bounds.
- [x] **Spam Filter** (`gateway/src/engagement/spam_filter.ts`): per-viewer sliding-window rate
  limiter for chat events. Configurable maxCommentsPerWindowMs and windowMs. Chat-only (FIX 9).
- [x] **Like Milestone Aggregator** (`gateway/src/engagement/like_milestone_aggregator.ts`):
  cumulative per-faction like counts. Fires ADD_ENERGY/ADD_SCORE commands at configurable thresholds.
- [x] **Follow Guardian** (`gateway/src/engagement/follow_guardian.ts`): follow events spawn
  temporary Guardian champions. Per-viewer cooldown + per-faction bound enforcement.
- [x] **Share Shield** (`gateway/src/engagement/share_shield.ts`): share events apply temporary
  shield buffs. Per-viewer cooldown + per-faction bound.
- [x] **Strategy Vote** (`gateway/src/engagement/strategy_vote.ts`): `!strategy <option>` chat
  votes aggregated per-faction within a time window. Fires `STRATEGY_VOTE` command (FIX 2) when
  minVotes reached. Duplicate vote prevention within configurable window.
- [x] **Free Energy Ability** (`gateway/src/engagement/free_energy_ability.ts`): `!ability` chat
  command adds energy. Per-viewer cooldown + max per round.
- [x] **Top Contributor** (`gateway/src/engagement/top_contributor.ts`): weighted contribution
  tracking (like=1, follow=5, share=5, vote=1, ability=1 — FIX 6). DISPLAY_SPOTLIGHT at round end.
- [x] **Free Engagement Rule** (`gateway/src/engagement/free_engagement_rule.ts`): CommandRule
  implementation. `applies()` narrowed to engagement events only (FIX 7): like, follow, share,
  `!strategy`, `!ability`. Regular chat filtered out.
- [x] **Free Engagement Orchestrator** (`gateway/src/engagement/free_engagement.ts`): facade
  wiring all subsystems. `processEvent()`, `getStats()`, `getTopContributors()`, `reloadConfig()`.
- [x] **HTTP Routes** (`gateway/src/routes/engagement_routes.ts`): 4 token-protected endpoints —
  GET/POST /engagement/config, GET /engagement/stats, GET /engagement/top.
- [x] **GDScript Bridge** (`game/scripts/engagement/free_engagement.gd`): subscribes to
  CommandDispatcher signals (follow_guardian, share_shield, strategy_vote, free_energy_ability,
  add_score). Tracks active guardians/shields per faction with expiry cleanup.
- [x] **HUD** (`game/scenes/ui/FreeEngagementInstructions.tscn`): non-intrusive instructions
  displayed in Battle scene.
- [x] **COMMAND_SCHEMA_VERSION bumped to 3** (`shared/schemas/commands.ts`): added
  FOLLOW_GUARDIAN, SHARE_SHIELD, STRATEGY_VOTE, FREE_ENERGY_ABILITY, ADD_SCORE.
- [x] **Config** (`gateway/config/free_engagement.json`): sensible defaults for all subsystems.
- [x] **Tests** (`gateway/test/free_engagement_fixture.test.ts`): 75 tests covering config
  schema (3), spam filter (6), like milestones (8), follow guardian (6), share shield (6),
  strategy vote (10), free energy ability (6), top contributor (9+weight ratio), free engagement
  rule (10), orchestrator (5), HTTP endpoints (5), acceptance fixture (14 assertions, 994 events).
- [x] **Docs** (`docs/FREE_ENGAGEMENT.md`): architecture, config table, command schema,
  top contributor weights, spam filter, Godot integration, known limitations.

Commands run and results:

- `npm run lint` — **PASS** (zero errors/warnings)
- `npm run typecheck` — **PASS** (shared, gateway, dashboard all clean)
- `npm test` — **PASS** (645+ tests across all files; 1 pre-existing flaky LRU perf test)
- `npm run validate:packs` — **PASS** (exit 0; 4 packs checked, 4 passed, 0 warnings, 0 failed)

Phase 12 review fixes applied (9 fixes):

- **FIX 1** (critical): Acceptance fixture rewritten with 994 events across 50+ viewers.
  alpha_power achieves 11 points (follow + share + ability). `alphaTop >= 10` passes.
- **FIX 2** (critical): `strategy_vote.ts` emits `STRATEGY_VOTE` instead of `CAST_ABILITY`.
  Orchestrator stats tracking updated. All tests updated.
- **FIX 3** (major): `PROJECT_STATUS.md` updated — Phase 12 marked COMPLETED, next phase
  is Phase 13, Phase 12 completed-work section added.
- **FIX 4** (major): Acceptance fixture expanded to 994 events across ~50 viewers and both
  factions. Includes milestone 3+4, spam saturation, follow/shield bounds, strategy vote
  volume, top contributor ranking.
- **FIX 5** (major): `STRATEGY_VOTE` command type now emitted by strategy_vote.ts (was
  declared but unused). `FREE_ENGAGEMENT.md` updated to reflect actual command vocabulary.
- **FIX 6** (major): Top contributor weights corrected — share 3→5, vote 2→1, ability 2→1.
  Follow=share=5 (high-impact), like=vote=ability=1 (low-impact). Weight ratio test added.
- **FIX 7** (major): `FreeEngagementRule.applies()` narrowed to engagement chat only
  (`!strategy` / `!ability`). Regular chat returns false. Spam filter test updated.
- **FIX 8** (minor): `FreeEngagementConfigSchema.superRefine()` enforces monotonic
  milestone thresholds. Non-monotonic config rejected. Test added.
- **FIX 9** (minor): `FREE_ENGAGEMENT.md` documents that spam filter is chat-only.
  Like/follow/share floods handled by pipeline rate limiter and cooldowns instead.

Phase 12 known limitations:

- **Godot NOT installed.** All GDScript is hand-authored and desk-checked only.
- **Hot-reload resets all in-flight state.** `reloadConfig()` replaces all internal components.
- **Single-server only.** Each gateway instance maintains its own engagement state.
- **Dashboard UI not wired.** Creator Dashboard (Phase 13) will add UI controls.
- **Spam filter is chat-only.** Like/follow/share floods handled by cooldowns, not spam filter.
- **CRLF format drift is pre-existing.** Cosmetic only.

## Phase 11 — completed work

Gift Economy, Streaks, and Burst Aggregation:

- [x] **Gift Config Schema** (`gateway/src/gifts/gift_config.ts`): Zod-validated config
  with 3 tiers (Spark/Flare/Nova), 20 gift mappings, 5 cooldown timers, overflow rules,
  streak mechanics, and unit bounds. `superRefine` cross-validates that mapping tierId
  values reference existing tiers.
- [x] **GiftMapper** (`gateway/src/gifts/gift_mapper.ts`): resolves gift ID + repeat count
  to tier impact (type, magnitude, cinematic, duration). Preview table for dashboard.
  Unknown gift IDs logged as warnings and return null.
- [x] **StreakAggregator** (`gateway/src/gifts/streak_aggregator.ts`): per-viewer, per-tier
  streak detection within a sliding window. Configurable minCount and multiplier.
  No double counting — once a streak fires, no new streak until window elapses.
- [x] **CooldownManager** (`gateway/src/gifts/cooldown_manager.ts`): 5 independent timers
  (perUser, perFaction, ability, cinematic, global). Cinematic cooldown keyed on
  tierId for `start_world_event` and `display_spotlight` impacts.
- [x] **OverflowConverter** (`gateway/src/gifts/overflow_converter.ts`): unit-bound
  enforcement with reserve energy/score conversion. Reserve capped at 1,000,000.
  `reserveAdded` reports net (clamped) amount, not gross.
- [x] **GiftRule** (`gateway/src/gifts/gift_rule.ts`): pipeline rule implementing the
  full mapper → cooldown → overflow → streak → command pipeline. Faction resolved via
  ViewerRegistry lookup (Phase 7 contract) with hash fallback. Streaks recorded only
  on happy path (after cooldown and overflow checks).
- [x] **GiftEconomy** (`gateway/src/gifts/gift_economy.ts`): orchestrator wiring all
  components. `processGiftEvent()` returns decisions. `reloadConfig()` hot-reloads
  all internals (resets in-flight state). `getStats()` and `previewMappings()` for
  dashboard.
- [x] **HTTP Routes** (`gateway/src/routes/gift_routes.ts`): 4 token-protected endpoints —
  GET /gifts/config, POST /gifts/config (hot-reload), GET /gifts/preview, GET /gifts/stats.
- [x] **App Integration** (`gateway/src/app.ts`): proxy rule registration ensures
  hot-reload doesn't leave pipeline with stale GiftRule reference. ViewerRegistry
  faction lookup injected into GiftEconomy constructor.
- [x] **GDScript Bridge** (`game/scripts/net/command_dispatcher.gd`): `gift_apply` signal
  declared; routing arm for GIFT_APPLY command type.
- [x] **COMMAND_SCHEMA_VERSION bumped to 2** (`shared/schemas/commands.ts`): signals
  expanded command vocabulary with GIFT_APPLY.
- [x] **Config** (`gateway/config/gifts.json`): 3 tiers, 20 mappings, sensible defaults
  for cooldowns, overflow, streaks, bounds.
- [x] **Tests** (`gateway/test/gift_economy.test.ts`, `gift_fixture.test.ts`,
  `gift_routes.test.ts`): 84+ tests covering schema validation, mapper, streak,
  cooldown, overflow, rule pipeline, orchestrator, HTTP endpoints, 1,000-event
  acceptance fixture.
- [x] **Docs** (`docs/GIFT_ECONOMY.md`): architecture, tiers, mappings, streaks,
  cooldowns, overflow, endpoints, fixture methodology, known limitations.

Commands run and results:

- `npm run lint` — **PASS** (zero errors/warnings)
- `npm run typecheck` — **PASS** (shared, gateway, dashboard all clean)
- `npm test` — **PASS** (564+ tests across all files)
- `npm run validate:packs` — **PASS** (exit 0; 4 packs checked, 4 passed, 0 warnings,
  0 failed)

Phase 11 review fixes applied (12 fixes from triple review):

- **FIX 1** (lint): Added `argsIgnorePattern: '^_'`, `varsIgnorePattern: '^_'` to
  ESLint config for `_`-prefixed unused vars. Removed unused `factions` var and
  `config` param from fixture test.
- **FIX 2** (critical): Proxy rule registration in app.ts ensures hot-reload
  delegates to current `giftEconomy.getRule()`, not stale reference.
- **FIX 3** (critical): `impactId` now passed to `canFire()` and `markFired()` for
  cinematic impacts — cinematic cooldown (30s) is actually enforced.
- **FIX 4** (major): Faction resolved via ViewerRegistry lookup (`getFaction`
  callback injected into GiftRule). Hash fallback only when no registered faction.
- **FIX 5** (major): Streak recording moved AFTER cooldown and overflow checks.
  Cooldown-blocked gifts no longer waste streaks.
- **FIX 6** (major): Fixture test split into economy-only and pipeline-only passes
  to avoid double-processing shared streak/cooldown state.
- **FIX 7** (major): `reserveAdded` now reports net (clamped) amount when reserve
  is near MAX_RESERVE, not gross calculated amount.
- **FIX 8** (minor): Public `getMultiplier()` getter on StreakAggregator replaces
  bracket-notation private access.
- **FIX 9** (minor): `superRefine` on GiftEconomyConfigSchema cross-validates
  mapping tierId values against tiers array.
- **FIX 10** (docs): Created `docs/GIFT_ECONOMY.md`.
- **FIX 11** (status): Updated `PROJECT_STATUS.md` with Phase 11 section.
- **FIX 12** (version): Bumped `COMMAND_SCHEMA_VERSION` from 1 to 2.

Phase 11 known limitations:

- **Hot-reload resets all in-flight state.** `reloadConfig()` replaces all internal
  components — streaks, cooldowns, and reserve are reset to initial state.
- **Godot-side gift effects are deferred.** `GIFT_APPLY` command type and GDScript
  signal exist, but actual gameplay effects are not yet wired.
- **Single-server only.** Each gateway instance maintains its own gift economy state.
- **Godot NOT installed.** All GDScript is hand-authored and desk-checked only.
- **CRLF format drift is pre-existing.** Cosmetic only — lint, typecheck, and tests
  are unaffected.

## Phase 10 — completed work

Gateway-to-Godot WebSocket Integration:

- [x] **WS Protocol Schema** (`shared/schemas/ws_protocol.ts`): Zod discriminated union
  covering 10 message types (handshake, handshake_ack, heartbeat_ping, heartbeat_pong,
  command, command_ack, snapshot, error, reconnect, disconnect). `WS_PROTOCOL_VERSION = 1`
  (independent from Phase 2 HTTP protocol version). All schemas `.strict()` with bounded
  string lengths.
- [x] **WebSocket Server** (`gateway/src/ws/ws_server.ts`): raw `ws` package attached to
  Fastify HTTP server at `/ws/game`. Token auth via `verifyClient` with `timingSafeEqual`.
  Handshake flow with protocol version check. Heartbeat ping/pong with timeout.
  Command broadcast from pipeline event bus. Idempotent delivery via bounded
  `Set<string>` of `clientId:messageId` pairs.
- [x] **Bounded Retry Buffer** (`gateway/src/ws/retry_buffer.ts`): Map-based buffer
  (default capacity 1000). Eviction: oldest ACKED first, then oldest unacked
  (ring-buffer). `getRange(fromSeq, toSeq)` for snapshot building. Monotonic
  sequence numbers.
- [x] **Idempotent Command Handling**: server dedup via bounded set with FIFO eviction
  (default 500). Client-side: `_last_applied_sequence` tracking; commands with
  seq ≤ lastApplied get `command_ack` status='duplicate'.
- [x] **Config** (`gateway/config/ws.json`): heartbeatIntervalMs 5000, heartbeatTimeoutMs
  15000, retryBufferCapacity 1000, maxReconnectBackoffMs 30000, idempotencyWindowSize
  500. Zod-validated env vars in `config.ts`.
- [x] **App Integration** (`gateway/src/app.ts`): `enableWs: true` option creates
  WsServer, attaches via `onReady` hook, closes via `onClose` hook. Decorates
  FastifyInstance with `wsServer`.
- [x] **Godot WS Client** (`game/scripts/net/ws_client.gd`): GDScript 2.0 class using
  `WebSocketPeer`. Exponential backoff reconnect (1s→30s). Signals: handshake_completed,
  command_received, snapshot_received, disconnected, error_received. Idempotent command
  application.
- [x] **Command Dispatcher** (`game/scripts/net/command_dispatcher.gd`): routes commands
  by type to subsystem signals (faction_join, spawn_champion, add_energy, add_shield,
  spawn_squad, cast_ability, start_world_event, display_spotlight, pause_events,
  end_round). gift_apply (signal declared; routing deferred to Phase 11).
- [x] **Connection Status HUD** (`game/scripts/ui/connection_status.gd` + scene):
  non-intrusive 32×32 icon + label. States: CONNECTING (yellow), CONNECTED (green),
  DISCONNECTED (red), RECONNECTING (orange). Added to Battle scene.
- [x] **86 tests**: ws_protocol (18), ws_retry_buffer (11), ws_server (26),
  ws_integration (10), ws_acceptance (11), ws_fixes (10).
- [x] Docs: `docs/WEBSOCKET_INTEGRATION.md` (protocol messages, connection flow,
  idempotency, retry buffer, reconnect, HUD, config).

Commands run and results:

- `npm run lint` — **PASS** (zero errors/warnings)
- `npm run typecheck` — **PASS** (shared, gateway, dashboard all clean)
- `npm test` — **PASS** (480 tests in 17 files: gateway_core 123, mock_adapter 74,
  viewer 74, director 61, ws_server 26, viewer_fixes 22, ws_protocol 18, identity 15,
  ws_retry_buffer 11, ws_integration 10, ws_acceptance 11, ws_fixes 10, packs 12,
  messages 3, schemas 2, health 1, cli 3)
  - 1 pre-existing flaky perf test (LRU DedupeStore < 100ms threshold) fails on
    Windows under load; passes in isolation. Documented in limitations.
- `npm run validate:packs` — **PASS** (exit 0; 4 packs checked, 4 passed, 0 warnings,
  0 failed)

Phase 10 review fixes applied (9 fixes from triple review):

- **FIX 1** (critical): Zod schema validation in `handleHandshakeAck`, `handleHeartbeatPong`,
  `handleCommandAck` — replaced unsafe `String()`/`Number()` coercion with
  `WsHandshakeAckSchema.safeParse()`, `WsHeartbeatPongSchema.safeParse()`,
  `WsCommandAckSchema.safeParse()`. 10 new tests in `ws_fixes.test.ts`.
- **FIX 2** (critical): Mandatory protocol version check on server (removed `!== undefined`
  guard) and client (changed to `pv == null or int(pv) != PROTOCOL_VERSION`). 2 new tests.
- **FIX 3** (critical): Added `wsServer: WsServer` to `IntegrationCtx` and `AcceptanceCtx`,
  populated from `app.wsServer!`. Previously-skipped assertions now execute.
- **FIX 4** (major): Idempotency test now sets up a new message collector after ACK before
  re-broadcast, with explicit `expect(dupCmds).toHaveLength(0)` assertion.
- **FIX 5** (major): ConnectionStatus HUD branches on `ws_client.auto_reconnect_enabled()`
  — shows DISCONNECTED on graceful disconnect, RECONNECTING only when auto-reconnect is on.
- **FIX 6** (major): Fixed `docs/WEBSOCKET_INTEGRATION.md` command table — removed
  non-existent `MODE_VOTE`, `GIFT_APPLY`, `KICK_VIEWER`, `PAUSE_ROUND`; added actual
  command types from `GameCommandTypeSchema`.
- **FIX 7** (minor): Deprecated `currentSequenceNumber` getter in `RetryBuffer`;
  `nextSequenceNumber` is now the canonical name. `WsServer` uses `nextSequenceNumber`
  internally.
- **FIX 8** (minor): Added `if (!this.clients.has(ws)) return` early-exit guard in
  `handleDisconnect` to prevent double cleanup from `error` + `close` events.
- **FIX 9** (minor): Marked `gift_apply` signal as Phase 11 hook in `command_dispatcher.gd`
  and `PROJECT_STATUS.md`.

Phase 10 known limitations:

- **Godot NOT installed.** All GDScript (`ws_client.gd`, `command_dispatcher.gd`,
  `connection_status.gd`) is hand-authored and desk-checked only. No runtime validation.
- **`/ws/dashboard` deferred to Phase 13.** Only `/ws/game` is delivered in Phase 10.
- **Gift commands flow but Phase 11 mechanics not implemented.** `gift_apply` signal is
  declared in CommandDispatcher but the `GIFT_APPLY` dispatch case and GiftEconomy
  subsystem are a Phase 11 stub.
- **Heartbeat is server-initiated only.** The Godot client responds to pings but does
  not independently detect stale connections.
- **Single-server only.** Each gateway instance maintains its own retry buffer; no
  clustering or cross-instance state sharing.
- **Performance test is flaky on Windows.** `gateway_core.test.ts` LRU DedupeStore perf
  test (< 100ms threshold) occasionally exceeds limit under load. Passes in isolation.

## Phase 7 — completed work

Viewer Identity and Faction Participation (Node.js gateway):

- [x] `ViewerProfile` (`gateway/src/viewer/viewer_profile.ts`): Zod schema (strict,
  schemaVersion 1) with viewerId, providerHandle, sanitized displayName, firstSeenAt,
  lastSeenAt, optional factionId, switchCount, isHidden, contributionCategories
  (combat/defense/engagement/gifts all 0 initially), roundsParticipated.
- [x] `sanitizeDisplayName(raw, maxLength?)`: strips ASCII control chars (0x00–0x1F,
  0x7F), strips zero-width Unicode chars (U+200B, U+200C, U+200D, U+FEFF), trims,
  caps at maxLength (default 64). Never throws on any input (null/undefined/number/
  object/Buffer all coerced to "").
- [x] `ViewerRegistry` (`gateway/src/viewer/viewer_registry.ts`): session-scoped
  Map<viewerId, ViewerProfile>. Methods: getOrCreate (dedup with object identity,
  updates lastSeenAt, re-sanitizes displayName on change), get, hide, unhide,
  resetSession, list.
- [x] `CommandParser` (`gateway/src/viewer/command_parser.ts`): discriminated union
  return type (ModeVoteCommand, JoinFactionCommand, StrategyCommand,
  UnrecognizedCommand). Mode vote keywords (1/countries through 4/cities), faction
  keywords via matchJoinKeyword against ContentPack or synthetic faction IDs,
  strategy keywords (configurable: focus/defend/push/retreat). Case-insensitive,
  first-token rule, 200-char cap.
- [x] `ChampionSpawner` (`gateway/src/viewer/champion_spawner.ts`): emits
  SPAWN_CHAMPION GameCommand once per viewer per round (keyed on viewerId, not
  factionId). resetRound() clears spawned set.
- [x] `ContributionTracker` (`gateway/src/viewer/contribution_tracker.ts`): per-viewer
  integer counters for combat, defense, engagement, gifts. Cap at 1,000,000 per
  category. getTopContributor, getViewerContributions. resetRound() zeroes counters.
- [x] MatchDirector integration (`gateway/src/director/match_director.ts`): new
  handleChatEvent method (parses via CommandParser, dispatches to handleModeVote/
  handleFactionJoin, spawns champion, records engagement). hideViewer/unhideViewer
  methods. Hidden viewers rejected from faction joins. RESULTS→MODE_VOTE transition
  resets championSpawner and contributionTracker, increments roundsParticipated.
  restart() also resets viewer round-scoped state.
- [x] `gateway/config/viewer.json`: displayNameMaxLength 64, chatCommandMaxLength 200,
  contributionCategoryCap 1000000, strategyKeywords [focus,defend,push,retreat].
  Loaded in app.ts with Zod validation and fallback defaults.
- [x] 74 tests in `gateway/test/viewer.test.ts`: ViewerProfile sanitization (13 tests),
  schema validation (4 tests), ViewerRegistry deduplication (8 tests), CommandParser
  (22 tests), ChampionSpawner (7 tests), ContributionTracker (8 tests), acceptance
  gate (3 tests), MatchDirector integration (8 tests), viewer.json config (1 test).
- [x] Docs: `docs/VIEWER_IDENTITY.md` (schema, sanitization rules, command parsing,
  contribution categories, moderation, configuration).

Commands run and results:

- `npm run lint` — **PASS** (zero errors/warnings)
- `npm run typecheck` — **PASS** (shared, gateway, dashboard, tools all clean)
- `npm test` — **PASS** (168 tests in 7 files: viewer 74, director 61, identity 15,
  packs 12, messages 3, schemas 2, health 1)
- `npm run validate:packs` — **PASS** (exit 0; 4 packs checked, 4 passed, 0 warnings,
  0 failed)

Phase 7 known limitations:

- **Strategy commands are parsed but have no game mechanics.** The CommandParser
  recognizes focus/defend/push/retreat keywords and returns StrategyCommand, but
  no gameplay effects are implemented until Phase 8+.
- **Godot-side champion name display** is Phase 13 dashboard territory. The
  SPAWN_CHAMPION GameCommand carries the sanitized displayName, but the Godot
  client does not yet consume it.
- **Gift contribution tracking** requires Phase 11 gift economy integration.
  The `gifts` counter exists but is never incremented in Phase 7.
- **Cross-session viewer persistence** is not implemented. Profiles are
  session-scoped and cleared on process restart.
- **Combat/defense contribution recording** has no triggers in Phase 7. Only
  `engagement` is recorded (for every chat event). Combat and defense recording
  will be wired when the Godot sim bridge lands in Phase 8+.
- **CRLF format drift is pre-existing.** Cosmetic only — lint, typecheck, and
  tests are unaffected.

## Phase 13 — completed work

Creator Dashboard — local React control panel for the streamer:

- [x] **API Client Layer** (`dashboard/src/api/client.ts`): 26 typed fetch functions
  returning `ApiResult<T>` (`{ ok, data, status } | { ok: false, error, status }`).
  Token injected from `VITE_SESSION_TOKEN` env or localStorage override.
  Functions: getHealth, getStatus, getConfig/updateConfig, getDirectorState,
  skip/pause/resume/endRound/restart, postEvents/getEvents/getCommands, shutdown,
  getGiftConfig/updateGiftConfig/getGiftPreview/getGiftStats,
  getEngagementConfig/updateEngagementConfig/getEngagementStats/getTopContributors,
  mockStart/mockStop/mockAdvance/mockState/mockRecord/mockReplay, hideUser.
- [x] **Status Cards** (`dashboard/src/components/StatusCards.tsx`): 6 real-time cards
  (Gateway, Provider, Game, Queue, Pipeline, Round) polling GET /status,
  GET /director/state, GET /mock/state every 2 seconds. Stale indicator on fetch failure.
- [x] **Provider Settings** (`dashboard/src/components/ProviderSettings.tsx`): pipeline
  config form (rate limits, dedupe, queue capacity, log level). Zod-validated, submits
  POST /config.
- [x] **Mode Selection** (`dashboard/src/components/ModeSelection.tsx`): skip and restart
  actions. Submits POST /director/skip. (Decorative mode-picker radios were removed in
  review because the gateway does not support setting mode; the UI now honestly labels
  the buttons.)
- [x] **Gift Mapping** (`dashboard/src/components/GiftMapping.tsx`): table of giftId → tier
  → impact loaded from GET /gifts/preview. Save sends POST /gifts/config.
- [x] **Cooldowns** (`dashboard/src/components/Cooldown.tsx`): 5 cooldown timers
  (perUser, perFaction, ability, cinematic, global). Zod-validated, submits POST /gifts/config.
- [x] **Content Packs** (`dashboard/src/components/ContentPacks.tsx`): lists 4 installed
  packs with metadata (mode, label, faction count).
- [x] **Test Events** (`dashboard/src/components/TestEvents.tsx`): 7 scenario buttons
  (normal_traffic, gift_streak, viral_burst, malformed_payloads, disconnect, reconnect,
  four_mode_round). Start/Stop/Advance/Record/Replay controls. Real-time mock state display.
- [x] **Emergency Actions** (`dashboard/src/components/EmergencyActions.tsx`): Pause,
  End Round, Disable Gifts, Clear Queue, Reconnect, Hide User. All actions require
  browser `confirm()` dialog before executing.
- [x] **Auth Settings** (`dashboard/src/components/AuthSettings.tsx`): masked token input,
  Test Connection (GET /health), Save/Clear localStorage.
- [x] **Layout & Navigation** (`dashboard/src/App.tsx`, `Layout.tsx`): sidebar with 9 nav
  items, header with connection status dot + director state + mode. State-based routing
  (no react-router). Responsive dark theme (`styles.ts`).
- [x] **Gateway Integration** (`gateway/src/routes/viewer_routes.ts`): new POST /viewer/hide
  and POST /viewer/unhide endpoints with token auth. New POST /control/drain endpoint
  that actually removes queued commands (returns `{ ok, drained }`). `server.ts` enables
  feature flags (director, gift economy, free engagement, viewer routes) with
  `enableMockRoutes` guarded by `LIVE_PROVIDER === 'mock' || !LIVE_PROVIDER` so production
  builds do not expose `/mock/*` attack surface.
  7 gateway tests covering auth, validation, success paths.
- [x] **Vite Dev Proxy** (`dashboard/vite.config.ts`): 11 API path prefixes proxied to
  `127.0.0.1:8787`. Vitest configured (jsdom, setup file, src + test includes).
- [x] **Tests**: 85 tests across 8 files — API client (27, incl. drainQueue), StatusCards
  (10, incl. stale indicator + rapid-poll convergence + visibilitychange pause), Config
  screens (13, incl. skip/restart buttons and advance-ms=0 rejection), TestEvents (10),
  EmergencyActions (12, incl. drainQueue + disable-gifts POST body assertion), AuthSettings
  (8, incl. empty-token rejection), App/Layout (8, incl. responsive sidebar CSS injection),
  E2E (1 test with 24+ assertions covering complete mock stream workflow incl. drainQueue).
- [x] **Docs** (`docs/CREATOR_DASHBOARD.md`): quick start, auth, all 9 screens, API client
  table, architecture, testing, known limitations.

Commands run and results:

- `npm run lint` — **PASS** (zero errors/warnings)
- `npm run typecheck` — **PASS** (shared, gateway, dashboard all clean)
- `npm test` — **PASS** (738 tests: 653 gateway + 85 dashboard, all passing)
- `npm run validate:packs` — **PASS** (exit 0; 4 packs checked, 4 passed, 0 warnings)
- `npm run build` (dashboard) — **PASS** (dist/ with index.html + 278 KB JS, ~80 KB gzipped)

Phase 13 review fixes applied (12 total, from Grace/Noah/Oscar triple review):

**Critical:**
1. `server.ts` — `enableMockRoutes` now guarded by `LIVE_PROVIDER === 'mock'` (production
   no longer exposes `/mock/*` attack surface).
2. `EmergencyActions.tsx` + `gateway_routes.ts` + `client.ts` — new POST /control/drain
   endpoint actually drains the queue; Clear Queue button now functional.
3. `StatusCards.tsx` — `AbortController` + refs + batched `setData`; stale-response guard
   discards out-of-order polls; `lastUpdated` stale indicator.
4. `AuthSettings.tsx` — empty-token save rejected with inline error.
5. `ModeSelection.tsx` — decorative mode-picker radios removed; UI now honest.

**Warnings:**
6. `EmergencyActions.tsx` — `showMsg` timeout cleaned up on unmount.
7. `TestEvents.tsx` — advance ms ≤ 0 rejected with "Advance time must be > 0" error.
8. `StatusCards.tsx` + `Layout.tsx` — `document.visibilitychange` listener pauses polling
   when tab is backgrounded (reduces gateway load for Phase 14+).
9. `Layout.tsx` — responsive `<style>` block collapses sidebar to 56px icon rail on
   viewports ≤ 768px.

**Minor:**
10. `package.json` — unused `react-router-dom` dependency removed (~50 KB trimmed).
11. `StatusCards.test.tsx` — stale-indicator test now asserts by testid + text regex.
12. `EmergencyActions.test.tsx` — disable-gifts test now asserts POST body `{ enabled: false }`.

Phase 13 known limitations:

- **No WebSocket push.** Status cards use HTTP polling (2 s interval, paused when tab is
  hidden). Real-time push from gateway is deferred.
- **Gift mapping UI is basic.** Inline per-mapping editing is not implemented; the full
  config must be saved via POST /gifts/config.
- **Content pack preview** depends on Phase 4 asset-validation tooling; only metadata
  is shown.
- **No mobile app.** The dashboard is responsive web only (sidebar collapses to icon rail
  at ≤ 768px).
- **Cooldown config** requires a full GiftEconomyConfig payload for hot-reload; partial
  patches return 400.
- **Mode picker removed.** Gateway `POST /director/skip` does not accept a mode body; UI
  shows Skip/Restart buttons only. Full mode-selection UI deferred until gateway supports
  mode setting.
- **Provider status is mock-only.** ProviderCard reads exclusively from `GET /mock/state`;
  Phase 14 will add a real-provider discriminator (`source: 'mock' | 'real'`).
- **Godot not installed.** All gateway-side GDScript is hand-authored and desk-checked.
- **E2E uses mocked fetch.** Playwright browser E2E deferred; the current E2E test
  simulates gateway responses in jsdom.

**Next phase: Phase 14 — TikFinity Adapter** (real provider integration via a
configurable WebSocket adapter for receiving LIVE events from TikFinity or
equivalent platform).

## Phase 8 — completed work

Node Gateway Core — local reliability layer:

- [x] **Event Bus** (`gateway/src/pipeline/event_bus.ts`): typed pub/sub with bounded
  queues per topic (`raw_event`, `normalized_event`, `command`, `error`). Overflow drops
  oldest + warns. Async handlers with error isolation.
- [x] **Normalization Boundary** (`gateway/src/pipeline/normalizer.ts`): pure function
  `normalizeProviderEvent(raw)` validates against `NormalizedLiveEventSchema` (strict Zod).
  Sanitizes displayName (control chars, 64-char cap) and comment (200-char cap).
  Malformed events never reach the rules engine (acceptance gate).
- [x] **Dedupe Store** (`gateway/src/pipeline/dedupe_store.ts`): sliding-window dedup
  keyed on `(providerEventId, eventType)`. LRU eviction at configurable capacity (default
  10,000).
- [x] **Rate Limiter** (`gateway/src/pipeline/rate_limiter.ts`): per-viewerId token bucket
  (configurable rate/burst) + global throughput limit.
- [x] **Command Rules Engine** (`gateway/src/pipeline/command_rules.ts`): 5 built-in rules
  (ModeVoteRule, JoinFactionRule, EndRoundRule, PauseRule, KickRule). Rule registration
  API. Rules produce `GameCommand[] | null`.
- [x] **Command Queue** (`gateway/src/pipeline/command_queue.ts`): bounded FIFO queue of
  `GameCommand` (configurable capacity, default 500). Overflow rejects new commands.
- [x] **Pipeline Orchestrator** (`gateway/src/pipeline/pipeline.ts`): wires all stages:
  normalize → dedupe → rate limit → rules → enqueue. `process(rawEvent) → ProcessResult`.
  `getStats()` for status endpoint. Runtime config updates via `applyRuntimeConfig()`.
- [x] **Structured Logging** (`gateway/src/util/logger.ts`): pino-based with typed
  component tagging. `sanitizeText` / `sanitizeAndCap` helpers in `util/sanitize.ts`.
- [x] **Fastify Endpoints** (`gateway/src/routes/gateway_routes.ts`): 8 endpoints
  (GET /health, GET /status, GET /config, POST /config, POST /control/shutdown,
  POST /events, GET /events, GET /commands). Token auth on all non-health endpoints.
  Config sanitization (token redacted). Batch event ingestion.
- [x] **Configuration Validation** (`gateway/src/config.ts`): Zod-validated env vars
  for all pipeline settings. Runtime config update with strict validation.
  `sanitizeConfig()` for HTTP exposure.
- [x] **Graceful Shutdown** (`gateway/src/server.ts`): SIGINT/SIGTERM handlers, drain
  in-flight requests (configurable timeout), flush event bus + command queue.
- [x] **127.0.0.1 Binding**: default host is `127.0.0.1` (configurable via HOST env).
- [x] **Test Fixtures** (`gateway/test/fixtures/`): 10 valid events, 11 malformed events,
  10 expected command mappings.
- [x] 104 tests in `gateway/test/gateway_core.test.ts`: EventBus (6), Normalizer (9),
  DedupeStore (6), RateLimiter (5), CommandRulesEngine (14), CommandQueue (6),
  Pipeline (11), Endpoints (13), Logger (4), Config (5), Fixture acceptance (25).
- [x] Docs: `docs/NODE_GATEWAY_CORE.md` (architecture, pipeline stages, endpoints,
  configuration, shutdown behavior, acceptance gate).

Commands run and results:

- `npm run lint` — **PASS** (zero errors/warnings)
- `npm run typecheck` — **PASS** (shared, gateway, dashboard, tools all clean)
- `npm test` — **PASS** (294 tests in 9 files: gateway_core 104, viewer 74,
  director 61, viewer_fixes 22, identity 15, packs 12, messages 3, schemas 2,
  health 1)
- `npm run validate:packs` — **PASS** (exit 0; 4 packs checked, 4 passed, 0 warnings,
  0 failed)

Phase 8 known limitations:

- **Godot bridge integration deferred.** Commands are drained via `GET /commands`
  only. Phase 10 will wire the WebSocket bridge to the Godot SimWorld.
- **KICK_PLAYER not in GameCommand schema.** KickRule matches kick commands but
  produces no GameCommand. The pipeline should call `director.hideViewer()`
  directly when Phase 9 adapters wire the kick flow.
- **Strategy commands have no game mechanics.** The CommandParser recognizes
  focus/defend/push/retreat keywords but no gameplay effects are implemented.
- **Cross-session persistence not implemented.** Pipeline state (dedupe store,
  rate limit buckets, command queue) is session-scoped and lost on restart.
- **Mode vote and faction join are handled by the director, not the rules engine.**
  ModeVoteRule and KickRule return null (no GameCommand). The pipeline orchestrator
  or Phase 9 adapter should call `director.handleChatEvent()` for chat events.
- **CRLF format drift is pre-existing.** Cosmetic only — lint, typecheck, and
  tests are unaffected.

## Phase 15 — completed work

Visual Effects, Audio, and TikTok Readability — polished launch visual language:

- [x] **VFX Config** (`gateway/src/vfx/vfx_config.ts`): Zod-validated config with pool
  limits, quality levels (low/medium/high/ultra), frame-rate budget, motion reduction,
  color-blind mode, safe-zone bounds. Hot-reload via `reloadConfig()`.
- [x] **VFX Pool** (`gateway/src/vfx/vfx_pool.ts`): Bounded object pool for VFX instances
  (particles, flashes, trails, overlays). Per-type limits from config. LRU eviction when
  pool full (FIX 3 + FIX 4 — `evictLRU` now actually removes from pool + wired into
  `acquire()` as fallback). `getStats()` for observability. Graceful degradation (returns
  null on exhaustion). Graceful hot-reload (FIX 8 — active instances preserved when
  limits unchanged).
- [x] **VFX Orchestrator** (`gateway/src/vfx/vfx_orchestrator.ts`): Facade wiring pool +
  config + command emission. Event-type mapping: like→particle, follow→overlay+spotlight,
  share→trail+callout, gift→flash+camera+ability, subscribe→overlay+spotlight+trail.
  Respects quality level, motion reduction (FIX 2 — camera impulse fully disabled, not
  just reduced), color-blind mode. Text sanitization with Unicode bidi override stripping
  (FIX 5 — `\u200B-\u200F`, `\u202A-\u202E`, `\uFEFF` removed). Rolling-average
  frame-rate budget enforcement (FIX 7 — downgrades quality when `rollingAvg > 1000/budget`).
  `drainCommands()` returns all emitted commands (FIX 1 — buffer now populated).
- [x] **Audio Config** (`gateway/src/audio/audio_config.ts`): Zod-validated config with
  volume groups (master/music/sfx/ui, 0-100), track paths, SFX paths. Hot-reload.
- [x] **Audio Orchestrator** (`gateway/src/audio/audio_orchestrator.ts`): Facade wiring
  config + command emission. Event-type mapping: like→hit(+spotlight milestone),
  follow→follow, share→share, gift→gift(+ability cinematic), subscribe→follow+spotlight.
  Volume computation: master × group / 10000.
- [x] **Readability Config** (`gateway/src/readability/readability_config.ts`): Zod-validated
  config with color-blind mode, motion reduction, safe zone, font size, contrast boost.
- [x] **Readability Orchestrator** (`gateway/src/readability/readability_orchestrator.ts`):
  Modifies commands before emission. Color-blind→patterns, motion reduction→-50% intensity/duration,
  safe zone→bounds on spotlight/callout, font size→hint, contrast boost→flag.
- [x] **HTTP Routes** (`gateway/src/routes/vfx_routes.ts`, `audio_routes.ts`,
  `readability_routes.ts`): Token-protected endpoints for config, stats, and test triggers.
- [x] **COMMAND_SCHEMA_VERSION bumped to 4** (`shared/schemas/commands.ts`): New command
  types: `SPAWN_VFX`, `SPOTLIGHT_CARD`, `SUPPORTER_CALLOUT`, `CAMERA_IMPULSE`, `PLAY_AUDIO`.
- [x] **GDScript VFXPool** (`game/scripts/vfx/VFXPool.gd`): Godot-side object pool for
  GPUParticles2D instances. Per-type limits, LRU eviction, HTTP config loading.
- [x] **GDScript AudioManager** (`game/scripts/audio/AudioManager.gd`): Audio playback
  with volume groups, track caching, HTTP config loading.
- [x] **GDScript ReadabilityOverlay** (`game/scripts/ui/ReadabilityOverlay.gd`): Safe-zone
  overlay with F9 debug toggle, HTTP config loading.
- [x] **Godot Scenes**: ParticleBurst, HitFlash, Trail, FactionOverlay, SpotlightCard,
  SupporterCallout, CameraImpulse.
- [x] **CommandDispatcher** updated with 5 new signals (spawn_vfx, spotlight_card,
  supporter_callout, camera_impulse, play_audio).
- [x] Docs: `docs/VFX_AUDIO_READABILITY.md` (architecture, config, VFX types, audio tracks,
  readability options, Godot integration, known limitations).

Commands run and results:

- `npm run lint` — **PASS** (zero errors/warnings)
- `npm run typecheck` — **PASS** (shared, gateway, dashboard, tools all clean)
- `npm test` — **PASS** (955 tests: 870 gateway + 85 dashboard, all passing)
  - New: 151 tests (VFX 68, audio 24, readability 20, routes 24, acceptance 15/55+ assertions)
  - Previous: 804 tests from Phases 1-14
- `npm run validate:packs` — **PASS** (exit 0; 4 packs checked, 4 passed, 0 warnings, 0 failed)
- `npm run build` (dashboard) — **PASS** (exit 0; dist/ exists, 278 KB JS, ~81 KB gzipped)

Phase 15 review fixes applied (10 total, from Jason/Robin/Jay triple review):

**Critical:**
1. `vfx_orchestrator.ts` — `drainCommands()` now returns real data (buffer populated in
   `triggerVFX()` before handler dispatch).
2. `vfx_orchestrator.ts` — `handleGift` no longer emits `CAMERA_IMPULSE` when
   `motionReduction` is active (was contradicting doc comment).
3. `vfx_pool.ts` — `evictLRU()` now actually removes the evicted instance from the pool
   via `splice()` (was just touching `lastUsed`).
4. `vfx_pool.ts` — `acquire()` now calls `evictLRU()` as a fallback when no idle candidate
   exists, reusing the evicted instance before giving up (LRU eviction now reachable).
5. `vfx_orchestrator.ts` — `sanitizeText()` now strips Unicode bidirectional / format
   control characters (`\u200B-\u200F`, `\u202A-\u202E`, `\uFEFF`) to prevent text-spoofing
   attacks.

**Warnings:**
6. `vfx_acceptance.test.ts` — stress-test frame-rate budget tightened from 16670ms → 2000ms
   (was 1000× too generous); added pool accounting invariants.
7. `vfx_orchestrator.ts` — rolling-average frame-rate budget enforcement added; tracks
   exponential moving average of per-event processing time; downgrades quality or drops
   low-priority events when `rollingAvg > 1000/frameRateBudget`.
8. `vfx_pool.ts` — `updateConfig()` now compares old vs. new pool limits before tearing
   down; active instances preserved when limits unchanged (graceful hot-reload).

**Suggestions:**
9. `vfx_pool.ts` — merged two identical `dropped++/return null` branches in `acquire()`;
   clarified `VFXPoolStats.dropped` JSDoc.
10. `app.ts` — added commented integration scaffold showing how Phase 16 can register
    `VFXRule` / `AudioRule` via `pipeline.rulesEngine.registerRule()`.

Phase 15 known limitations:

- **Godot not installed.** GDScript and scene files are hand-authored, desk-check only.
  No runtime verification possible.
- **Placeholder audio files.** `audio/sfx/*.ogg` and `audio/music/*.ogg` paths are
  configured in `gateway/config/audio.json` but actual audio files do not exist yet.
  Phase 18 (Packaging, Release, Operations) will package real assets.
- **Motion reduction partial.** Only camera impulse intensity and trail duration are
  reduced; particles, flashes, and overlays retain full motion. A future polish pass may
  extend motion reduction to all 5 animation categories.
- **No Godot-side testing.** VFXPool, AudioManager, and ReadabilityOverlay GDScript have
  not been executed in the Godot runtime.
- **VFX/audio orchestrators not auto-integrated.** Phase 15 orchestrators are only
  accessible through manual HTTP trigger endpoints (`/vfx/trigger`, `/audio/trigger`).
  Phase 16 (OBS Runbook) can wire pipeline rules via the commented scaffold in `app.ts`
  (FIX 10).
- **Production deployment guidance missing.** `VFX_AUDIO_READABILITY.md` omits audio
  asset packaging (file format, codec, max file sizes), quality defaults per hardware
  tier, and audio file bundling for release — Phase 18 scope.
- **CRLF format drift is pre-existing.** Cosmetic only — lint, typecheck, and tests
  unaffected.

Next phase: **Phase 17 — Testing, Performance, and Failure Recovery**.

---

## Phase 16 — OBS and TikTok LIVE Studio Runbook (COMPLETED)

**Objective:** Make launching a stream repeatable.

### Deliverables completed

- [x] **Window Mode Config** (`gateway/src/window/window_config.ts`, `gateway/config/window.json`):
  Zod-validated config for mode (windowed/borderless/fullscreen), portrait, width, height, vsync, fps.
  Hot-reload via `reloadWindowConfig()`. Min/max constraints on width (640–7680), height (480–4320),
  fps (15–240). 18 tests.

- [x] **Preflight Orchestrator** (`gateway/src/preflight/preflight_orchestrator.ts`):
  6 preflight checks: gateway health (real HTTP fetch), dashboard reachable, provider (mock/tikfinity),
  config valid, audio assets, VFX config. Per-check timeout (5s default) via `Promise.race`.
  Returns `{ ok, checks[] }`. 25 tests.

- [x] **Fallback Orchestrator** (`gateway/src/fallback/fallback_orchestrator.ts`):
  Monitors stream health, activates "Technical Difficulties" overlay on gateway/provider disconnect.
  Tracks active reasons as `Set<FallbackReason>` for concurrent disconnect support.
  `deactivateReason()` removes individual reasons; only deactivates when set is empty.
  Redundant deactivation guard. VFX pool exhaustion degrades gracefully (no crash).
  Audio missing plays silently. Emits ACTIVATE_FALLBACK / DEACTIVATE_FALLBACK commands.
  Commands drained by WS tick loop. 23 tests.

- [x] **HTTP Routes** (`gateway/src/routes/window_routes.ts`, `preflight_routes.ts`, `fallback_routes.ts`):
  Window: GET/POST /window/config (POST emits SET_WINDOW_MODE command). Preflight: GET /preflight/check,
  POST /preflight/run. Fallback: GET /fallback/status, POST /fallback/activate, POST /fallback/deactivate.
  All token-protected. 26 route tests.

- [x] **COMMAND_SCHEMA_VERSION bumped to 5** (`shared/schemas/commands.ts`):
  Added SET_WINDOW_MODE, ACTIVATE_FALLBACK, DEACTIVATE_FALLBACK command types.
  5 command schema tests.

- [x] **GDScript WindowManager** (`game/scripts/window/window_manager.gd`):
  Applies DisplayServer settings for windowed/borderless/fullscreen modes.
  Portrait orientation (swaps width/height if needed). HTTP config loading on startup.
  Hand-authored (desk-check only).

- [x] **GDScript PreflightScreen** (`game/scripts/ui/preflight_screen.gd`):
  Shows checklist UI with green checkmarks and red X marks. "Start Stream" button
  enabled only when all checks pass. HTTP polling for preflight status.
  Hand-authored (desk-check only).

- [x] **GDScript FallbackScene** (`game/scripts/ui/fallback_scene.gd`):
  "Technical Difficulties" overlay. Activates on ACTIVATE_FALLBACK command,
  deactivates on DEACTIVATE_FALLBACK. Shows user-friendly reason messages.
  Hand-authored (desk-check only).

- [x] **Godot Scenes** (`game/scenes/ui/PreflightScreen.tscn`, `FallbackScene.tscn`):
  Hand-authored scene files referencing the GDScript classes above.

- [x] **OBS Runbook** (`docs/OBS_RUNBOOK.md`):
  Complete guide for OBS Studio setup, borderless portrait window, scene sources,
  recording settings, streaming settings, preflight checks, start/stop procedures,
  troubleshooting.

- [x] **TikTok LIVE Studio Runbook** (`docs/TIKTOK_LIVE_STUDIO_RUNBOOK.md`):
  TikFinity setup, gateway configuration for tikfinity provider, TikTok LIVE Studio
  scene setup, start/stop procedures, troubleshooting.

- [x] **One-Page Checklist** (`docs/STREAM_CHECKLIST.md`):
  Before/during/after stream checklists and emergency procedures.

- [x] **Streaming Workflow Overview** (`docs/STREAMING_WORKFLOW.md`):
  Architecture diagram, component table, workflow phases, window modes, fallback system,
  known limitations.

- [x] **Acceptance Test** (`gateway/test/runbook_acceptance.test.ts`):
  Simulates fresh Windows user launching mock stream: preflight checks pass (real HTTP server),
  window config loads, fallback lifecycle, stream stop. 30+ assertions.

### Fixes Applied (Phase 16 Finalization)

1. **PreflightScreen GDScript polls wrong endpoint** [CRITICAL] — Changed `METHOD_POST` to `METHOD_GET` for `/preflight/check` (cached result polling).
2. **Fallback reason overwrite on concurrent disconnects** [CRITICAL] — `FallbackOrchestrator` now tracks active reasons as `Set<FallbackReason>`. `deactivateReason()` removes individual reasons; only deactivates when set is empty.
3. **WindowManager skips portrait swap on initial config load** [CRITICAL] — Added inline portrait swap (`if _portrait and _width > _height: swap`) before `_apply_display_settings()` in `_on_config_received()`.
4. **Fallback commands never delivered to Godot client** [CRITICAL] — Wired `FallbackOrchestrator.drainCommands()` into WS pipeline via periodic drain interval in `app.ts` `onReady` hook.
5. **SET_WINDOW_MODE command never emitted** [CRITICAL] — POST `/window/config` now pushes `SET_WINDOW_MODE` command to event bus. Godot-side handler stub added in `command_dispatcher.gd`.
6. **Window config accepts degenerate resolutions** [WARNING] — Added `.min()`/`.max()` constraints: width 640–7680, height 480–4320, fps 15–240.
7. **Preflight orchestrator has no per-check timeout** [WARNING] — Wrapped each check in `Promise.race` with configurable timeout (default 5s).
8. **Gateway health check is tautological stub** [WARNING] — Changed to actual `fetch(http://127.0.0.1:${port}/health)` instead of always-passing lambda.
9. **GDScript files hardcode placeholder auth token** [WARNING] — Both `window_manager.gd` and `preflight_screen.gd` now read token from `RIFTCROWD_TOKEN` env var with dev fallback.
10. **PreflightScreen has no cleanup on scene exit** [WARNING] — Added `_exit_tree()` override to cancel in-flight HTTP requests.
11. **FallbackOrchestrator.deactivate() emits even when already inactive** [SUGGESTION] — Guard returns `null` when not active and no reasons tracked.
12. **PROJECT_STATUS.md test count discrepancies** [SUGGESTION] — Updated all test counts to reflect actual test file contents.

### Deferred (Phase 17/18)

- Preflight `removeCheck()` / per-check timeout options (Phase 17 friction).
- Production deployment guidance in STREAMING_WORKFLOW.md (Phase 18).
- Shared `session_auth.ts` utility (token extraction refactor — Phase 17).

### Commands run and results

- `npm run lint` — 0 errors
- `npm run typecheck` — clean
- `npm test` — 966 gateway + 85 dashboard = 1051 tests all passing
- `npm run validate:packs` — 4 packs, 0 warnings, 0 failures
- `npm run build` (dashboard) — exit 0

### Public API

- `WindowManager` (GDScript) — `set_mode()`, `get_mode()`, `is_portrait()`
- `PreflightOrchestrator` (TS) — `addCheck()`, `run()`, `checkCount`, configurable timeout
- `FallbackOrchestrator` (TS) — `activate()`, `deactivate()`, `deactivateReason()`, `getStatus()`, `drainCommands()`, `onEvent()`
- `WindowConfigSchema`, `WINDOW_DEFAULTS`, `loadWindowConfig()`, `reloadWindowConfig()`
- Command types: `SET_WINDOW_MODE`, `ACTIVATE_FALLBACK`, `DEACTIVATE_FALLBACK`
- `COMMAND_SCHEMA_VERSION = 5`

### Known limitations

- **Godot not installed.** GDScript files are hand-authored, desk-check only.
- **Placeholder audio.** Audio asset checks are placeholders.
- **No real OBS/TikTok LIVE Studio testing.** Runbook instructions are based on documented behavior.
- **Dashboard check.** Preflight dashboard reachability requires dashboard dev server running on port 5173.
- **SET_WINDOW_MODE command** wired to command queue and event bus; Godot-side handler is a stub in `command_dispatcher.gd` (no consumer yet).
- **Shared token utility** deferred to Phase 17 — GDScript files use inline env-var reading.


## Phase 17 — Testing, Performance, and Failure Recovery (COMPLETED)

### Object pooling module (new)

- [x] `gateway/src/pooling/command_pool.ts` — bounded pool for `GameCommand` objects (cap 5000, LRU eviction across all slots, acquire/release/clear/getStats/setCapacity with trim).
- [x] `gateway/src/pooling/ws_message_buffer.ts` — bounded ring buffer for outbound WS messages (cap 1000, drop-oldest overflow, sequence numbers, enqueue/dequeue/drain/getStats).
- [x] `gateway/src/pooling/http_request_pool.ts` — bounded pool for in-flight HTTP requests (cap 100, reject-when-full 429 indicator, cancelStale with accounting invariant, acquire/release/getStats).
- [x] `gateway/src/pooling/index.ts` — barrel re-export.

### Test framework and harness

- [x] `gateway/test/performance/harness.ts` — `runExtendedSession(options)` helper (options-object API); starts Pipeline + VFX + pools, emits events at configurable rate/duration, collects `SessionMetrics` with rounds tracking.
- [x] Event generators: `generateChatEvent`, `generateLikeEvent`, `generateFollowEvent`, `generateGiftEvent`, `generateShareEvent`, `generateRandomEvent`.

### Performance tests

- [x] `gateway/test/performance/pooling.test.ts` — **28 tests** covering CommandPool, WSMessageBuffer, HTTPRequestPool: acquire/release, cap enforcement, LRU eviction (full-active pool with cancelled-slot tracking), setCapacity trim, drop-oldest overflow, stale cancellation with accounting invariant, hot-reload capacity, stress cycles.
- [x] `gateway/test/performance/soak.test.ts` — **50 assertions** in a single extended session test (30s default, configurable via `SOAK_DURATION_MS`). Validates: no crash, bounded queue/pool/memory, rounds completed tracking, zero unhandled rejections.
- [x] `gateway/test/performance/burst.test.ts` — 7 tests: chat burst, gift burst, like burst, mixed burst, recovery after burst, sustained burst, VFX sustained.
- [x] `gateway/test/performance/reconnect.test.ts` — 6 tests: clean disconnect/reconnect, pending-command snapshot delivery, dirty disconnect, multiple reconnects (5x), reconnect during command emission with no-duplicates assertion, auth-failure reconnect rejected.
- [x] `gateway/test/performance/malformed.test.ts` — 14 tests: missing fields, wrong type, oversized strings, HTML injection, Unicode bidi injection, null input, empty object, array input, wrong schema version, mixed valid/malformed, HTML in displayName, zero-width chars, control chars, pipeline stats tracking.
- [x] `gateway/test/performance/low_fps.test.ts` — 8 tests: quality downgrade on over-budget, priority preservation, recovery when load drops, 30fps budget enforcement, ultra→low→ultra round-trip, zero-budget disables enforcement, rolling average updates, share under pressure.

### Integration tests

- [x] `gateway/test/integration/full_pipeline.test.ts` — 1 test, 42 assertions: end-to-end MockLiveAdapter → Pipeline → MatchDirector → VFX → Audio → Readability → CommandPool → WSMessageBuffer → HTTPRequestPool. 100 events processed; all stages including director state transitions validated.
- [x] `gateway/test/integration/replay.test.ts` — 13 tests: replays `shared/fixtures/valid-events.json` (chat, like, follow, gift, share) and `shared/fixtures/invalid-events.json` plus `gateway/test/fixtures/tikfinity/*.json` (6 TikFinity fixtures) through the pipeline. Deterministic: same input → same stats.

### Smoke test

- [x] `gateway/test/smoke/startup.test.ts` — 1 test, 25 assertions: full gateway startup with all feature flags. Validates /health, /status, /config, /window/config, orchestrator registration, VFX pool stats, pipeline components, fallback drains.

### Fixes applied

| # | Fix | Severity |
|---|-----|----------|
| 1 | CommandPool LRU eviction now searches ALL slots (active + idle); setCapacity trims excess | CRITICAL |
| 2 | LRU eviction test uses all-active pool, asserts specific slot evicted | CRITICAL |
| 3 | Integration test includes MatchDirector with state transitions | CRITICAL |
| 4 | Soak test tracks and asserts roundsCompleted | CRITICAL |
| 5 | PROJECT_STATUS.md UTF-8 encoding restored via git checkout | CRITICAL |
| 6 | Reconnect tests assert no duplicate command IDs | WARNING |
| 7 | Replay tests load TikFinity fixtures through tikfinity normalizer | WARNING |
| 8 | Pipeline stats formula corrected: processed = normalized + dropped - deduped - rateLimited | WARNING |
| 9 | HTTPRequestPool.cancelStale increments completed counter (accounting invariant) | WARNING |
| 10 | Harness dead ternary removed; command tracking standardized; rounds tracking added | WARNING |
| 11 | Smoke test validates /window/config endpoint | SUGGESTION |
| 12 | Docs updated to reflect options-object API for runExtendedSession | SUGGESTION |

### Deferred to Phase 18

- Low-FPS discrete named quality tiers (ultra→high→medium→low) — VFX orchestrator uses binary degradation; 4-tier ladder deferred.
- Optional "TikTok LIVE Studio" → "Real streaming studio software" rename in test report.

### Commands run and results

- `npm run lint` — **PASS** (zero errors/warnings).
- `npm run typecheck` — **PASS** (clean, zero errors).
- `npm test` — **1179 tests passing** (1094 gateway + 85 dashboard). Prior: 1051 (966 + 85). New: 128 gateway tests.
- `npm run validate:packs` — **PASS** (4/4 packs, 0 warnings).
- `npm run build` (dashboard) — **PASS** (exit 0).

### Public API added

- `CommandPool` — `acquire(cmd)`, `release(pooled)`, `getStats()`, `setCapacity(n)`, `clear()`
- `WSMessageBuffer` — `enqueue(payload)`, `dequeue()`, `drain()`, `getStats()`, `size`, `capacity`
- `HTTPRequestPool` — `acquire(label)`, `release(requestId)`, `cancelStale(maxAgeMs)`, `getStats()`
- Test harness: `runExtendedSession(options: ExtendedSessionOptions)` returns `SessionMetrics`
- `COMMAND_SCHEMA_VERSION = 5` (unchanged)

### Known limitations

- **Godot not installed.** WS command delivery to a real Godot client is untested.
- **No real OBS/TikTok LIVE Studio.** Preflight/runbook validation is mock-only.
- **No real TikFinity.** Adapter tested via MockLiveAdapter only.
- **No real network latency.** All tests bind 127.0.0.1; no simulated WAN latency or packet loss.
- **No concurrent WS stress.** Reconnect tests use sequential clients; high-concurrency (100+ simultaneous) not tested.
- **CI soak = 30s.** Full 5-minute soak available via `SOAK_DURATION_MS=300000` but not run in CI by default.
- **Burst ceiling = 2000 events.** Higher rates (> 10K/sec) not tested.
- **No memory profiling.** `--heap-prof` extended soak deferred to Phase 18.
- **Binary VFX quality degradation** (enabled/disabled), not 4-tier (ultra→high→medium→low). 4-tier ladder deferred to Phase 18.

### Next phase

**Phase 18 — Packaging, Release, and Operations.**
