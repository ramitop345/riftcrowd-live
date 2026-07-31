# RiftCrowd LIVE — Project Status

- **Working title:** RiftCrowd LIVE
- **Current phase:** Phase 3 — Godot Portrait Foundation
- **Status:** COMPLETED
- **Last updated:** 31 July 2026

## Phase tracker

- Phase 0 — Product Lock, Legal Boundaries, and Acceptance Tests: **not started** (product spec
  ships here as a draft; the full lock is Phase 0 work)
- Phase 1 — Repository Bootstrap and Development Tooling: **COMPLETED**
- Phase 2 — Shared Protocol and Schema Validation: **COMPLETED**
- Phase 3 — Godot Portrait Foundation: **COMPLETED**
- Phase 4 — Content-Pack System and Four Launch Packs: **not started** (next)
- Phase 5 — Autonomous Arena Simulation: not started
- Phase 6 — Match Director and Round Lifecycle: not started
- Phase 7 — Viewer Identity and Faction Participation: not started
- Phase 8 — Node Gateway Core: not started
- Phase 9 — Mock LIVE Adapter and Event Studio: not started
- Phase 10 — Gateway-to-Godot WebSocket Integration: not started
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

## Next phase

**Phase 4 — Content-Pack System and Four Launch Packs** (per the phase list in
`docs/RiftCrowd_LIVE_Complete_Qoder_Implementation_Guide.md`).
