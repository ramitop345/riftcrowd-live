/**
 * Phase 15 — Readability unit tests.
 *
 * Tests: ReadabilityConfig (5+), ReadabilityOrchestrator (10+).
 * Total target: ≥15 tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ReadabilityConfigSchema,
  READABILITY_DEFAULTS,
  loadReadabilityConfig,
} from '../src/readability/readability_config.js';
import { ReadabilityOrchestrator } from '../src/readability/readability_orchestrator.js';
import { COMMAND_SCHEMA_VERSION, type GameCommand } from '@riftcrowd/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCommand(
  type: GameCommand['type'],
  metadata?: Record<string, string | number | boolean>,
): GameCommand {
  return {
    schemaVersion: COMMAND_SCHEMA_VERSION,
    id: `test_cmd_${Math.random().toString(36).slice(2, 10)}`,
    type,
    createdAt: new Date().toISOString(),
    sourceEventIds: ['evt-1'],
    metadata,
  };
}

// ===================================================================
// ReadabilityConfig
// ===================================================================

describe('ReadabilityConfig', () => {
  it('validates the default config', () => {
    const result = ReadabilityConfigSchema.safeParse(READABILITY_DEFAULTS);
    expect(result.success).toBe(true);
  });

  it('rejects invalid font size', () => {
    const invalid = { ...READABILITY_DEFAULTS, fontSize: 'huge' };
    expect(ReadabilityConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects unknown field (strict)', () => {
    const invalid = { ...READABILITY_DEFAULTS, unknownField: true };
    expect(ReadabilityConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('loadReadabilityConfig returns defaults on missing file', () => {
    const config = loadReadabilityConfig('/nonexistent/path.json');
    expect(config.fontSize).toBe('medium');
    expect(config.colorBlindMode).toBe(false);
  });

  it('loadReadabilityConfig loads from default path', () => {
    const config = loadReadabilityConfig();
    expect(config.fontSize).toBe('medium');
    expect(config.safeZone.topPx).toBe(80);
  });
});

// ===================================================================
// ReadabilityOrchestrator
// ===================================================================

describe('ReadabilityOrchestrator', () => {
  let orchestrator: ReadabilityOrchestrator;

  beforeEach(() => {
    orchestrator = new ReadabilityOrchestrator(READABILITY_DEFAULTS);
  });

  it('color-blind mode adds pattern to SPAWN_VFX', () => {
    const cbOrch = new ReadabilityOrchestrator({
      ...READABILITY_DEFAULTS,
      colorBlindMode: true,
    });
    const cmd = makeCommand('SPAWN_VFX', { vfxType: 'particle' });
    const modified = cbOrch.applyReadability(cmd);
    expect(modified.metadata?.['pattern']).toBe('dots');
  });

  it('color-blind mode adds stripes for overlay type', () => {
    const cbOrch = new ReadabilityOrchestrator({
      ...READABILITY_DEFAULTS,
      colorBlindMode: true,
    });
    const cmd = makeCommand('SPAWN_VFX', { vfxType: 'overlay' });
    const modified = cbOrch.applyReadability(cmd);
    expect(modified.metadata?.['pattern']).toBe('stripes');
  });

  it('motion reduction reduces camera impulse intensity by 50%', () => {
    const motionOrch = new ReadabilityOrchestrator({
      ...READABILITY_DEFAULTS,
      motionReduction: true,
    });
    const cmd = makeCommand('CAMERA_IMPULSE', { intensity: 0.8, duration: 300 });
    const modified = motionOrch.applyReadability(cmd);
    expect(modified.metadata?.['intensity']).toBe(0.4);
  });

  it('motion reduction shortens VFX duration by 50%', () => {
    const motionOrch = new ReadabilityOrchestrator({
      ...READABILITY_DEFAULTS,
      motionReduction: true,
    });
    const cmd = makeCommand('SPAWN_VFX', { duration: 2000 });
    const modified = motionOrch.applyReadability(cmd);
    expect(modified.metadata?.['duration']).toBe(1000);
  });

  it('safe zone added to SPOTLIGHT_CARD', () => {
    const cmd = makeCommand('SPOTLIGHT_CARD', { viewerName: 'Test' });
    const modified = orchestrator.applyReadability(cmd);
    expect(modified.metadata?.['safeZoneTop']).toBe(80);
    expect(modified.metadata?.['safeZoneBottom']).toBe(120);
    expect(modified.metadata?.['safeZoneLeft']).toBe(20);
    expect(modified.metadata?.['safeZoneRight']).toBe(20);
  });

  it('safe zone added to SUPPORTER_CALLOUT', () => {
    const cmd = makeCommand('SUPPORTER_CALLOUT', { viewerName: 'Test', tier: 'gold' });
    const modified = orchestrator.applyReadability(cmd);
    expect(modified.metadata?.['safeZoneTop']).toBe(80);
    expect(modified.metadata?.['safeZoneBottom']).toBe(120);
  });

  it('font size added to SPOTLIGHT_CARD', () => {
    const cmd = makeCommand('SPOTLIGHT_CARD', {});
    const modified = orchestrator.applyReadability(cmd);
    expect(modified.metadata?.['fontSize']).toBe('medium');
  });

  it('large font size applied', () => {
    const largeOrch = new ReadabilityOrchestrator({
      ...READABILITY_DEFAULTS,
      fontSize: 'large',
    });
    const cmd = makeCommand('SPOTLIGHT_CARD', {});
    const modified = largeOrch.applyReadability(cmd);
    expect(modified.metadata?.['fontSize']).toBe('large');
  });

  it('contrast boost added when enabled', () => {
    const contrastOrch = new ReadabilityOrchestrator({
      ...READABILITY_DEFAULTS,
      contrastBoost: true,
    });
    const cmd = makeCommand('SPOTLIGHT_CARD', {});
    const modified = contrastOrch.applyReadability(cmd);
    expect(modified.metadata?.['contrastBoost']).toBe(true);
  });

  it('contrast boost not added when disabled', () => {
    const cmd = makeCommand('SPOTLIGHT_CARD', {});
    const modified = orchestrator.applyReadability(cmd);
    expect(modified.metadata?.['contrastBoost']).toBeUndefined();
  });

  it('applyReadabilityBatch processes multiple commands', () => {
    const cmds = [
      makeCommand('SPAWN_VFX', {}),
      makeCommand('SPOTLIGHT_CARD', {}),
      makeCommand('CAMERA_IMPULSE', { intensity: 1.0 }),
    ];
    const modified = orchestrator.applyReadabilityBatch(cmds);
    expect(modified).toHaveLength(3);
  });

  it('does not mutate original command', () => {
    const cmd = makeCommand('SPOTLIGHT_CARD', { viewerName: 'Test' });
    const original = { ...cmd };
    orchestrator.applyReadability(cmd);
    expect(cmd.metadata?.['safeZoneTop']).toBeUndefined();
    expect(original.metadata?.['safeZoneTop']).toBeUndefined();
  });

  it('reloadConfig updates orchestrator', () => {
    orchestrator.reloadConfig({ ...READABILITY_DEFAULTS, fontSize: 'small' });
    expect(orchestrator.getConfig().fontSize).toBe('small');
  });

  it('non-VFX command with non-medium fontSize gets font hint', () => {
    const largeOrch = new ReadabilityOrchestrator({
      ...READABILITY_DEFAULTS,
      fontSize: 'large',
    });
    const cmd = makeCommand('ADD_ENERGY', {});
    const modified = largeOrch.applyReadability(cmd);
    expect(modified.metadata?.['fontSize']).toBe('large');
  });

  it('command with no metadata gets metadata added', () => {
    const cmd = makeCommand('SPOTLIGHT_CARD');
    const modified = orchestrator.applyReadability(cmd);
    expect(modified.metadata).toBeDefined();
    expect(modified.metadata?.['safeZoneTop']).toBe(80);
  });
});
