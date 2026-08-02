# RiftCrowd LIVE -- Bug and Error Inventory Report

**Date:** 2 August 2026  
**Scope:** All project components (Godot, gateway, dashboard, launcher, shared, integration)  
**Status:** Post-Phase 18, pre-Phase 19

---

## 1. Godot Issues

### G-01: 6 Pre-existing Test Failures in `tests/`

- **Severity:** MEDIUM
- **Status:** OPEN
- **Files:**
  - `game\tests\test_protocol.gd` (1 failure)
  - `game\tests\test_sandbox.gd` (3 failures)
  - `game\tests\test_simulation.gd` (2 failures)
- **Description:** `test_protocol.gd` has 1 failure from an outdated expected payload shape (fixture data mismatch). `test_sandbox.gd` has 3 failures from timing-sensitive assertions with frame-dependent thresholds. `test_simulation.gd` has 2 failures from a boss spawn logic edge case involving wave counter overflow. These are NOT regressions from the Godot 4.7.1 retrofit -- they existed before.
- **Workaround:** `test_shell.gd` (92 tests) passes cleanly and covers scene loading, transitions, UI config, sanitization, arena, units, and sandbox basics. The failing tests can be run individually for debugging.
- **Target fix:** Phase 19

### G-02: Headless Mode Does Not Stay in Battle Scene

- **Severity:** HIGH
- **Status:** KNOWN
- **File:** `game\scenes\Battle.tscn`
- **Description:** Godot headless mode transitions from Battle to MainMenu immediately, preventing end-to-end FRAME_REPORT flow validation via real Godot<->gateway WebSocket round-trips. Validated via direct script calls instead.
- **Workaround:** End-to-end flow validated through direct function calls and gateway-side integration tests.
- **Target fix:** Phase 19 (requires GdUnit4 or custom headless harness)

### G-03: Export Templates Not Installed -- No .exe Produced

- **Severity:** HIGH
- **Status:** OPEN
- **File:** `game\export_presets.cfg`
- **Description:** Godot 4.7.1 export templates (`Godot_v4.7.1-stable_export_templates.tpz`) are not installed. `release/godot/RiftCrowd_LIVE.exe` does not exist. The launcher detects this and prints a message but cannot launch the game.
- **Workaround:** Creator must manually download and install export templates from `https://github.com/godotengine/godot/releases/download/4.7.1-stable/Godot_v4.7.1-stable_export_templates.tpz`.
- **Target fix:** Phase 19 (include in release packaging)

### G-04: Placeholder Audio Assets -- No Actual Sound Files

- **Severity:** HIGH
- **Status:** OPEN
- **Files:**
  - `gateway\config\audio.json`
  - `game\scripts\audio\AudioManager.gd`
- **Description:** Audio config references paths like `res://audio/sfx/hit.ogg` and `audio/music/*.ogg` but no actual `.ogg` files exist. AudioManager will emit `push_warning("AudioManager: track not found")` for every playback attempt. The game runs silently.
- **Workaround:** Game is fully playable without audio. Creator must provide their own audio files.
- **Target fix:** Phase 19

### G-05: VFX Quality Ladder Hysteresis Values Need Production Tuning

- **Severity:** LOW
- **Status:** DEFERRED_TO_PHASE_19
- **File:** `gateway\src\vfx\vfx_orchestrator.ts`
- **Description:** Hysteresis values (3s downgrade threshold, 5s upgrade threshold, 5s cooldown) are initial values. May cause oscillation or sluggish response on real hardware.
- **Workaround:** Monitor `quality_tier_changed` signal frequency in production and adjust.
- **Target fix:** Phase 19

### G-06: Stub Handlers for gift_apply, faction_join, camera_impulse

- **Severity:** MEDIUM
- **Status:** OPEN
- **File:** `game\scripts\screens\battle.gd` (lines 382-395)
- **Description:** Three command types received from the gateway are logged via `push_warning()` but produce no gameplay effect: `gift_apply`, `faction_join`, `camera_impulse`. Commands flow correctly from gateway to Godot but have no visible impact.
- **Workaround:** Documented behavior; game is playable without these. Gift economy, faction join gameplay, and camera effects are future work.
- **Target fix:** Phase 19+

### G-07: Godot Binary Not on System PATH

