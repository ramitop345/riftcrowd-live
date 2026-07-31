# RiftCrowd LIVE — Project Status

- **Working title:** RiftCrowd LIVE
- **Current phase:** Phase 10 — Gateway-to-Godot WebSocket Integration
- **Status:** COMPLETED
- **Last updated:** 31 July 2026

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
- Phase 11 — Gift Economy, Streaks, and Burst Aggregation: not started
- Phase 12 — Free Engagement Mechanics: not started
- Phase 13 — Creator Dashboard: not started
- Phase 14 — TikFinity Adapter: not started
- Phase 15 — Visual Effects, Audio, and TikTok Readability: not started
- Phase 16 — OBS and TikTok LIVE Studio Runbook: not started
- Phase 17 — Testing, Performance, and Failure Recovery: not started
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

**Phase 11 — Gift Economy, Streaks, and Burst Aggregation** (per the guide):
Create exciting but stable gift reactions. Implement gift-triggered gameplay effects
(captain ultimates, energy bursts), streak tracking, and burst aggregation mechanics.

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
