/**
 * Phase 15 — VFX unit tests.
 *
 * Tests: VFXConfig (10+), VFXPool (30+), VFXOrchestrator (25+).
 * Total target: ≥65 tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  VFXConfigSchema,
  VFX_DEFAULTS,
  loadVFXConfig,
  type VFXConfig,
} from '../src/vfx/vfx_config.js';
import { VFXPool } from '../src/vfx/vfx_pool.js';
import { VFXOrchestrator, sanitizeText } from '../src/vfx/vfx_orchestrator.js';
import type { NormalizedLiveEvent } from '@riftcrowd/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(
  type: NormalizedLiveEvent['type'],
  overrides?: Partial<NormalizedLiveEvent>,
): NormalizedLiveEvent {
  const id = `evt_${Math.random().toString(36).slice(2, 10)}`;
  return {
    schemaVersion: 1,
    id,
    provider: 'mock',
    type,
    receivedAt: new Date().toISOString(),
    user: { id: 'viewer-1', handle: '@viewer1', displayName: 'Viewer1' },
    rawHash: `sha256:mock_${id}`,
    ...overrides,
  } as NormalizedLiveEvent;
}

// ===================================================================
// VFXConfig
// ===================================================================

describe('VFXConfig', () => {
  it('validates the default config', () => {
    const result = VFXConfigSchema.safeParse(VFX_DEFAULTS);
    expect(result.success).toBe(true);
  });

  it('rejects invalid quality level', () => {
    const invalid = { ...VFX_DEFAULTS, quality: 'extreme' };
    expect(VFXConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects negative pool limit', () => {
    const invalid = { ...VFX_DEFAULTS, pool: { ...VFX_DEFAULTS.pool, maxParticles: -1 } };
    expect(VFXConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects zero frameRateBudget', () => {
    const invalid = { ...VFX_DEFAULTS, frameRateBudget: 0 };
    expect(VFXConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects unknown field (strict)', () => {
    const invalid = { ...VFX_DEFAULTS, unknownField: true };
    expect(VFXConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('accepts low quality', () => {
    const config = { ...VFX_DEFAULTS, quality: 'low' };
    expect(VFXConfigSchema.safeParse(config).success).toBe(true);
  });

  it('accepts ultra quality', () => {
    const config = { ...VFX_DEFAULTS, quality: 'ultra' };
    expect(VFXConfigSchema.safeParse(config).success).toBe(true);
  });

  it('loadVFXConfig returns defaults on missing file', () => {
    const config = loadVFXConfig('/nonexistent/path.json');
    expect(config.quality).toBe('high');
    expect(config.pool.maxParticles).toBe(100);
  });

  it('loadVFXConfig loads from default path', () => {
    const config = loadVFXConfig();
    expect(config.quality).toBe('high');
    expect(config.frameRateBudget).toBe(60);
  });

  it('safe zone has correct defaults', () => {
    expect(VFX_DEFAULTS.safeZone.topPx).toBe(80);
    expect(VFX_DEFAULTS.safeZone.bottomPx).toBe(120);
    expect(VFX_DEFAULTS.safeZone.leftPx).toBe(20);
    expect(VFX_DEFAULTS.safeZone.rightPx).toBe(20);
  });
});

// ===================================================================
// VFXPool
// ===================================================================

describe('VFXPool', () => {
  let pool: VFXPool;
  let config: VFXConfig;

  beforeEach(() => {
    config = { ...VFX_DEFAULTS };
    pool = new VFXPool(config);
  });

  it('pre-allocates instances up to total capacity', () => {
    const stats = pool.getStats();
    expect(stats.idle).toBe(200); // 100+20+50+30
    expect(stats.active).toBe(0);
  });

  it('acquire returns an instance for valid type', () => {
    const inst = pool.acquire('particle', { x: 100, y: 200 });
    expect(inst).not.toBeNull();
    expect(inst!.type).toBe('particle');
    expect(inst!.active).toBe(true);
  });

  it('release returns instance to idle', () => {
    const inst = pool.acquire('particle', {});
    expect(inst).not.toBeNull();
    pool.release(inst!);
    const stats = pool.getStats();
    expect(stats.active).toBe(0);
    expect(stats.idle).toBe(200);
  });

  it('acquire exhausts particles at maxParticles', () => {
    const acquired = [];
    for (let i = 0; i < 100; i++) {
      const inst = pool.acquire('particle', {});
      if (inst) acquired.push(inst);
    }
    expect(acquired.length).toBe(100);
    const next = pool.acquire('particle', {});
    expect(next).toBeNull();
  });

  it('acquire exhausts flashes at maxFlashes', () => {
    for (let i = 0; i < 20; i++) {
      pool.acquire('flash', {});
    }
    expect(pool.acquire('flash', {})).toBeNull();
  });

  it('acquire exhausts trails at maxTrails', () => {
    for (let i = 0; i < 50; i++) {
      pool.acquire('trail', {});
    }
    expect(pool.acquire('trail', {})).toBeNull();
  });

  it('acquire exhausts overlays at maxOverlays', () => {
    for (let i = 0; i < 30; i++) {
      pool.acquire('overlay', {});
    }
    expect(pool.acquire('overlay', {})).toBeNull();
  });

  it('dropped count increments on pool exhaustion', () => {
    for (let i = 0; i < 100; i++) {
      pool.acquire('particle', {});
    }
    pool.acquire('particle', {}); // dropped
    pool.acquire('particle', {}); // dropped
    const stats = pool.getStats();
    expect(stats.dropped).toBe(2);
  });

  it('per-type stats are correct', () => {
    pool.acquire('particle', {});
    pool.acquire('particle', {});
    pool.acquire('flash', {});
    const stats = pool.getStats();
    expect(stats.perType.particle.active).toBe(2);
    expect(stats.perType.particle.idle).toBe(98);
    expect(stats.perType.flash.active).toBe(1);
    expect(stats.perType.flash.idle).toBe(19);
  });

  it('release does nothing for already released instance', () => {
    const inst = pool.acquire('particle', {});
    pool.release(inst!);
    pool.release(inst!); // double release should be safe
    const stats = pool.getStats();
    expect(stats.active).toBe(0);
  });

  it('evictLRU returns an idle instance and removes it from pool', () => {
    const inst1 = pool.acquire('particle', {});
    const inst2 = pool.acquire('particle', {});
    pool.release(inst1!);
    const statsBefore = pool.getStats();
    const totalBefore = statsBefore.active + statsBefore.idle;
    // inst2 is still active
    void inst2;
    const evicted = pool.evictLRU('particle');
    expect(evicted).not.toBeNull();
    // After eviction, pool size should decrease
    const statsAfter = pool.getStats();
    const totalAfter = statsAfter.active + statsAfter.idle;
    expect(totalAfter).toBe(totalBefore - 1);
  });

  it('evictLRU returns null when no idle instances of type', () => {
    // Acquire all flashes
    for (let i = 0; i < 20; i++) {
      pool.acquire('flash', {});
    }
    const evicted = pool.evictLRU('flash');
    expect(evicted).toBeNull();
  });

  it('totalCapacity returns sum of all type limits', () => {
    expect(pool.totalCapacity).toBe(200);
  });

  it('updateConfig re-allocates pool with new limits', () => {
    pool.acquire('particle', {});
    pool.updateConfig({ ...config, pool: { ...config.pool, maxParticles: 50 } });
    const stats = pool.getStats();
    // Active instance is preserved (graceful transition)
    expect(stats.active).toBe(1);
    // Idle: 49 particles (50-1 active) + 20 flashes + 50 trails + 30 overlays
    expect(stats.idle).toBe(149);
  });

  it('acquire preserves params', () => {
    const inst = pool.acquire('particle', { x: 42, y: 99, color: '#FF0000' });
    expect(inst!.params.x).toBe(42);
    expect(inst!.params.y).toBe(99);
    expect(inst!.params.color).toBe('#FF0000');
  });

  it('release clears params', () => {
    const inst = pool.acquire('particle', { x: 42 });
    pool.release(inst!);
    expect(inst!.params).toEqual({});
  });

  it('getConfig returns current config', () => {
    const cfg = pool.getConfig();
    expect(cfg.quality).toBe('high');
  });

  it('concurrent acquire and release cycles', () => {
    const instances = [];
    for (let i = 0; i < 10; i++) {
      instances.push(pool.acquire('particle', {}));
    }
    for (const inst of instances) {
      pool.release(inst!);
    }
    const stats = pool.getStats();
    expect(stats.active).toBe(0);
    expect(stats.idle).toBe(200);
    expect(stats.dropped).toBe(0);
  });

  it('pool works correctly after multiple exhaustion cycles', () => {
    // Exhaust
    const acquired = [];
    for (let i = 0; i < 20; i++) {
      acquired.push(pool.acquire('flash', {}));
    }
    expect(pool.acquire('flash', {})).toBeNull();

    // Release all
    for (const inst of acquired) {
      pool.release(inst!);
    }

    // Re-acquire
    const reAcquired = [];
    for (let i = 0; i < 20; i++) {
      reAcquired.push(pool.acquire('flash', {}));
    }
    expect(reAcquired.filter(Boolean).length).toBe(20);
  });

  it('different types are independent', () => {
    for (let i = 0; i < 100; i++) {
      pool.acquire('particle', {});
    }
    // Particles exhausted but flashes still available
    expect(pool.acquire('particle', {})).toBeNull();
    expect(pool.acquire('flash', {})).not.toBeNull();
  });

  it('getStats returns correct counts after mixed operations', () => {
    const p1 = pool.acquire('particle', {});
    const p2 = pool.acquire('particle', {});
    const f1 = pool.acquire('flash', {});
    pool.release(p1!);
    const stats = pool.getStats();
    expect(stats.active).toBe(2); // p2 + f1
    expect(stats.idle).toBe(198);
    void p2;
    void f1;
  });

  it('zero-limit pool type immediately drops', () => {
    const zeroConfig = {
      ...config,
      pool: { maxParticles: 0, maxFlashes: 0, maxTrails: 0, maxOverlays: 0 },
    };
    const zeroPool = new VFXPool(zeroConfig);
    expect(zeroPool.acquire('particle', {})).toBeNull();
    expect(zeroPool.getStats().dropped).toBe(1);
  });

  it('pool handles single-slot type correctly', () => {
    const singleConfig = {
      ...config,
      pool: { maxParticles: 1, maxFlashes: 1, maxTrails: 1, maxOverlays: 1 },
    };
    const singlePool = new VFXPool(singleConfig);
    const inst = singlePool.acquire('particle', {});
    expect(inst).not.toBeNull();
    expect(singlePool.acquire('particle', {})).toBeNull();
    singlePool.release(inst!);
    expect(singlePool.acquire('particle', {})).not.toBeNull();
  });

  it('acquire with empty params works', () => {
    const inst = pool.acquire('overlay', {});
    expect(inst).not.toBeNull();
    expect(inst!.type).toBe('overlay');
  });

  it('each instance has unique poolId', () => {
    const ids = new Set<number>();
    for (let i = 0; i < 10; i++) {
      const inst = pool.acquire('particle', {});
      if (inst) ids.add(inst.poolId);
    }
    expect(ids.size).toBe(10);
  });

  it('evictLRU does not evict active instances', () => {
    const inst = pool.acquire('particle', {});
    // Only inst is active; no idle particles besides the remaining 99
    // Release it, then evict
    pool.release(inst!);
    const evicted = pool.evictLRU('particle');
    expect(evicted).not.toBeNull();
  });

  it('updateConfig preserves active instances when limits unchanged', () => {
    const inst = pool.acquire('particle', { x: 42 });
    expect(inst).not.toBeNull();
    // Update config with same limits but different quality
    pool.updateConfig({ ...config, quality: 'low' });
    // Active instance should still be in pool
    const stats = pool.getStats();
    expect(stats.active).toBe(1);
    // Should still be able to acquire more
    const inst2 = pool.acquire('particle', {});
    expect(inst2).not.toBeNull();
  });
});

// ===================================================================
// VFXOrchestrator
// ===================================================================

describe('VFXOrchestrator', () => {
  let orchestrator: VFXOrchestrator;

  beforeEach(() => {
    orchestrator = new VFXOrchestrator(VFX_DEFAULTS);
  });

  it('chat event produces no VFX', () => {
    const result = orchestrator.triggerVFX(makeEvent('chat', { comment: 'hello' }));
    expect(result.commands).toHaveLength(0);
    expect(result.dropped).toBe(false);
  });

  it('chat with !ability produces ability sequence', () => {
    const result = orchestrator.triggerVFX(
      makeEvent('chat', { comment: '!ability fireball' }),
    );
    expect(result.commands.length).toBeGreaterThan(0);
    expect(result.commands[0]!.type).toBe('SPAWN_VFX');
  });

  it('like event produces particle burst', () => {
    const result = orchestrator.triggerVFX(makeEvent('like'));
    expect(result.commands.length).toBeGreaterThan(0);
    expect(result.commands[0]!.type).toBe('SPAWN_VFX');
    expect(result.commands[0]!.metadata?.['vfxType']).toBe('particle');
  });

  it('follow event produces overlay + spotlight', () => {
    const result = orchestrator.triggerVFX(makeEvent('follow'));
    const types = result.commands.map((c) => c.type);
    expect(types).toContain('SPAWN_VFX');
    expect(types).toContain('SPOTLIGHT_CARD');
  });

  it('share event produces trail + callout', () => {
    const result = orchestrator.triggerVFX(makeEvent('share'));
    const types = result.commands.map((c) => c.type);
    expect(types).toContain('SPAWN_VFX');
    expect(types).toContain('SUPPORTER_CALLOUT');
  });

  it('gift event produces flash + camera impulse', () => {
    const result = orchestrator.triggerVFX(
      makeEvent('gift', {
        gift: {
          id: 'gift_001',
          name: 'Rose',
          repeatCount: 1,
        },
      }),
    );
    const types = result.commands.map((c) => c.type);
    expect(types).toContain('SPAWN_VFX');
    expect(types).toContain('CAMERA_IMPULSE');
  });

  it('cinematic gift adds ability sequence', () => {
    const result = orchestrator.triggerVFX(
      makeEvent('gift', {
        gift: {
          id: 'gift_015',
          name: 'Phoenix',
          repeatCount: 100,
        },
      }),
    );
    // Should have flash + camera + ability particle
    expect(result.commands.length).toBeGreaterThanOrEqual(3);
  });

  it('subscription produces overlay + spotlight + trail', () => {
    const result = orchestrator.triggerVFX(makeEvent('subscribe'));
    const types = result.commands.map((c) => c.type);
    expect(types).toContain('SPAWN_VFX');
    expect(types).toContain('SPOTLIGHT_CARD');
  });

  it('low quality reduces particle count', () => {
    const lowOrch = new VFXOrchestrator({ ...VFX_DEFAULTS, quality: 'low' });
    const result = lowOrch.triggerVFX(makeEvent('like'));
    const particleCount = result.commands[0]!.metadata?.['particleCount'];
    expect(particleCount).toBeLessThan(10);
  });

  it('high quality produces full particle count', () => {
    const result = orchestrator.triggerVFX(makeEvent('like'));
    const particleCount = result.commands[0]!.metadata?.['particleCount'];
    expect(particleCount).toBe(10);
  });

  it('motion reduction disables camera impulse for gifts', () => {
    const motionOrch = new VFXOrchestrator({
      ...VFX_DEFAULTS,
      motionReduction: true,
    });
    const result = motionOrch.triggerVFX(
      makeEvent('gift', {
        gift: { id: 'gift_001', name: 'Rose', repeatCount: 1 },
      }),
    );
    const impulseCmd = result.commands.find((c) => c.type === 'CAMERA_IMPULSE');
    expect(impulseCmd).toBeUndefined();
  });

  it('motion reduction shortens trail duration for shares', () => {
    const motionOrch = new VFXOrchestrator({
      ...VFX_DEFAULTS,
      motionReduction: true,
    });
    const result = motionOrch.triggerVFX(makeEvent('share'));
    const vfxCmd = result.commands.find((c) => c.type === 'SPAWN_VFX');
    expect(vfxCmd!.metadata?.['duration']).toBe(1000);
  });

  it('color-blind mode adds pattern to likes', () => {
    const cbOrch = new VFXOrchestrator({
      ...VFX_DEFAULTS,
      colorBlindMode: true,
    });
    const result = cbOrch.triggerVFX(makeEvent('like'));
    // The acquired VFX instance should have pattern
    expect(result.vfxAcquired).not.toBeNull();
    expect(result.vfxAcquired!.params.pattern).toBe('dots');
  });

  it('color-blind mode adds pattern to follows', () => {
    const cbOrch = new VFXOrchestrator({
      ...VFX_DEFAULTS,
      colorBlindMode: true,
    });
    const result = cbOrch.triggerVFX(makeEvent('follow'));
    expect(result.vfxAcquired!.params.pattern).toBe('stripes');
  });

  it('color-blind mode adds pattern to shares', () => {
    const cbOrch = new VFXOrchestrator({
      ...VFX_DEFAULTS,
      colorBlindMode: true,
    });
    const result = cbOrch.triggerVFX(makeEvent('share'));
    expect(result.vfxAcquired!.params.pattern).toBe('zigzag');
  });

  it('text sanitization strips HTML tags', () => {
    const result = orchestrator.triggerVFX(
      makeEvent('follow', {
        user: { id: 'v1', handle: '@v1', displayName: '<script>alert(1)</script>Evil' },
      }),
    );
    const spotlight = result.commands.find((c) => c.type === 'SPOTLIGHT_CARD');
    expect(spotlight).toBeDefined();
    const name = spotlight!.metadata?.['viewerName'];
    expect(name).not.toContain('<script>');
    expect(name).not.toContain('</script>');
    expect(name).not.toContain('<');
  });

  it('text sanitization strips control chars', () => {
    expect(sanitizeText('hello\x00world')).toBe('helloworld');
  });

  it('text sanitization caps at maxLen', () => {
    expect(sanitizeText('a'.repeat(200), 50).length).toBe(50);
  });

  it('pool exhaustion results in dropped=true', () => {
    // Exhaust all overlays (30)
    for (let i = 0; i < 30; i++) {
      orchestrator.triggerVFX(makeEvent('follow'));
    }
    // Next follow should drop
    const result = orchestrator.triggerVFX(makeEvent('follow'));
    expect(result.dropped).toBe(true);
  });

  it('getStats returns pool stats', () => {
    orchestrator.triggerVFX(makeEvent('like'));
    const stats = orchestrator.getStats();
    expect(stats.active).toBeGreaterThan(0);
    expect(typeof stats.idle).toBe('number');
    expect(typeof stats.dropped).toBe('number');
  });

  it('reloadConfig updates orchestrator', () => {
    orchestrator.reloadConfig({ ...VFX_DEFAULTS, quality: 'low' });
    expect(orchestrator.getConfig().quality).toBe('low');
  });

  it('unknown event type returns empty result', () => {
    const result = orchestrator.triggerVFX(makeEvent('join'));
    expect(result.commands).toHaveLength(0);
  });

  it('provider_status event returns empty result', () => {
    const result = orchestrator.triggerVFX(makeEvent('provider_status'));
    expect(result.commands).toHaveLength(0);
  });

  it('drainCommands returns all emitted commands since last drain', () => {
    // Trigger 5 events
    orchestrator.triggerVFX(makeEvent('like'));
    orchestrator.triggerVFX(makeEvent('follow'));
    orchestrator.triggerVFX(makeEvent('share'));
    orchestrator.triggerVFX(
      makeEvent('gift', { gift: { id: 'g1', name: 'Rose', repeatCount: 1 } }),
    );
    orchestrator.triggerVFX(makeEvent('subscribe'));

    const cmds = orchestrator.drainCommands();
    expect(cmds.length).toBeGreaterThanOrEqual(5);

    // Second drain returns 0
    const cmds2 = orchestrator.drainCommands();
    expect(cmds2).toHaveLength(0);
  });

  it('sanitizeText strips Unicode bidi override characters', () => {
    expect(sanitizeText('Admin\u202Etest')).toBe('Admintest');
    expect(sanitizeText('Hello\u200BWorld')).toBe('HelloWorld');
    expect(sanitizeText('A\u200FB')).toBe('AB');
    expect(sanitizeText('\uFEFFbom')).toBe('bom');
    expect(sanitizeText('x\u202Ay')).toBe('xy');
  });

  it('orchestrator downgrades quality when frameRateBudget is exceeded', () => {
    // Use a realistic frameRateBudget but seed rolling average to exceed it
    const orch = new VFXOrchestrator({ ...VFX_DEFAULTS, frameRateBudget: 60 });
    // Seed rolling average to 20ms (over 60fps budget of ~16.67ms)
    orch.seedRollingAvg(20);
    // Low-priority events (chat, like) should be dropped under budget pressure
    const result = orch.triggerVFX(makeEvent('like'));
    expect(result.dropped).toBe(true);
    expect(orch.isQualityDowngraded()).toBe(true);
    // High-priority events should still get through
    const result2 = orch.triggerVFX(makeEvent('follow'));
    expect(result2.dropped).toBe(false);
  });
});

// ===================================================================
// sanitizeText
// ===================================================================

describe('sanitizeText', () => {
  it('strips HTML tags', () => {
    expect(sanitizeText('<b>bold</b>')).toBe('bold');
  });

  it('strips angle brackets', () => {
    expect(sanitizeText('<img onerror=x>')).toBe('');
  });

  it('strips control characters', () => {
    expect(sanitizeText('test\x01\x02\x03')).toBe('test');
  });

  it('caps length', () => {
    expect(sanitizeText('x'.repeat(200), 10)).toBe('x'.repeat(10));
  });

  it('preserves safe text', () => {
    expect(sanitizeText('Hello World 123')).toBe('Hello World 123');
  });
});