- **Severity:** LOW
- **Status:** KNOWN
- **File:** N/A (environment configuration)
- **Description:** Godot 4.7.1 at `C:\Program Files\Godot\godot.exe` requires the full path to invoke. Not on system PATH.
- **Workaround:** Use full path or add to PATH manually.
- **Target fix:** Phase 19 (document in setup guide)

### G-08: GDScript Datetime Regex is Shape-Only

- **Severity:** LOW
- **Status:** KNOWN
- **File:** `game\scripts\protocol\protocol_validator.gd`
- **Description:** Mirrors Zod's `z.string().datetime()` structurally but does not validate calendar semantics (e.g., month 13 passes the shape check).
- **Workaround:** Gateway-side Zod validation catches invalid datetimes before they reach Godot.
- **Target fix:** DEFERRED

### G-09: Game Tests Depend on Monorepo Layout

- **Severity:** LOW
- **Status:** KNOWN
- **File:** `tests/test_protocol.gd`
- **Description:** `test_protocol.gd` loads fixtures from `shared/fixtures` relative to the project root. Will not work from an exported/relocated game build.
- **Workaround:** Tests are development-only; not needed in production builds.
- **Target fix:** DEFERRED

### G-10: Pack Root Assumes Repository Layout

- **Severity:** LOW
- **Status:** KNOWN
- **File:** `scripts/packs/pack_loader.gd`
- **Description:** Game loads packs from `content/packs` relative to the project root. Exported/packaged builds need a copy step or configurable pack root.
- **Workaround:** Documented in `docs/CONTENT_PACK_FORMAT.md`.
- **Target fix:** Phase 19

---

## 2. Gateway Issues

### GW-01: 2 Pre-existing Flaky Tests in gateway_core.test.ts

- **Severity:** MEDIUM
- **Status:** OPEN
- **File:** `gateway\test\gateway_core.test.ts` (lines 973-982)
- **Description:** Tests `gracefulShutdown is exported from server.ts` and `flushPipeline is exported from server.ts` both call `await import('../src/server.js')`, which starts a real HTTP server. When run in parallel with other tests that bind port 8787, this causes `EADDRINUSE` conflicts and 120s timeouts. The functions ARE exported and work correctly.
- **Workaround:** Run these tests in isolation or use `--testNamePattern` to filter. Passes reliably when not concurrent.
- **Target fix:** Phase 19 (refactor to avoid importing server module)

### GW-02: 1 Pre-existing Flaky Soak Test in tikfinity_adapter.test.ts

- **Severity:** LOW
- **Status:** OPEN
- **File:** `gateway\test\tikfinity_adapter.test.ts` (line 367)
- **Description:** `connects to a WebSocket server` test relies on a 100ms timing-dependent wait. Passes in isolation but may fail under load.
- **Workaround:** Run in isolation; passes reliably when not concurrent.
- **Target fix:** Phase 19

### GW-03: 1 Pre-existing Flaky runbook_acceptance.test.ts Port Conflict

- **Severity:** LOW
- **Status:** OPEN
- **File:** `gateway\test\runbook_acceptance.test.ts` (line 37)
- **Description:** Binds to port 8787 on `127.0.0.1`, conflicting with other tests that use the same port when run in parallel.
- **Workaround:** Passes reliably in isolation.
- **Target fix:** Phase 19

### GW-04: Config File Path Resolution from Release Directory

- **Severity:** MEDIUM
- **Status:** OPEN
- **File:** `gateway\src\window\window_config.ts` (line 50), and similar patterns in `gift_economy.ts`, `free_engagement.ts`, `app.ts`
- **Description:** Config loaders use `join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', ...)` which resolves relative to the compiled JS file location. When the gateway is built and run from `release/gateway/dist/`, the `../..` traversal reaches `release/gateway/` then looks for `config/` there. If the release directory structure does not perfectly mirror the source layout, configs silently fall back to defaults. Non-fatal but can cause unexpected default behavior.
- **Workaround:** Ensure release directory structure matches expected layout, or pass explicit config paths.
- **Target fix:** Phase 19

### GW-05: No Persistent Storage -- In-Memory Only

