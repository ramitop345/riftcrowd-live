# RiftCrowd LIVE — Project Status

- **Working title:** RiftCrowd LIVE
- **Current phase:** Phase 1 — Repository Bootstrap and Development Tooling
- **Status:** COMPLETED
- **Last updated:** 30 July 2026

## Phase tracker

- Phase 0 — Product Lock, Legal Boundaries, and Acceptance Tests: **not started** (product spec
  ships here as a draft; the full lock is Phase 0 work)
- Phase 1 — Repository Bootstrap and Development Tooling: **COMPLETED**
- Phase 2 — Shared Protocol and Schema Validation: **not started** (next)
- Phase 3 — Godot Portrait Foundation: not started
- Phase 4 — Content-Pack System and Four Launch Packs: not started
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

## Quality gate results

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

**Phase 2 — Shared Protocol and Schema Validation.**

- Implement `NormalizedLiveEvent` and `GameCommand` schemas with version fields (extend existing
  `shared/` work).
- Add deterministic IDs and raw-payload hashes.
- Document ack, error, snapshot, and heartbeat messages.
- Generate or mirror matching typed GDScript DTO parsing helpers.
- Acceptance gate: malformed messages rejected; fixtures parse consistently in TypeScript and
  Godot.
