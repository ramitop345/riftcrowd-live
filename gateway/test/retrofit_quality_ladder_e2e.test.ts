/**
 * Tier 5 (Retrofit) — Quality Ladder Validation (E2E).
 *
 * Validates the 4-tier quality ladder:
 *   ultra → high → medium → low (downgrade)
 *   low → medium → high → ultra (upgrade)
 *
 * Simulates low FPS by injecting FRAME_REPORT messages with
 * avgFrameMs > budget (e.g. 50ms when budget is 16.6ms).
 *
 * Asserts:
 *   - VFX orchestrator downgrades quality tier after 3 consecutive over-budget seconds.
 *   - SET_QUALITY_TIER command is emitted with correct tier value.
 *   - VFX orchestrator upgrades quality tier after 5 consecutive under-budget seconds.
 *   - Hysteresis: rapid oscillation does NOT cause rapid tier changes.
 *
 * Target: ≥15 assertions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { VFXOrchestrator, type TierChangeEvent } from '../src/vfx/vfx_orchestrator.js';
import type { FastifyInstance } from 'fastify';
import type { GameCommand } from '@riftcrowd/shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN = 'test-quality-token';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface QualityLadderCtx {
  app: FastifyInstance;
  vfxOrch: VFXOrchestrator;
  tierChanges: TierChangeEvent[];
}

/**
 * Inject a FRAME_REPORT message into the VFX orchestrator.
 * Simulates Godot sending frame performance data.
 */
function injectFrameReport(vfx: VFXOrchestrator, avgFrameMs: number, p95FrameMs?: number): void {
  vfx.handleFrameReport({
    avgFrameMs,
    p95FrameMs: p95FrameMs ?? avgFrameMs * 1.5,
  });
}

/**
 * Inject multiple FRAME_REPORTs with the same avgFrameMs (simulate consecutive seconds).
 */
function injectConsecutiveReports(vfx: VFXOrchestrator, count: number, avgFrameMs: number): void {
  for (let i = 0; i < count; i++) {
    injectFrameReport(vfx, avgFrameMs);
  }
}

/**
 * Wait for hysteresis window (5 seconds) before next tier change can occur.
 * In tests, we bypass this by using the VFXOrchestrator directly,
 * but for E2E tests we need to respect the real hysteresis timer.
 */