- **Severity:** HIGH
- **Status:** OPEN
- **File:** All gateway state modules
- **Description:** Session data (viewer profiles, dedupe store, rate limit buckets, command queue, engagement state, gift economy state) is entirely in-memory. Process restart clears all state.
- **Workaround:** Documented as v1.0 limitation. SessionStats in `gateway/data/` is the only persisted data (atomic write).
- **Target fix:** Phase 19+

### GW-06: No Process Supervisor / Auto-Restart

- **Severity:** MEDIUM
- **Status:** OPEN
- **File:** `gateway\src\server.ts`
- **Description:** Gateway process does not auto-restart on crash. No systemd service, Windows Service, or PM2 configuration is bundled.
- **Workaround:** Creator must manually restart via START.bat or set up their own process manager.
- **Target fix:** Phase 19

### GW-07: Binds to 127.0.0.1 by Default

- **Severity:** LOW
- **Status:** WONTFIX (intentional security measure)
- **File:** `gateway\src\server.ts`
- **Description:** All services bind to localhost by default. Cannot serve external clients without `HOST` env var change.
- **Workaround:** Set `HOST=0.0.0.0` env var (not recommended without additional security).
- **Target fix:** N/A

### GW-08: MatchDirector Uses MockSimulation, Not Godot SimWorld

- **Severity:** MEDIUM
- **Status:** OPEN
- **File:** `gateway\src\director\match_director.ts` (lines 83, 693)
- **Description:** Two TODO comments indicate: (1) `TODO(Phase 11): add onGift handler for gift-driven gameplay modifiers` and (2) `TODO(Phase 8): replace MockSimulation with Godot SimWorld bridge via enqueue_command`. MatchDirector ticks a `MockSimulation` (Node.js-side) instead of receiving real simulation snapshots from Godot.
- **Workaround:** MockSimulation provides deterministic simulation for testing. Real Godot sim bridge is future work.
- **Target fix:** Phase 19+

### GW-09: Rate Limiter Uses Real Time, Not TestClock

- **Severity:** LOW
- **Status:** KNOWN
- **File:** `gateway\src\pipeline\rate_limiter.ts`
- **Description:** RateLimiter uses `Date.now()` instead of TestClock. Rate limiting behavior during scenario playback depends on real wall-clock speed.
- **Workaround:** Acceptable for production; only affects test determinism.
- **Target fix:** DEFERRED

### GW-10: Heartbeat is Server-Initiated Only

- **Severity:** LOW
- **Status:** KNOWN
- **File:** `game\scripts\net\ws_client.gd`
- **Description:** Godot WS client responds to server pings but does not independently detect stale connections. A silent network failure could leave the client believing it is connected.
- **Workaround:** Server heartbeat timeout detects most failures. Client-side heartbeat could be added.
- **Target fix:** Phase 19

### GW-11: Subscription Event `months` Field Not Carried

- **Severity:** LOW
- **Status:** KNOWN
- **File:** `gateway\src\adapters\tikfinity_adapter.ts`
- **Description:** `subscription` events map to `subscribe` type but the `months` field is not carried because the shared schema lacks it.
- **Workaround:** Schema extension needed if gameplay uses subscription duration.
- **Target fix:** Phase 19

### GW-12: TikFinity Heartbeat Assumption

- **Severity:** LOW
- **Status:** KNOWN
- **File:** `gateway\src\adapters\tikfinity_adapter.ts`
- **Description:** Uses standard WebSocket ping/pong frames. TikFinity may use application-level heartbeats -- unverified against actual TikFinity instance.
- **Workaround:** Verify against real TikFinity before production use.
- **Target fix:** Phase 19

### GW-13: Provider Connection Not Observable from /health

- **Severity:** MEDIUM
- **Status:** OPEN
- **File:** `gateway\src\routes\gateway_routes.ts`
- **Description:** `/health` endpoint does not expose `providerConnected: boolean`. When the TikFinity adapter permanently disconnects after max retries, there is no observable signal from the health endpoint.
- **Workaround:** Check `/status` or `/mock/state` endpoints for provider info.
- **Target fix:** Phase 19

### GW-14: Hot-Reload Resets All In-Flight State

- **Severity:** MEDIUM
- **Status:** KNOWN
- **Files:** `gift_economy.ts`, `free_engagement.ts`
- **Description:** `reloadConfig()` in both GiftEconomy and FreeEngagement replaces all internal components, resetting streaks, cooldowns, engagement state, and reserve to initial values.
- **Workaround:** Avoid hot-reload during active gameplay, or accept state reset.
- **Target fix:** Phase 19+

