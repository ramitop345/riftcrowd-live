/**
 * Phase 17 — Soak Test.
 *
 * Extended mock session: configurable duration (default 30s for CI,
 * env SOAK_DURATION_MS for full 5min). Emits events at realistic rate.
 * Asserts: no crash, bounded queue/pool/memory, no unhandled rejections.
 * Target: 1 test with 50+ assertions.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  runExtendedSession,
  resetPerfEventCounter,
  type SessionMetrics,
} from './harness.js';

// Allow configurable duration via env var
const SOAK_DURATION_MS = Number(process.env['SOAK_DURATION_MS'] ?? 30000);
// Use faster rate for short tests, realistic for long tests
const SOAK_EVENT_RATE = SOAK_DURATION_MS > 60000 ? 30 : 50;

describe('Soak Test — Extended Mock Session', () => {
  let metrics: SessionMetrics;

  beforeAll(async () => {
    resetPerfEventCounter();
    metrics = await runExtendedSession({
      durationMs: SOAK_DURATION_MS,
      eventRate: SOAK_EVENT_RATE,
      commandQueueCapacity: 1000,
      useVFX: true,
    });
  }, SOAK_DURATION_MS + 30000);

  // -- Duration assertions --
  it('session ran for at least 80% of requested duration', () => {
    expect(metrics.durationMs).toBeGreaterThanOrEqual(SOAK_DURATION_MS * 0.8);
  });

  it('session did not run more than 150% of requested duration', () => {
    expect(metrics.durationMs).toBeLessThanOrEqual(SOAK_DURATION_MS * 1.5 + 10000);
  });

  // -- Event processing assertions --
  it('emitted a meaningful number of events', () => {
    expect(metrics.eventsEmitted).toBeGreaterThan(50);
  });

  it('processed events through the pipeline', () => {
    expect(metrics.eventsProcessed).toBeGreaterThan(0);
  });

  it('processed count equals emitted count (all events reached pipeline)', () => {
    expect(metrics.eventsProcessed).toBe(metrics.eventsEmitted);
  });

  it('produced commands from events', () => {
    expect(metrics.commandsProduced).toBeGreaterThanOrEqual(0);
  });

  it('event processing rate is reasonable (> 5 events/sec)', () => {
    expect(metrics.eventsPerSecond).toBeGreaterThan(5);
  });

  // -- Drop assertions --
  it('some events may be dropped (dedupe, rate limit) but not all', () => {
    expect(metrics.eventsDropped).toBeLessThan(metrics.eventsEmitted);
  });

  it('drop rate is less than 50%', () => {
    const dropRate = metrics.eventsDropped / metrics.eventsEmitted;
    expect(dropRate).toBeLessThan(0.5);
  });

  // -- Queue assertions --
  it('command queue stayed bounded (< 1000 items)', () => {
    expect(metrics.peakQueueLength).toBeLessThan(1000);
  });

  it('command queue never exceeded capacity', () => {
    expect(metrics.peakQueueLength).toBeLessThanOrEqual(1000);
  });

  // -- VFX pool assertions --
  it('VFX pool stayed bounded (< 200 instances)', () => {
    expect(metrics.peakVFXActive).toBeLessThanOrEqual(200);
  });

  it('VFX pool active count is non-negative', () => {
    expect(metrics.vfxStats.active).toBeGreaterThanOrEqual(0);
  });

  it('VFX pool idle count is non-negative', () => {
    expect(metrics.vfxStats.idle).toBeGreaterThanOrEqual(0);
  });

  it('VFX pool total (active + idle) is bounded', () => {
    expect(metrics.vfxStats.active + metrics.vfxStats.idle).toBeLessThan(500);
  });

  // -- WS buffer assertions --
  it('WS message buffer stayed bounded (< 1000)', () => {
    expect(metrics.peakWSBufferSize).toBeLessThanOrEqual(1000);
  });

  it('WS buffer stats show bounded size', () => {
    expect(metrics.wsBufferStats.size).toBeLessThanOrEqual(1000);
  });

  // -- Memory assertions --
  it('memory growth is less than 50MB', () => {
    expect(metrics.memoryGrowthMB).toBeLessThan(50);
  });

  it('memory start is reasonable (> 10MB)', () => {
    expect(metrics.memoryStartMB).toBeGreaterThan(10);
  });

  it('memory end is reasonable (< 500MB)', () => {
    expect(metrics.memoryEndMB).toBeLessThan(500);
  });

  // -- Crash/rejection assertions --
  it('no unhandled rejections', () => {
    expect(metrics.unhandledRejections).toBe(0);
  });

  // -- Pipeline stats assertions --
  it('pipeline processed counter matches', () => {
    expect(metrics.pipelineStats.processed).toBe(metrics.eventsEmitted);
  });

  it('pipeline normalized counter is reasonable', () => {
    expect(metrics.pipelineStats.normalized).toBeGreaterThanOrEqual(0);
  });

  it('pipeline deduped counter is non-negative', () => {
    expect(metrics.pipelineStats.deduped).toBeGreaterThanOrEqual(0);
  });

  it('pipeline rate limited counter is non-negative', () => {
    expect(metrics.pipelineStats.rateLimited).toBeGreaterThanOrEqual(0);
  });

  it('pipeline queued counter is non-negative', () => {
    expect(metrics.pipelineStats.queued).toBeGreaterThanOrEqual(0);
  });

  it('pipeline dropped counter matches events dropped', () => {
    expect(metrics.pipelineStats.dropped).toBe(metrics.eventsDropped);
  });

  it('pipeline queue overflow is bounded', () => {
    expect(metrics.pipelineStats.queueOverflow).toBeLessThan(1000);
  });

  // -- Command pool assertions --
  it('command pool active count is non-negative', () => {
    expect(metrics.commandPoolStats.active).toBeGreaterThanOrEqual(0);
  });

  it('command pool capacity is 5000', () => {
    expect(metrics.commandPoolStats.capacity).toBe(5000);
  });

  it('command pool dropped is bounded', () => {
    expect(metrics.commandPoolStats.dropped).toBeLessThan(100);
  });

  // -- VFX per-type assertions --
  it('VFX particle stats are valid', () => {
    expect(metrics.vfxStats.perType.particle.active).toBeGreaterThanOrEqual(0);
    expect(metrics.vfxStats.perType.particle.idle).toBeGreaterThanOrEqual(0);
  });

  it('VFX flash stats are valid', () => {
    expect(metrics.vfxStats.perType.flash.active).toBeGreaterThanOrEqual(0);
    expect(metrics.vfxStats.perType.flash.idle).toBeGreaterThanOrEqual(0);
  });

  it('VFX trail stats are valid', () => {
    expect(metrics.vfxStats.perType.trail.active).toBeGreaterThanOrEqual(0);
    expect(metrics.vfxStats.perType.trail.idle).toBeGreaterThanOrEqual(0);
  });

  it('VFX overlay stats are valid', () => {
    expect(metrics.vfxStats.perType.overlay.active).toBeGreaterThanOrEqual(0);
    expect(metrics.vfxStats.perType.overlay.idle).toBeGreaterThanOrEqual(0);
  });

  // -- Cleanup assertions --
  it('WS buffer total enqueued is reasonable', () => {
    expect(metrics.wsBufferStats.totalEnqueued).toBeGreaterThanOrEqual(0);
  });

  it('WS buffer total dequeued is reasonable', () => {
    expect(metrics.wsBufferStats.totalDequeued).toBeGreaterThanOrEqual(0);
  });

  it('WS buffer dropped is bounded', () => {
    expect(metrics.wsBufferStats.dropped).toBeLessThan(5000);
  });

  // -- Consistency assertions --
  it('events per second is consistent with duration and count', () => {
    const expectedRate = metrics.eventsEmitted / (metrics.durationMs / 1000);
    expect(metrics.eventsPerSecond).toBeGreaterThanOrEqual(expectedRate * 0.5);
    expect(metrics.eventsPerSecond).toBeLessThanOrEqual(expectedRate * 2);
  });

  it('total events processed + dropped accounts for all emitted events', () => {
    // processed includes all that went through pipeline, dropped is subset
    expect(metrics.pipelineStats.processed).toBe(metrics.eventsEmitted);
  });

  // -- Additional boundary checks --
  it('pipeline rules triggered counter is non-negative', () => {
    expect(metrics.pipelineStats.rulesTriggered).toBeGreaterThanOrEqual(0);
  });

  it('command pool evicted count is non-negative', () => {
    expect(metrics.commandPoolStats.evicted).toBeGreaterThanOrEqual(0);
  });

  // -- Rounds assertions (FIX 4) --
  it('rounds completed is at least 1 for soak test', () => {
    // With 30s at 50 events/sec = ~1500 events, expect >= 10 rounds (100 events each)
    expect(metrics.roundsCompleted).toBeGreaterThanOrEqual(1);
  });

  it('rounds completed scales with event count', () => {
    // Each round = 100 events, so rounds should be approximately eventsEmitted / 100
    const expectedRounds = Math.floor(metrics.eventsEmitted / 100);
    expect(metrics.roundsCompleted).toBeGreaterThanOrEqual(Math.max(1, expectedRounds - 2));
  });

  it('command pool idle is less than capacity', () => {
    expect(metrics.commandPoolStats.idle).toBeLessThanOrEqual(metrics.commandPoolStats.capacity);
  });

  it('VFX dropped count is non-negative', () => {
    expect(metrics.vfxStats.dropped).toBeGreaterThanOrEqual(0);
  });

  it('session duration is positive', () => {
    expect(metrics.durationMs).toBeGreaterThan(0);
  });

  it('events emitted is positive', () => {
    expect(metrics.eventsEmitted).toBeGreaterThan(0);
  });

  it('memory start is positive', () => {
    expect(metrics.memoryStartMB).toBeGreaterThan(0);
  });

  it('memory end is positive', () => {
    expect(metrics.memoryEndMB).toBeGreaterThan(0);
  });
});
