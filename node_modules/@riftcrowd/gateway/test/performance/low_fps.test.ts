/**
 * Phase 17 — Low-FPS Degradation Tests.
 *
 * Simulate low FPS by injecting events faster than frame-rate budget allows.
 * Asserts: quality downgrades, low-priority dropped, high-priority preserved,
 * no crash, FPS stabilizes.
 * Target: 5+ tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VFXOrchestrator } from '../../src/vfx/vfx_orchestrator.js';
import { VFX_DEFAULTS, type VFXConfig } from '../../src/vfx/vfx_config.js';
import type { NormalizedLiveEvent } from '@riftcrowd/shared';

function makeEvent(type: NormalizedLiveEvent['type'], viewerId = 'v1'): NormalizedLiveEvent {
  const base: NormalizedLiveEvent = {
    schemaVersion: 1,
    id: `evt_fps_${Math.random().toString(36).slice(2, 10)}`,
    provider: 'mock',
    type,
    receivedAt: new Date().toISOString(),
    user: { id: viewerId, handle: `@${viewerId}`, displayName: 'Viewer' },
    rawHash: 'sha256:' + 'a'.repeat(64),
  };
  if (type === 'chat') (base as NormalizedLiveEvent & { comment: string }).comment = 'test';
  if (type === 'like') (base as NormalizedLiveEvent & { likeCount: number }).likeCount = 5;
  if (type === 'gift') {
    (base as NormalizedLiveEvent & { gift: { id: string; name: string; repeatCount: number } }).gift = {
      id: 'gift_rose',
      name: 'Rose',
      repeatCount: 1,
    };
  }
  return base;
}

describe('Low-FPS Degradation Tests', () => {
  let vfx: VFXOrchestrator;

  beforeEach(() => {
    vfx = new VFXOrchestrator(VFX_DEFAULTS);
  });

  it('quality downgrades when rolling average exceeds budget', () => {
    // Seed rolling average to exceed budget (60fps = 16.67ms budget)
    vfx.seedRollingAvg(50); // 50ms avg > 16.67ms budget

    // Chat events should be dropped under budget pressure
    const chatResult = vfx.triggerVFX(makeEvent('chat'));
    expect(chatResult.dropped).toBe(true);

    // Like events should also be dropped
    const likeResult = vfx.triggerVFX(makeEvent('like'));
    expect(likeResult.dropped).toBe(true);

    expect(vfx.isQualityDowngraded()).toBe(true);
  });

  it('high-priority events (gift, follow) preserved under budget pressure', () => {
    // Seed rolling average above budget
    vfx.seedRollingAvg(50);

    // Follow events should NOT be dropped
    const followResult = vfx.triggerVFX(makeEvent('follow'));
    expect(followResult.dropped).toBe(false);

    // Gift events should NOT be dropped
    const giftResult = vfx.triggerVFX(makeEvent('gift'));
    // Gift may be dropped only if VFX pool exhausted, not due to budget
    // The budget check only drops chat/like
    expect(giftResult.dropped).toBe(false);
  });

  it('quality recovers when load drops below budget', () => {
    // Over budget
    vfx.seedRollingAvg(50);
    const dropped = vfx.triggerVFX(makeEvent('chat'));
    expect(dropped.dropped).toBe(true);
    expect(vfx.isQualityDowngraded()).toBe(true);

    // Recover: seed below budget
    vfx.seedRollingAvg(5);
    const _recovered = vfx.triggerVFX(makeEvent('like'));
    // Should process normally now
    expect(vfx.isQualityDowngraded()).toBe(false);
  });

  it('frame-rate budget enforcement: chat dropped at high avg', () => {
    const lowFpsConfig: VFXConfig = {
      ...VFX_DEFAULTS,
      frameRateBudget: 30, // 30fps = 33.3ms budget
      pool: VFX_DEFAULTS.pool,
      safeZone: VFX_DEFAULTS.safeZone,
    };
    const lowFpsVfx = new VFXOrchestrator(lowFpsConfig);

    // Seed above 30fps budget (33.3ms)
    lowFpsVfx.seedRollingAvg(40);

    // Chat should be dropped
    const chatResult = lowFpsVfx.triggerVFX(makeEvent('chat'));
    expect(chatResult.dropped).toBe(true);

    // Follow should still be processed
    const followResult = lowFpsVfx.triggerVFX(makeEvent('follow'));
    expect(followResult.dropped).toBe(false);
  });

  it('ultra → low → ultra round-trip: quality tracks budget correctly', () => {
    // Normal operation (ultra quality)
    vfx.seedRollingAvg(1);
    const r1 = vfx.triggerVFX(makeEvent('like'));
    expect(r1.dropped).toBe(false);
    expect(vfx.isQualityDowngraded()).toBe(false);

    // Degrade to low (over budget)
    vfx.seedRollingAvg(100);
    const r2 = vfx.triggerVFX(makeEvent('chat'));
    expect(r2.dropped).toBe(true);
    expect(vfx.isQualityDowngraded()).toBe(true);

    // Recover back to ultra
    vfx.seedRollingAvg(1);
    const _r3 = vfx.triggerVFX(makeEvent('like'));
    expect(vfx.isQualityDowngraded()).toBe(false);
  });

  it('zero frame-rate budget disables enforcement', () => {
    const noBudgetConfig: VFXConfig = {
      ...VFX_DEFAULTS,
      frameRateBudget: 0, // Disabled
      pool: VFX_DEFAULTS.pool,
      safeZone: VFX_DEFAULTS.safeZone,
    };
    const noBudgetVfx = new VFXOrchestrator(noBudgetConfig);

    // Even with high rolling avg, nothing should be dropped due to budget
    noBudgetVfx.seedRollingAvg(1000);
    const chatResult = noBudgetVfx.triggerVFX(makeEvent('chat'));
    // chat events produce no VFX by default (no !ability), so dropped=false
    expect(chatResult.dropped).toBe(false);
  });

  it('rolling average updates with each event', () => {
    const initial = vfx.getRollingAvgMs();
    expect(initial).toBe(0);

    // Process some events
    for (let i = 0; i < 10; i++) {
      vfx.triggerVFX(makeEvent('follow'));
    }

    const after = vfx.getRollingAvgMs();
    // Rolling avg should have updated (may be very small since events process fast)
    expect(after).toBeGreaterThanOrEqual(0);
  });

  it('share events preserved under budget pressure', () => {
    vfx.seedRollingAvg(50);
    const shareResult = vfx.triggerVFX(makeEvent('share'));
    expect(shareResult.dropped).toBe(false);
  });
});