---

## 3. Dashboard Issues

### D-01: No Offline/Demo Mode

- **Severity:** MEDIUM
- **Status:** OPEN
- **File:** `dashboard\src\App.tsx`
- **Description:** Dashboard requires gateway to be running. No offline/demo mode with sample data for preview or development without gateway.
- **Workaround:** Start gateway in mock mode.
- **Target fix:** Phase 19

### D-02: Version Display Graceful Fallback

- **Severity:** LOW
- **Status:** OPEN
- **File:** `dashboard\src\components\Layout.tsx`
- **Description:** Dashboard fetches `/version` endpoint. If unavailable (older gateway), the version display may show an error state rather than degrading gracefully.
- **Workaround:** Ensure gateway is up to date.
- **Target fix:** Phase 19

### D-03: No Authentication Beyond LOCAL_SESSION_TOKEN

- **Severity:** MEDIUM
- **Status:** KNOWN
- **File:** `dashboard\src\api\client.ts`
- **Description:** Dashboard uses a single shared bearer token. No multi-user auth, session management, or role-based access. Anyone with access to the host can control the stream.
- **Workaround:** Bind to 127.0.0.1 (default). Token stored in localStorage.
- **Target fix:** Phase 19+

### D-04: Status Cards Use HTTP Polling, Not WebSocket Push

- **Severity:** LOW
- **Status:** DEFERRED_TO_PHASE_19
- **File:** `dashboard\src\components\StatusCards.tsx`
- **Description:** Status cards poll every 2 seconds via HTTP. Real-time push from gateway would reduce latency and gateway load.
- **Workaround:** Polling pauses when tab is hidden (visibilitychange listener).
- **Target fix:** Phase 19

### D-05: E2E Test Uses Mocked Fetch, Not Real Browser

- **Severity:** LOW
- **Status:** KNOWN
- **File:** `dashboard\test\e2e.test.ts`
- **Description:** E2E test simulates gateway responses in jsdom. No Playwright/browser E2E validation.
- **Workaround:** jsdom E2E covers the full mock stream workflow adequately.
- **Target fix:** Phase 19

### D-06: Gift Mapping UI is Basic

- **Severity:** LOW
- **Status:** DEFERRED_TO_PHASE_19
- **File:** `dashboard\src\components\GiftMapping.tsx`
- **Description:** Inline per-mapping editing not implemented. Full config must be saved via POST /gifts/config.
- **Workaround:** Edit the JSON config file directly for complex changes.
- **Target fix:** Phase 19

---

## 4. Launcher Issues

### L-01: Requires Node.js Installed -- Not Bundled

- **Severity:** HIGH
- **Status:** OPEN
- **File:** `launcher\src\index.ts`
- **Description:** Launcher runs `node server.js` and requires Node.js v22+ on the system PATH. Not bundled with the release.
- **Workaround:** Creator must install Node.js v22.16.0+ separately.
- **Target fix:** Phase 19 (consider pkg or nexe bundling)

### L-02: No Windows Service / Startup Integration

- **Severity:** LOW
- **Status:** DEFERRED_TO_PHASE_19
- **File:** `release\START.bat`
- **Description:** Creator must manually run START.bat. No Windows Service, scheduled task, or startup shortcut is configured.
- **Workaround:** Create a shortcut to START.bat in the Startup folder.
- **Target fix:** Phase 19

### L-03: Godot Skip Message Could Be More Prominent

- **Severity:** LOW
- **Status:** OPEN
- **File:** `launcher\src\index.ts` (lines 287-290)
- **Description:** When Godot exe is not found, launcher prints two log lines and continues. The message is informational but could be missed in the console output. The launcher does correctly report the skip (not silent).
- **Workaround:** Check launcher output for "Godot executable not found" message.
- **Target fix:** Phase 19 (add warning color or pause for acknowledgment)

### L-04: No Auto-Update Mechanism

- **Severity:** LOW
- **Status:** DEFERRED_TO_PHASE_19
- **File:** N/A
- **Description:** No built-in mechanism to check for or apply updates.
- **Workaround:** Manual download of new releases.
- **Target fix:** Phase 19+

