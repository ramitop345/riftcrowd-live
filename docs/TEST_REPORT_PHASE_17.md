# RiftCrowd LIVE — Phase 17 Test Report

**Phase:** 17 — Testing, Performance, and Failure Recovery
**Date:** 1 August 2026
**Status:** PASSED — Release-candidate reliability evidence

---

## 1. Summary

| Metric | Value |
|---|---|
| **Total tests** | 1169 |
| **Gateway tests** | 1084 (966 prior + 118 new) |
| **Dashboard tests** | 85 (unchanged) |
| **Pass rate** | 100% |
| **Lint errors** | 0 |
| **Typecheck** | Clean |
| **Pack validation** | 4/4 passed |
| **Dashboard build** | Exit 0 |

### New Test Breakdown

| Test Suite | Tests | File |
|---|---|---|
| Object Pooling | 25 | `test/performance/pooling.test.ts` |
| Soak Test | 48 | `test/performance/soak.test.ts` |
| Burst Tests | 7 | `test/performance/burst.test.ts` |
| Reconnect Tests | 6 | `test/performance/reconnect.test.ts` |
| Malformed Payload | 14 | `test/performance/malformed.test.ts` |
| Low-FPS Degradation | 8 | `test/performance/low_fps.test.ts` |
| Full Pipeline Integration | 1 | `test/integration/full_pipeline.test.ts` |
| Replay Tests | 8 | `test/integration/replay.test.ts` |
| Smoke Test | 1 | `test/smoke/startup.test.ts` |
| **Total new** | **118** | |

---

## 2. Soak Test Results

| Metric | Measured |
|---|---|
| Duration | 30s (configurable via `SOAK_DURATION_MS`, default 30000) |
| Events emitted | ~1500 (50 events/sec × 30s) |
| Events processed | 100% of emitted |
| Commands produced | Variable (depends on event mix) |
| Peak queue length | < 1000 (bounded by capacity) |
| Peak VFX active | ≤ 200 (bounded by pool config) |
| Peak WS buffer | ≤ 1000 (bounded by buffer cap) |
| Memory growth | < 50MB |
| Unhandled rejections | 0 |
| Crash | None |

**Assertions:** 48 per test run. All passed.

---

## 3. Burst Test Results

| Scenario | Events | Time | Queue Bounded | Pool Bounded |
|---|---|---|---|---|
| Chat burst | 1000 | < 5s | Yes (< 1000) | N/A |
| Gift burst | 1000 | < 5s | Yes (< 1000) | Yes (< 500) |
| Like burst | 1000 | < 5s | Yes (< 1000) | Yes (< 200) |
| Mixed burst | 1000 | < 5s | Yes (< 1000) | Yes |
| Recovery after burst | 1000 + 100 | < 5s | Yes | Yes |
| Sustained burst (2000) | 2000 | < 5s | Yes | N/A |
| VFX sustained (500) | 500 | < 5s | N/A | Yes |

**Drop rate:** Variable (dedupe + rate limit drops some). Queue overflow tracked and bounded.

---

## 4. Reconnect Test Results

| Scenario | Result |
|---|---|
| Clean disconnect/reconnect | Handshake received on reconnect |
| Pending commands via snapshot | Commands buffered in retry buffer |
| Dirty disconnect (terminate) | Server continues operating |
| Multiple reconnects (5×) | All handshakes received |
| Reconnect during command emission | No crash |
| Auth failure reconnect | Rejected, server still operational |

**Success rate:** 6/6 tests passed.

---

## 5. Malformed Payload Results

| Category | Behavior |
|---|---|
| Missing required fields | Dropped, reason: "normalization failed" |
| Wrong event type | Dropped by Zod schema |
| Oversized strings (5000 chars) | Sanitized and truncated to 200 |
| HTML injection (`<script>`) | Stripped by VFX sanitizeText |
| Unicode bidi injection (`\u202E`) | Stripped by VFX sanitizeText |
| Null input | Rejected: "Input must be a non-null object" |
| Empty object | Rejected (missing required fields) |
| Array input | Rejected |
| Wrong schema version | Rejected by strict Zod |
| Mixed valid/malformed | Valid events processed normally |
| HTML in displayName | Passes normalizer; stripped by VFX layer |
| Zero-width characters | Stripped by both normalizer and VFX |
| Control characters | Stripped by both normalizer and VFX |
| Pipeline stats tracking | Malformed count tracked in dropped stats |

**Crash prevention:** 14/14 tests passed. No crash on any malformed input.

---

## 6. Low-FPS Degradation Results

| Scenario | Result |
|---|---|
| Quality downgrade (over budget) | Chat/like events dropped when rolling avg > budget |
| Priority preservation | Gift, follow, share events preserved under pressure |
| Recovery when load drops | Quality recovers when rolling avg falls below budget |
| Budget enforcement (30fps) | Correct threshold at 33.3ms |
| Ultra → low → ultra round-trip | Quality tracks budget correctly |
| Zero budget disables enforcement | No drops when budget = 0 |
| Rolling average updates | Updates with each event |
| Share under pressure | Share events preserved |