function advanceTime(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Tier 5 — Quality Ladder Validation (E2E)', () => {
  let ctx: QualityLadderCtx;

  beforeEach(async () => {
    process.env['LOCAL_SESSION_TOKEN'] = TOKEN;

    // Build app with all flags
    ctx = {
      app: null as never,
      vfxOrch: null as never,
      tierChanges: [],
    };

    ctx.app = buildApp({
      logger: false,
      enableVFX: true,
      enableRunbook: true,
    });

    await ctx.app.ready();

    ctx.vfxOrch = ctx.app.vfxOrchestrator!;

    // Track tier changes
    ctx.vfxOrch.onTierChange((evt: TierChangeEvent) => {
      ctx.tierChanges.push(evt);
    });
  });

  afterEach(async () => {
    if (ctx.app) {
      await ctx.app.close();
    }
  });

  // =========================================================================
  // Initial state assertions (3+)
  // =========================================================================

  it('1. VFX orchestrator initializes at high quality', () => {
    // Default config quality is 'high'
    expect(ctx.vfxOrch.getQualityTier()).toBe('high');
  });

  it('2. Frame report count starts at 0', () => {
    expect(ctx.vfxOrch.getFrameReportCount()).toBe(0);
  });

  it('3. Average frame time starts at 0', () => {
    expect(ctx.vfxOrch.getAvgFrameMs()).toBe(0);
  });

  // =========================================================================
  // Downgrade path (5+)
  // =========================================================================

  it('4. Single over-budget frame report does NOT downgrade', () => {
    // Budget is 60fps = 16.67ms. Send 50ms (> budget).
    injectFrameReport(ctx.vfxOrch, 50);
    expect(ctx.vfxOrch.getQualityTier()).toBe('high'); // No change yet
  });

  it('5. Two over-budget frame reports do NOT downgrade', () => {
    injectConsecutiveReports(ctx.vfxOrch, 2, 50);
    expect(ctx.vfxOrch.getQualityTier()).toBe('high');
  });

  it('6. Three consecutive over-budget frame reports DOWNGRADE (high → medium)', async () => {
    // Initial tier is 'high'
    expect(ctx.vfxOrch.getQualityTier()).toBe('high');

    // Inject 3 consecutive over-budget reports
    injectConsecutiveReports(ctx.vfxOrch, 3, 50);

    // Should have downgraded to 'medium'
    expect(ctx.vfxOrch.getQualityTier()).toBe('medium');

    // Check tier change was recorded
    expect(ctx.tierChanges.length).toBeGreaterThanOrEqual(1);
    const lastChange = ctx.tierChanges[ctx.tierChanges.length - 1];
    expect(lastChange!.from).toBe('high');
    expect(lastChange!.to).toBe('medium');
  });

  it('7. SET_QUALITY_TIER command is emitted on downgrade', async () => {
    // Inject 3 consecutive over-budget reports
    injectConsecutiveReports(ctx.vfxOrch, 3, 50);

    // Drain commands from orchestrator
    const commands = ctx.vfxOrch.drainCommands();
    const qualityCmds = commands.filter((cmd: GameCommand) => cmd.type === 'SET_QUALITY_TIER');

    expect(qualityCmds.length).toBeGreaterThanOrEqual(1);
    const cmd = qualityCmds[0]!;
    expect(cmd.type).toBe('SET_QUALITY_TIER');
    expect(cmd.metadata).toBeDefined();
    expect(cmd.metadata!['tier']).toBe('medium');
    expect(cmd.metadata!['fromTier']).toBe('high');
  });

  it('8. Further over-budget reports downgrade medium → low', async () => {
    // Start: high → medium (3 over-budget reports)
    injectConsecutiveReports(ctx.vfxOrch, 3, 50);
    expect(ctx.vfxOrch.getQualityTier()).toBe('medium');

    // Wait for hysteresis window to pass (5 seconds)
    await advanceTime(5100);

    // Medium → low (3 more over-budget reports)
    injectConsecutiveReports(ctx.vfxOrch, 3, 50);
    expect(ctx.vfxOrch.getQualityTier()).toBe('low');
  });

  it('9. Cannot downgrade below low (already at floor)', async () => {
    // Drive to low
    injectConsecutiveReports(ctx.vfxOrch, 3, 50); // high → medium
    await advanceTime(5100);
    injectConsecutiveReports(ctx.vfxOrch, 3, 50); // medium → low

    expect(ctx.vfxOrch.getQualityTier()).toBe('low');

    // Try to downgrade further — should stay at low
    await advanceTime(5100);
    injectConsecutiveReports(ctx.vfxOrch, 3, 50);
    expect(ctx.vfxOrch.getQualityTier()).toBe('low');
  });

  // =========================================================================
  // Upgrade path (5+)
  // =========================================================================

  it('10. Single under-budget frame report does NOT upgrade', async () => {
    // Drive to medium first
    injectConsecutiveReports(ctx.vfxOrch, 3, 50); // high → medium
    expect(ctx.vfxOrch.getQualityTier()).toBe('medium');

    await advanceTime(5100);

    // Single under-budget report (10ms < 16.67ms budget)
    injectFrameReport(ctx.vfxOrch, 10);
    expect(ctx.vfxOrch.getQualityTier()).toBe('medium'); // No change yet
  });

  it('11. Five consecutive under-budget reports UPGRADE (medium → high)', async () => {
    // Drive to medium
    injectConsecutiveReports(ctx.vfxOrch, 3, 50);
    expect(ctx.vfxOrch.getQualityTier()).toBe('medium');

    await advanceTime(5100);

    // Inject 5 consecutive under-budget reports
    injectConsecutiveReports(ctx.vfxOrch, 5, 10);

    expect(ctx.vfxOrch.getQualityTier()).toBe('high');
  });

  it('12. Further under-budget reports upgrade high → ultra', async () => {
    // Drive to high (from default)
    expect(ctx.vfxOrch.getQualityTier()).toBe('high');

    await advanceTime(5100);

    // High → ultra (5 under-budget reports)
    injectConsecutiveReports(ctx.vfxOrch, 5, 10);

    expect(ctx.vfxOrch.getQualityTier()).toBe('ultra');
  });

  it('13. Cannot upgrade above ultra (already at ceiling)', async () => {
    // Drive to ultra
    await advanceTime(5100);
    injectConsecutiveReports(ctx.vfxOrch, 5, 10); // high → ultra
    expect(ctx.vfxOrch.getQualityTier()).toBe('ultra');

    // Try to upgrade further — should stay at ultra
    await advanceTime(5100);
    injectConsecutiveReports(ctx.vfxOrch, 5, 10);
    expect(ctx.vfxOrch.getQualityTier()).toBe('ultra');
  });

  // =========================================================================
  // Hysteresis tests (2+)
  // =========================================================================

  it('14. Hysteresis: rapid oscillation does NOT cause rapid tier changes', async () => {
    const initialTier = ctx.vfxOrch.getQualityTier();
    const initialChangeCount = ctx.tierChanges.length;

    // Rapid oscillation: 1 over, 1 under, 1 over, 1 under (each < threshold)
    injectFrameReport(ctx.vfxOrch, 50); // over
    injectFrameReport(ctx.vfxOrch, 10); // under (resets over count)
    injectFrameReport(ctx.vfxOrch, 50); // over (resets under count)
    injectFrameReport(ctx.vfxOrch, 10); // under (resets over count)

    // Should NOT have triggered a tier change (no consecutive over/under)
    expect(ctx.tierChanges.length).toBe(initialChangeCount);
    expect(ctx.vfxOrch.getQualityTier()).toBe(initialTier);
  });

  it('15. Hysteresis: 3 over, then 1 under breaks the chain', async () => {
    // Start: high
    injectConsecutiveReports(ctx.vfxOrch, 2, 50); // 2 over
    injectFrameReport(ctx.vfxOrch, 10); // 1 under (breaks chain)
    injectConsecutiveReports(ctx.vfxOrch, 3, 50); // 3 over again (should trigger)

    expect(ctx.vfxOrch.getQualityTier()).toBe('medium');
  });

  // =========================================================================
  // Full ladder traversal test (1+)
  // =========================================================================

  it('16. Full ladder: high → medium → low → medium → high → ultra', async () => {
    // high → medium
    injectConsecutiveReports(ctx.vfxOrch, 3, 50);
    expect(ctx.vfxOrch.getQualityTier()).toBe('medium');

    await advanceTime(5100);

    // medium → low
    injectConsecutiveReports(ctx.vfxOrch, 3, 50);
    expect(ctx.vfxOrch.getQualityTier()).toBe('low');

    await advanceTime(5100);

    // low → medium (5 under-budget reports)
    injectConsecutiveReports(ctx.vfxOrch, 5, 10);
    expect(ctx.vfxOrch.getQualityTier()).toBe('medium');

    await advanceTime(5100);

    // medium → high
    injectConsecutiveReports(ctx.vfxOrch, 5, 10);
    expect(ctx.vfxOrch.getQualityTier()).toBe('high');

    await advanceTime(5100);

    // high → ultra
    injectConsecutiveReports(ctx.vfxOrch, 5, 10);
    expect(ctx.vfxOrch.getQualityTier()).toBe('ultra');

    // Verify all tier changes were recorded
    expect(ctx.tierChanges.length).toBeGreaterThanOrEqual(5);
  });

  // =========================================================================
  // Integration tests (3+)
  // =========================================================================

  it('17. Frame reports are stored', () => {
    injectConsecutiveReports(ctx.vfxOrch, 10, 20);
    expect(ctx.vfxOrch.getFrameReportCount()).toBe(10);
  });

  it('18. Average frame time is computed correctly', () => {
    injectConsecutiveReports(ctx.vfxOrch, 10, 20);
    expect(ctx.vfxOrch.getAvgFrameMs()).toBe(20);
  });

  it('19. Frame reports are capped at MAX_FRAME_REPORTS (60)', () => {
    for (let i = 0; i < 100; i++) {
      injectFrameReport(ctx.vfxOrch, 15);
    }
    expect(ctx.vfxOrch.getFrameReportCount()).toBeLessThanOrEqual(60);
  });

  // =========================================================================
  // VFX stats endpoint integration (2+)
  // =========================================================================

  it('20. /vfx/stats returns updated pool stats', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/vfx/stats',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.active).toBeDefined();
    expect(body.idle).toBeDefined();
  });

  it('21. /vfx/config returns current config', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/vfx/config',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.quality).toBeDefined();
    expect(body.frameRateBudget).toBe(60);
  });
});
