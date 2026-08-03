/**
 * Phase 17/Tier 4 — VFX Quality Ladder Tests.
 *
 * Tests the 4-tier VFX quality ladder:
 * - Automatic tier stepping based on frame reports
 * - Hysteresis (no tier change more than once per 5s)
 * - SET_QUALITY_TIER command emission
 * - FRAME_REPORT processing
 * - Per-tier config schema validation
 * ≥20 tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VFXOrchestrator, type FrameReport, type TierChangeEvent } from '../src/vfx/vfx_orchestrator.js';
import {
  VFXConfigSchema,
  VFX_DEFAULTS,
  QUALITY_TIER_DEFAULTS,
  QualityTiersSchema,
  type VFXConfig,
} from '../src/vfx/vfx_config.js';
import {
  COMMAND_SCHEMA_VERSION,
  FrameReportSchema,
  SetQualityTierSchema,
  GameCommandTypeSchema,
} from '@riftcrowd/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<VFXConfig>): VFXConfig {
  return { ...VFX_DEFAULTS, ...overrides };
}

function makeFrameReport(avgFrameMs: number, p95FrameMs?: number): FrameReport {
  return { avgFrameMs, p95FrameMs: p95FrameMs ?? avgFrameMs * 1.2 };
}

// ===================================================================
// Schema Version
// ===================================================================

describe('Schema version bump', () => {
  it('COMMAND_SCHEMA_VERSION is 7', () => {
    expect(COMMAND_SCHEMA_VERSION).toBe(7);
  });

  it('SET_QUALITY_TIER is a valid command type', () => {
    expect(GameCommandTypeSchema.parse('SET_QUALITY_TIER')).toBe('SET_QUALITY_TIER');
  });
});

// ===================================================================
// FRAME_REPORT schema
// ===================================================================

describe('FrameReport schema', () => {
  it('validates a valid frame report', () => {
    const report = { type: 'FRAME_REPORT' as const, avgFrameMs: 16.5, p95FrameMs: 22.0 };
    expect(FrameReportSchema.parse(report)).toEqual(report);
  });

  it('rejects negative avgFrameMs', () => {
    expect(() =>
      FrameReportSchema.parse({ type: 'FRAME_REPORT', avgFrameMs: -1, p95FrameMs: 10 }),
    ).toThrow();
  });

  it('rejects missing type', () => {
    expect(() =>
      FrameReportSchema.parse({ avgFrameMs: 10, p95FrameMs: 15 } as unknown as FrameReport),
    ).toThrow();
  });
});

// ===================================================================
// SET_QUALITY_TIER schema
// ===================================================================

describe('SetQualityTier schema', () => {
  it('validates a valid SET_QUALITY_TIER command', () => {
    const cmd = {
      schemaVersion: 7 as const,
      type: 'SET_QUALITY_TIER' as const,
      tier: 'medium' as const,
    };
    expect(SetQualityTierSchema.parse(cmd).tier).toBe('medium');
  });

  it('rejects invalid tier', () => {
    expect(() =>
      SetQualityTierSchema.parse({
        schemaVersion: 7,
        type: 'SET_QUALITY_TIER',
        tier: 'extreme',
      }),
    ).toThrow();
  });

  it('accepts optional reason field', () => {
    const cmd = {
      schemaVersion: 7 as const,
      type: 'SET_QUALITY_TIER' as const,
      tier: 'low' as const,
      reason: 'frame time over budget',
    };
    expect(SetQualityTierSchema.parse(cmd).reason).toBe('frame time over budget');
  });
});

// ===================================================================
// Per-tier config schema
// ===================================================================

describe('Per-tier config schema (qualityTiers)', () => {
  it('VFX_DEFAULTS includes qualityTiers', () => {
    expect(VFX_DEFAULTS.qualityTiers).toBeDefined();
    expect(VFX_DEFAULTS.qualityTiers!.ultra.particleMultiplier).toBe(1.5);
    expect(VFX_DEFAULTS.qualityTiers!.high.particleMultiplier).toBe(1.0);
    expect(VFX_DEFAULTS.qualityTiers!.medium.particleMultiplier).toBe(0.5);
    expect(VFX_DEFAULTS.qualityTiers!.low.particleMultiplier).toBe(0.25);
  });

  it('QUALITY_TIER_DEFAULTS has all 4 tiers', () => {
    expect(Object.keys(QUALITY_TIER_DEFAULTS)).toEqual(['ultra', 'high', 'medium', 'low']);
  });

  it('QualityTiersSchema validates correct input', () => {
    const tiers = {
      ultra: { particleMultiplier: 1.5, flashMultiplier: 1.5, trailMultiplier: 1.5, overlayMultiplier: 1.5 },
      high: { particleMultiplier: 1.0, flashMultiplier: 1.0, trailMultiplier: 1.0, overlayMultiplier: 1.0 },
      medium: { particleMultiplier: 0.5, flashMultiplier: 0.5, trailMultiplier: 0.5, overlayMultiplier: 0.5 },
      low: { particleMultiplier: 0.25, flashMultiplier: 0.25, trailMultiplier: 0.25, overlayMultiplier: 0.25 },
    };
    expect(QualityTiersSchema.parse(tiers)).toEqual(tiers);
  });

  it('VFXConfigSchema accepts config without qualityTiers (optional)', () => {
    const config = { ...VFX_DEFAULTS };
    // qualityTiers is optional — remove it for this test
    const { qualityTiers: _qt, ...configNoTiers } = config;
    const parsed = VFXConfigSchema.parse(configNoTiers);
    expect(parsed.quality).toBe('high');
  });

  it('VFXConfigSchema accepts config with qualityTiers', () => {
    const config = { ...VFX_DEFAULTS, qualityTiers: QUALITY_TIER_DEFAULTS };
    const parsed = VFXConfigSchema.parse(config);
    expect(parsed.qualityTiers).toBeDefined();
  });
});

// ===================================================================
// Automatic tier stepping — downgrade
// ===================================================================

describe('VFXOrchestrator: automatic tier downgrade', () => {
  let orch: VFXOrchestrator;

  beforeEach(() => {
    orch = new VFXOrchestrator(makeConfig({ quality: 'ultra', frameRateBudget: 60 }));
    // Reset hysteresis by setting lastTierChangeMs to 0
    (orch as unknown as Record<string, unknown>).lastTierChangeMs = 0;
  });

  it('starts at config quality tier', () => {
    expect(orch.getQualityTier()).toBe('ultra');
  });

  it('downgrades from ultra to high after 3 consecutive over-budget reports', () => {
    const budgetMs = 1000 / 60; // ~16.67ms
    for (let i = 0; i < 3; i++) {
      orch.handleFrameReport(makeFrameReport(budgetMs + 5));
    }
    expect(orch.getQualityTier()).toBe('high');
  });

  it('downgrades from high to medium after 3 consecutive over-budget reports', () => {
    orch.setQualityTier('medium'); // reset to medium first
    (orch as unknown as Record<string, unknown>).lastTierChangeMs = 0;
    orch.setQualityTier('high');
    (orch as unknown as Record<string, unknown>).lastTierChangeMs = 0;
    const budgetMs = 1000 / 60;
    for (let i = 0; i < 3; i++) {
      orch.handleFrameReport(makeFrameReport(budgetMs + 5));
    }
    expect(orch.getQualityTier()).toBe('medium');
  });

  it('does not downgrade below low', () => {
    orch.setQualityTier('low');
    (orch as unknown as Record<string, unknown>).lastTierChangeMs = 0;
    const budgetMs = 1000 / 60;
    for (let i = 0; i < 10; i++) {
      orch.handleFrameReport(makeFrameReport(budgetMs + 5));
    }
    expect(orch.getQualityTier()).toBe('low');
  });

  it('resets over counter when under-budget report arrives', () => {
    const budgetMs = 1000 / 60;
    orch.handleFrameReport(makeFrameReport(budgetMs + 5)); // 1 over
    orch.handleFrameReport(makeFrameReport(budgetMs + 5)); // 2 over
    orch.handleFrameReport(makeFrameReport(budgetMs - 5)); // reset
    orch.handleFrameReport(makeFrameReport(budgetMs + 5)); // 1 over again
    expect(orch.getQualityTier()).toBe('ultra'); // no downgrade yet
  });
});

// ===================================================================
// Automatic tier stepping — upgrade
// ===================================================================

describe('VFXOrchestrator: automatic tier upgrade', () => {
  let orch: VFXOrchestrator;

  beforeEach(() => {
    orch = new VFXOrchestrator(makeConfig({ quality: 'low', frameRateBudget: 60 }));
    (orch as unknown as Record<string, unknown>).lastTierChangeMs = 0;
  });

  it('upgrades from low to medium after 5 consecutive under-budget reports', () => {
    const budgetMs = 1000 / 60;
    for (let i = 0; i < 5; i++) {
      orch.handleFrameReport(makeFrameReport(budgetMs - 5));
    }
    expect(orch.getQualityTier()).toBe('medium');
  });

  it('does not upgrade above ultra', () => {
    orch.setQualityTier('ultra');
    (orch as unknown as Record<string, unknown>).lastTierChangeMs = 0;
    const budgetMs = 1000 / 60;
    for (let i = 0; i < 10; i++) {
      orch.handleFrameReport(makeFrameReport(budgetMs - 5));
    }
    expect(orch.getQualityTier()).toBe('ultra');
  });

  it('resets under counter when over-budget report arrives', () => {
    const budgetMs = 1000 / 60;
    orch.handleFrameReport(makeFrameReport(budgetMs - 5)); // 1 under
    orch.handleFrameReport(makeFrameReport(budgetMs - 5)); // 2 under
    orch.handleFrameReport(makeFrameReport(budgetMs + 5)); // reset
    for (let i = 0; i < 4; i++) {
      orch.handleFrameReport(makeFrameReport(budgetMs - 5));
    }
    expect(orch.getQualityTier()).toBe('low'); // only 4 under, not 5
  });
});

// ===================================================================
// Hysteresis
// ===================================================================

describe('VFXOrchestrator: hysteresis', () => {
  it('does not change tier more than once per 5 seconds', () => {
    const orch = new VFXOrchestrator(makeConfig({ quality: 'ultra', frameRateBudget: 60 }));
    (orch as unknown as Record<string, unknown>).lastTierChangeMs = Date.now(); // just changed

    const budgetMs = 1000 / 60;
    for (let i = 0; i < 5; i++) {
      orch.handleFrameReport(makeFrameReport(budgetMs + 10));
    }
    // Should NOT have downgraded because hysteresis prevents change within 5s
    expect(orch.getQualityTier()).toBe('ultra');
  });

  it('allows tier change after 5 seconds have passed', () => {
    const orch = new VFXOrchestrator(makeConfig({ quality: 'ultra', frameRateBudget: 60 }));
    (orch as unknown as Record<string, unknown>).lastTierChangeMs = Date.now() - 6000; // 6 seconds ago

    const budgetMs = 1000 / 60;
    for (let i = 0; i < 3; i++) {
      orch.handleFrameReport(makeFrameReport(budgetMs + 10));
    }
    expect(orch.getQualityTier()).toBe('high');
  });
});

// ===================================================================
// SET_QUALITY_TIER command emission
// ===================================================================

describe('VFXOrchestrator: SET_QUALITY_TIER command emission', () => {
  it('emits SET_QUALITY_TIER command when tier changes via frame reports', () => {
    const orch = new VFXOrchestrator(makeConfig({ quality: 'ultra', frameRateBudget: 60 }));
    (orch as unknown as Record<string, unknown>).lastTierChangeMs = 0;

    const budgetMs = 1000 / 60;
    for (let i = 0; i < 3; i++) {
      orch.handleFrameReport(makeFrameReport(budgetMs + 10));
    }

    const cmds = orch.drainCommands();
    const tierCmd = cmds.find((c) => c.type === 'SET_QUALITY_TIER');
    expect(tierCmd).toBeDefined();
    expect(tierCmd!.metadata!.tier).toBe('high');
    expect(tierCmd!.schemaVersion).toBe(7);
  });

  it('emits SET_QUALITY_TIER command on manual setQualityTier', () => {
    const orch = new VFXOrchestrator(makeConfig({ quality: 'high' }));
    orch.setQualityTier('low');

    const cmds = orch.drainCommands();
    const tierCmd = cmds.find((c) => c.type === 'SET_QUALITY_TIER');
    expect(tierCmd).toBeDefined();
    expect(tierCmd!.metadata!.tier).toBe('low');
  });

  it('notifies tier change callbacks', () => {
    const orch = new VFXOrchestrator(makeConfig({ quality: 'high' }));
    const events: TierChangeEvent[] = [];
    orch.onTierChange((evt) => events.push(evt));

    orch.setQualityTier('medium');
    expect(events.length).toBe(1);
    expect(events[0]!.from).toBe('high');
    expect(events[0]!.to).toBe('medium');
  });

  it('does not emit command when setting same tier', () => {
    const orch = new VFXOrchestrator(makeConfig({ quality: 'high' }));
    orch.setQualityTier('high'); // same tier

    const cmds = orch.drainCommands();
    expect(cmds.filter((c) => c.type === 'SET_QUALITY_TIER').length).toBe(0);
  });
});

// ===================================================================
// FRAME_REPORT processing
// ===================================================================

describe('VFXOrchestrator: FRAME_REPORT processing', () => {
  it('stores frame reports up to max capacity', () => {
    const orch = new VFXOrchestrator(makeConfig());
    for (let i = 0; i < 100; i++) {
      orch.handleFrameReport(makeFrameReport(16));
    }
    expect(orch.getFrameReportCount()).toBe(60); // MAX_FRAME_REPORTS
  });

  it('computes average frame time from stored reports', () => {
    const orch = new VFXOrchestrator(makeConfig());
    orch.handleFrameReport(makeFrameReport(10));
    orch.handleFrameReport(makeFrameReport(20));
    expect(orch.getAvgFrameMs()).toBe(15);
  });

  it('returns 0 avgFrameMs when no reports stored', () => {
    const orch = new VFXOrchestrator(makeConfig());
    expect(orch.getAvgFrameMs()).toBe(0);
  });
});