### L-05: Log Rotation Not Implemented

- **Severity:** LOW
- **Status:** OPEN
- **File:** `launcher\src\index.ts`
- **Description:** Launcher creates a timestamped log directory per session but does not rotate or prune old logs. Logs grow unbounded across sessions.
- **Workaround:** Manually delete old log directories from `logs/`.
- **Target fix:** Phase 19

---

## 5. Shared Package Issues

### S-01: Ships Raw TypeScript (No Independent Build Output for Non-tsx Consumers)

- **Severity:** LOW
- **Status:** KNOWN
- **File:** `shared\package.json`
- **Description:** Phase 18 added a `tsc` build step compiling to `dist/`, but consumers outside the monorepo (if any) would need the built output. Currently all consumers are within the monorepo.
- **Workaround:** Build step is now included; `dist/` is produced.
- **Target fix:** Resolved in Phase 18

**No remaining open issues in the shared package.** Schemas, fixtures, and identity helpers are stable.

---

## 6. Integration / E2E Issues

### I-01: Real TikTok LIVE Provider Not Tested

- **Severity:** HIGH
- **Status:** OPEN
- **Description:** TikTokLiveAdapter is a stub (every method throws NotImplementedError). Real TikTok LIVE integration requires TikTok LIVE Studio + a live stream. No timeline for testing.
- **Workaround:** Use MockLiveAdapter for development. TikFinity adapter is the production path.
- **Target fix:** Phase 19+

### I-02: Real TikFinity Provider Not Tested

- **Severity:** HIGH
- **Status:** OPEN
- **Description:** TikFinity adapter tested only via mock fixtures and a local WebSocket test server. Never tested against a real TikFinity instance connected to TikTok LIVE.
- **Workaround:** Comprehensive mock testing provides confidence. Real validation requires TikFinity + TikTok LIVE Studio.
- **Target fix:** Phase 19 (production validation)

### I-03: Real OBS Capture Not Tested

- **Severity:** MEDIUM
- **Status:** OPEN
- **Description:** OBS runbook is documentation-only. Real OBS window capture of the Godot game client has not been validated.
- **Workaround:** Follow `docs/OBS_RUNBOOK.md` instructions; verify manually.
- **Target fix:** Phase 19

### I-04: Real TikTok LIVE Studio Capture Not Tested

- **Severity:** MEDIUM
- **Status:** OPEN
- **Description:** TikTok LIVE Studio runbook is documentation-only. Real capture untested.
- **Workaround:** Follow `docs/TIKTOK_LIVE_STUDIO_RUNBOOK.md`; verify manually.
- **Target fix:** Phase 19

### I-05: End-to-End Latency Not Measured

- **Severity:** MEDIUM
- **Status:** OPEN
- **Description:** Latency from TikTok event to Godot VFX rendering has not been measured in production conditions. All tests run on localhost with no simulated WAN latency.
- **Workaround:** Local latency is minimal; production latency depends on network and hardware.
- **Target fix:** Phase 19

### I-06: Simultaneous Restart Race Condition Not Tested

- **Severity:** LOW
- **Status:** OPEN
- **Description:** Dashboard + gateway + Godot simultaneous restart race condition has not been tested. Sequential restart works.
- **Workaround:** Restart components sequentially (gateway first, then Godot, then dashboard).
- **Target fix:** Phase 19

### I-07: No Concurrent WS Client Stress Test

- **Severity:** LOW
- **Status:** OPEN
- **Description:** Reconnect tests use sequential clients. High-concurrency (100+ simultaneous WS clients) not tested.
- **Workaround:** Current use case is single Godot client; multi-client is future work.
- **Target fix:** Phase 19+

### I-08: No GdUnit4 Godot-Side Test Harness

- **Severity:** MEDIUM
- **Status:** OPEN
- **Description:** No automated in-engine test harness for Godot runtime validation. All Godot behavior validated through headless boot + direct script calls, not automated in-engine assertions.
- **Workaround:** `test_shell.gd` and companion test scripts provide headless validation.
- **Target fix:** Phase 19

---

## 7. Documentation Gaps

### DOC-01: No Release Root README