**8/8 tests passed.**

---

## 7. Object Pooling Audit

### VFX Pool (`vfx_pool.ts`)

| Property | Value |
|---|---|
| Cap | Per-type: maxParticles=100, maxFlashes=20, maxTrails=50, maxOverlays=30 |
| Total capacity | 200 |
| Eviction policy | LRU by lastUsed timestamp |
| Hot-reload | Yes (updateConfig) |
| Stress test | Bounded under 500 sustained events |

### CommandPool (`pooling/command_pool.ts`) — NEW

| Property | Value |
|---|---|
| Cap | 5000 (configurable) |
| Eviction policy | LRU idle slot eviction |
| Acquire | Reuses idle slots first, then allocates, then evicts |
| Release | Marks slot idle for reuse |
| Stress test | 1000 acquire/release cycles bounded |

### WSMessageBuffer (`pooling/ws_message_buffer.ts`) — NEW

| Property | Value |
|---|---|
| Cap | 1000 (configurable) |
| Overflow policy | Drop oldest |
| Sequence numbers | Monotonically increasing |
| Drain | FIFO order |
| Stress test | 2000 events → bounded at capacity |

### HTTPRequestPool (`pooling/http_request_pool.ts`) — NEW

| Property | Value |
|---|---|
| Cap | 100 (configurable) |
| Overflow policy | Reject with null (429 indicator) |
| Stale cancellation | cancelStale(maxAgeMs) |
| Stress test | 500 acquire/release cycles clean |

---

## 8. Integration Tests

### Full Pipeline (100 events)

End-to-end flow: event generators → Pipeline → VFX → Audio → Readability → CommandPool → WSMessageBuffer → HTTPRequestPool.

**34 assertions** covering:
- All 100 events processed
- Pipeline stats consistent
- VFX pool bounded
- Audio stats valid
- Readability config accessible
- Command pool: all released, no drops
- WS buffer bounded
- HTTP pool: 1 acquire/release cycle
- Memory < 500MB

### Replay Tests (shared fixtures)

Replays `shared/fixtures/valid-events.json` and `shared/fixtures/invalid-events.json`:
- Chat, like, follow, gift, share fixtures: all processed
- Invalid fixtures: all rejected
- Deterministic: same input → same stats across runs

---

## 9. Smoke Test

Full gateway startup with all feature flags:
- Pipeline, Director, Mock Routes, Gift Economy, Free Engagement
- Viewer Routes, VFX, Audio, Readability
- Window Config, Preflight, Fallback

**24 assertions** covering:
- Health endpoint (200, status=ok)
- Status endpoint (200, with auth)
- Config endpoint (200, with auth)
- All orchestrators registered
- VFX pool stats valid
- Pipeline components accessible
- Fallback drains empty

---

## 10. Remaining Limits

### Not Tested

1. **Godot client** — not installed in test environment. WS command delivery to Godot is untested.
2. **Real OBS / TikTok LIVE Studio** — no real streaming software integration.
3. **Real TikFinity provider** — no real TikFinity server. Adapter tested via mock only.
4. **Real network latency** — all tests run on localhost (127.0.0.1). No simulated WAN latency or packet loss.
5. **Concurrent WS clients** — reconnect tests use sequential clients. High-concurrency (100+ simultaneous clients) not tested.
6. **Disk I/O pressure** — session stats persistence not tested under I/O pressure.
7. **Long-duration soak (hours)** — CI soak is 30s. Full 5-minute soak available via `SOAK_DURATION_MS=300000`.

### Performance Ceilings Not Tested

1. **> 10,000 events/sec** — burst tests cap at 2000 events.
2. **Memory ceiling** — tests verify < 50MB growth and < 500MB total. Actual limits depend on host.
3. **CPU-bound scenarios** — VFX/Audio orchestrator CPU usage not profiled.

### Known Failure Modes Not Covered

1. **OOM kill** — if Node.js exceeds system memory, OS kills the process. No graceful recovery.
2. **Fastify plugin conflict** — decorator conflicts from future plugins not guarded.
3. **Clock drift** — TestClock is deterministic; real system clock drift not simulated.

---

## 11. Recommendations for Phase 18

1. **Launcher integration**: Phase 18 launcher should start gateway with `SOAK_DURATION_MS` set for production soak validation.
2. **Godot reconnect**: Test Godot WS reconnect with gateway-side retry buffer in Phase 18 when Godot build is available.
3. **Production config**: Ship with `commandQueueCapacity=1000`, `WS_RETRY_BUFFER_CAPACITY=1000` as defaults.
4. **Monitoring**: Expose pool stats via `/status` endpoint for dashboard visibility.
5. **Load testing**: Consider dedicated load testing tool (e.g., Artillery) for > 10K events/sec scenarios.
6. **Memory profiling**: Run `--heap-prof` on extended soak to identify potential memory leaks before release.