- **Severity:** MEDIUM
- **Status:** OPEN
- **File:** `release\`
- **Description:** `release/` directory has no root-level README explaining how to install, configure, and launch the release package.
- **Workaround:** `release/UPDATES.md` covers release notes; `docs/STREAMING_RUNBOOK.md` covers OBS setup.
- **Target fix:** Phase 19

### DOC-02: No Contributor Guide

- **Severity:** LOW
- **Status:** OPEN
- **Description:** No CONTRIBUTING.md or contributor guide for external developers.
- **Workaround:** AGENTS.md provides AI agent guidance. Human contributors can infer conventions from existing code.
- **Target fix:** Phase 19

### DOC-03: No Troubleshooting Guide

- **Severity:** LOW
- **Status:** OPEN
- **Description:** No troubleshooting guide for common failures (port conflicts, Godot not found, config validation errors, etc.).
- **Workaround:** Individual runbooks have troubleshooting sections.
- **Target fix:** Phase 19

### DOC-04: Production Deployment Guidance Missing for TikFinity

- **Severity:** MEDIUM
- **Status:** OPEN
- **File:** `docs\PROVIDER_TIKFINITY.md`
- **Description:** Omits firewall rules, token rotation, systemd/Windows service setup, and log aggregation for production TikFinity deployment.
- **Workaround:** Use mock mode for development; configure production manually.
- **Target fix:** Phase 19

### DOC-05: CRLF Format Drift

- **Severity:** LOW
- **Status:** KNOWN
- **Description:** Files on Windows checkout carry CRLF endings. Prettier check reports drift repo-wide. Cosmetic only -- lint, typecheck, and tests are unaffected.
- **Workaround:** Configure Git with `core.autocrlf` or use `.gitattributes`.
- **Target fix:** DEFERRED

---

## 8. Performance/Optimization Deferred

### P-01: Visual Node Pooling in arena.gd

- **Severity:** DEFERRED
- **Status:** DEFERRED_TO_PHASE_19
- **File:** `game\scripts\arena\arena.gd`
- **Description:** Pre-instantiate unit nodes and recycle them to reduce instantiation spikes during combat. Rejected during retrofit as premature optimization.
- **Impact:** May cause frame drops during heavy combat with many simultaneous unit spawns.

### P-02: WS Message Batching

- **Severity:** DEFERRED
- **Status:** DEFERRED_TO_PHASE_19
- **File:** `gateway\src\ws\ws_server.ts`
- **Description:** Batch multiple GameCommands into single WebSocket frames to reduce per-message overhead under high event rates.
- **Impact:** Higher per-message overhead; not a bottleneck at current event rates (50/sec).

### P-03: Spatial Hash Grid for VFX Culling

- **Severity:** DEFERRED
- **Status:** DEFERRED_TO_PHASE_19
- **Description:** Spatial hash grid to cull off-screen VFX entities. Not needed at current VFX pool limits (max 200 active).
- **Impact:** All VFX nodes are processed regardless of visibility.

### P-04: Rendering Backend Switch

- **Severity:** DEFERRED
- **Status:** WONTFIX
- **Description:** Forward+ vs Mobile vs Compatibility rendering backend. Rejected during retrofit as low benefit.
- **Impact:** Forward+ is the default; works for the target use case.

### P-05: SessionConfig Autoload

- **Severity:** DEFERRED
- **Status:** DEFERRED_TO_PHASE_19
- **Description:** Centralized session configuration autoload for Godot. Currently config is loaded per-subsystem.
- **Impact:** Minor code duplication; no functional impact.

### P-06: Performance Ceilings Not Tested

- **Severity:** DEFERRED
- **Status:** DEFERRED_TO_PHASE_19
- **Description:** Burst tests cap at 2000 events. > 10,000 events/sec not tested. Memory ceiling and CPU-bound scenarios not profiled. `--heap-prof` extended soak deferred.
- **Impact:** Unknown behavior under extreme load.

---

## 9. Platform/Deployment Issues

### PL-01: Single Creator Session Only

- **Severity:** MEDIUM
- **Status:** KNOWN
- **Description:** v1.0 supports a single creator session. Multi-creator support is planned for Phase 20.
- **Workaround:** One creator per gateway instance.
- **Target fix:** Phase 20

### PL-02: No TikTok LIVE API Authentication Flow Tested

- **Severity:** HIGH
- **Status:** OPEN
- **Description:** TikTokLiveAdapter is a stub. No real TikTok LIVE API authentication flow has been tested. TikFinity adapter has optional token query param only; no OAuth or handshake.
- **Workaround:** Use TikFinity as the production provider (handles TikTok auth independently).
- **Target fix:** Phase 19+

### PL-03: Node.js Version Deviation

- **Severity:** LOW
- **Status:** KNOWN
- **Description:** Node.js v22.16.0 in use; guide recommends Node 24 LTS. No incompatibilities observed.
- **Workaround:** None needed; v22 works correctly.
- **Target fix:** DEFERRED

### PL-04: 6 npm Audit Advisories

- **Severity:** LOW
- **Status:** KNOWN
- **Description:** 6 npm audit advisories, all in upstream transitive dependencies. Non-blocking.
- **Workaround:** Monitor advisories; update when patches available.
- **Target fix:** DEFERRED

### PL-05: No Mobile App

- **Severity:** LOW
- **Status:** DEFERRED_TO_PHASE_21
- **Description:** Dashboard is responsive web only. Mobile companion app planned for Phase 21.
- **Target fix:** Phase 21

### PL-06: Motion Reduction is Partial

- **Severity:** LOW
- **Status:** OPEN
- **File:** `gateway\src\vfx\vfx_orchestrator.ts`
- **Description:** Only camera impulse intensity and trail duration are reduced when motion reduction is active. Particles, flashes, and overlays retain full motion.
- **Workaround:** Users sensitive to motion can enable the flag; partial reduction is better than none.
- **Target fix:** Phase 19 (polish pass)

---

## 10. TODO/FIXME/HACK Comment Inventory

| File | Line | Text |
|------|------|------|
| `scripts/ui/preflight_screen.gd` | 80 | `TODO: In production, source the token from a config file or secure storage.` |
| `scripts/window/window_manager.gd` | 86 | `TODO: In production, source the token from a config file or secure storage.` |
| `gateway/src/director/match_director.ts` | 83 | `TODO(Phase 11): add onGift handler for gift-driven gameplay modifiers` |
| `gateway/src/director/match_director.ts` | 693 | `TODO(Phase 8): replace MockSimulation with Godot SimWorld bridge via enqueue_command` |

No TODO/FIXME/XXX/HACK comments found in:

- `dashboard/src/` (0 matches)
- `launcher/src/` (0 matches)

Additional Godot-side stub markers (not TODO comments but push_warning stubs indicating incomplete integration):

- `scripts/screens/battle.gd:384` -- `push_warning("Camera impulse received: ...")` (stub)
- `scripts/screens/battle.gd:389` -- `push_warning("gift_apply received: ... (stub)")`
- `scripts/screens/battle.gd:394` -- `push_warning("faction_join received: ... (stub)")`
- `scripts/net/command_dispatcher.gd:122` -- `push_warning("CommandDispatcher: unknown command type ...")`

---

## Summary Statistics

| Category | CRITICAL | HIGH | MEDIUM | LOW | DEFERRED | Total |
|----------|----------|------|--------|-----|----------|-------|
| Godot | 0 | 2 | 2 | 5 | 1 | 10 |
| Gateway | 0 | 1 | 5 | 6 | 2 | 14 |
| Dashboard | 0 | 0 | 2 | 4 | 0 | 6 |
| Launcher | 0 | 1 | 0 | 4 | 0 | 5 |
| Shared | 0 | 0 | 0 | 0 | 0 | 0 |
| Integration/E2E | 0 | 2 | 3 | 3 | 0 | 8 |
| Documentation | 0 | 0 | 2 | 3 | 0 | 5 |
| Performance | 0 | 0 | 0 | 0 | 6 | 6 |
| Platform | 0 | 1 | 1 | 3 | 1 | 6 |
| **Total** | **0** | **7** | **15** | **28** | **10** | **60** |

**Key takeaway:** Zero CRITICAL issues remain. The 7 HIGH-severity items are: Godot headless Battle scene limitation (G-02), missing export templates (G-03), placeholder audio (G-04), no persistent storage (GW-05), and three untested real-world integrations (I-01, I-02, PL-02). All are documented limitations with known workarounds, not regressions or hidden bugs. The project is in a stable state for Phase 19 community feedback and iteration.
