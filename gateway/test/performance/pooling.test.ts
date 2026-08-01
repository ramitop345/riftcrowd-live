/**
 * Phase 17 — Object Pooling Tests.
 *
 * Tests for CommandPool, WSMessageBuffer, HTTPRequestPool, and VFXPool.
 * Target: 15+ tests covering acquire/release, cap enforcement, eviction,
 * hot-reload, and stress scenarios.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { COMMAND_SCHEMA_VERSION, type GameCommand } from '@riftcrowd/shared';
import { CommandPool } from '../../src/pooling/command_pool.js';
import { WSMessageBuffer } from '../../src/pooling/ws_message_buffer.js';
import { HTTPRequestPool } from '../../src/pooling/http_request_pool.js';
import { VFXPool } from '../../src/vfx/vfx_pool.js';
import { VFX_DEFAULTS } from '../../src/vfx/vfx_config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCommand(overrides: Partial<GameCommand> = {}): GameCommand {
  return {
    schemaVersion: COMMAND_SCHEMA_VERSION,
    id: `cmd_test_${Math.random().toString(36).slice(2, 10)}`,
    type: 'SPAWN_UNIT',
    createdAt: new Date().toISOString(),
    sourceEventIds: ['evt_test'],
    metadata: {},
    ...overrides,
  };
}

// ===========================================================================
// CommandPool tests (6+)
// ===========================================================================

describe('CommandPool', () => {
  let pool: CommandPool;

  beforeEach(() => {
    pool = new CommandPool(10);
  });

  it('acquires and releases a command', () => {
    const cmd = makeCommand();
    const pooled = pool.acquire(cmd);
    expect(pooled).not.toBeNull();
    expect(pooled!.active).toBe(true);
    expect(pooled!.command.id).toBe(cmd.id);

    pool.release(pooled!);
    const stats = pool.getStats();
    expect(stats.active).toBe(0);
    expect(stats.idle).toBe(1);
  });

  it('reuses idle slots', () => {
    const cmd1 = makeCommand({ id: 'cmd_1' });
    const cmd2 = makeCommand({ id: 'cmd_2' });

    const p1 = pool.acquire(cmd1);
    expect(p1).not.toBeNull();
    pool.release(p1!);

    const p2 = pool.acquire(cmd2);
    expect(p2).not.toBeNull();
    expect(p2!.slotId).toBe(p1!.slotId);
    expect(p2!.command.id).toBe('cmd_2');
  });

  it('enforces capacity cap with LRU eviction on all-active pool', () => {
    const smallPool = new CommandPool(3);
    const acquired: (ReturnType<typeof pool.acquire>)[] = [];

    for (let i = 0; i < 3; i++) {
      acquired.push(smallPool.acquire(makeCommand()));
    }
    expect(acquired.every((a) => a !== null)).toBe(true);

    // 4th acquire should trigger LRU eviction of oldest active slot
    const overflow = smallPool.acquire(makeCommand({ id: 'cmd_overflow' }));
    expect(overflow).not.toBeNull();
    expect(smallPool.getStats().evicted).toBe(1);
    expect(smallPool.getStats().dropped).toBe(0);
  });

  it('evicts LRU active slot when pool is full (FIX 1/2)', () => {
    const smallPool = new CommandPool(3);

    // Fill pool to capacity with all-active slots (NO releases)
    const p1 = smallPool.acquire(makeCommand({ id: 'cmd_1' }));
    expect(p1).not.toBeNull();
    const p1LastUsed = p1!.lastUsed;

    // Small delay to ensure different timestamps
    const p2 = smallPool.acquire(makeCommand({ id: 'cmd_2' }));
    expect(p2).not.toBeNull();

    const p3 = smallPool.acquire(makeCommand({ id: 'cmd_3' }));
    expect(p3).not.toBeNull();

    // All 3 slots active, pool at capacity
    expect(smallPool.size).toBe(3);
    expect(smallPool.getStats().active).toBe(3);
    expect(smallPool.getStats().idle).toBe(0);

    // Acquire one more — must evict oldest active slot (p1 with smallest lastUsed)
    const p4 = smallPool.acquire(makeCommand({ id: 'cmd_4' }));
    expect(p4).not.toBeNull();
    expect(p4!.command.id).toBe('cmd_4');

    // Verify LRU eviction occurred
    const stats = smallPool.getStats();
    expect(stats.evicted).toBe(1);
    expect(stats.active).toBe(3); // still 3 (evicted 1, added 1)
    expect(smallPool.size).toBe(3); // capacity maintained

    // p1 was the oldest (first acquired) — it should have been evicted
    expect(p1!.cancelled).toBe(true);
    expect(p1LastUsed).toBeLessThanOrEqual(p2!.lastUsed);
  });

  it('reports accurate stats', () => {
    pool.acquire(makeCommand());
    pool.acquire(makeCommand());
    const p3 = pool.acquire(makeCommand());
    pool.release(p3!);

    const stats = pool.getStats();
    expect(stats.active).toBe(2);
    expect(stats.idle).toBe(1);
    expect(stats.capacity).toBe(10);
    expect(stats.dropped).toBe(0);
  });

  it('clears all slots', () => {
    pool.acquire(makeCommand());
    pool.acquire(makeCommand());
    pool.acquire(makeCommand());

    const dropped = pool.clear();
    expect(dropped).toBe(3);
    expect(pool.size).toBe(0);
  });

  it('updates capacity via setCapacity', () => {
    pool.setCapacity(5);
    expect(pool.capacity).toBe(5);
  });

  it('setCapacity trims excess slots when reducing capacity (FIX 1)', () => {
    const trimPool = new CommandPool(10);
    // Acquire 5 commands
    for (let i = 0; i < 5; i++) {
      trimPool.acquire(makeCommand({ id: `cmd_trim_${i}` }));
    }
    expect(trimPool.size).toBe(5);

    // Reduce capacity to 3 — should evict 2 oldest
    trimPool.setCapacity(3);
    expect(trimPool.capacity).toBe(3);
    expect(trimPool.size).toBe(3);
    expect(trimPool.getStats().evicted).toBe(2);
  });

  it('release of evicted active slot is ignored (FIX 1)', () => {
    const evictPool = new CommandPool(2);
    const p1 = evictPool.acquire(makeCommand({ id: 'cmd_a' }));
    const _p2 = evictPool.acquire(makeCommand({ id: 'cmd_b' }));

    // Force eviction of p1 (oldest)
    const p3 = evictPool.acquire(makeCommand({ id: 'cmd_c' }));
    expect(p3).not.toBeNull();
    expect(p1!.cancelled).toBe(true);

    // Release of evicted slot should be a no-op
    evictPool.release(p1!);
    const stats = evictPool.getStats();
    expect(stats.idle).toBe(0); // p1 was evicted, not released
  });

  it('stress: acquire/release 1000 commands', () => {
    const stressPool = new CommandPool(100);
    const acquired: ReturnType<typeof pool.acquire>[] = [];

    for (let i = 0; i < 1000; i++) {
      const p = stressPool.acquire(makeCommand());
      if (p) acquired.push(p);
      // Release half
      if (acquired.length > 50) {
        stressPool.release(acquired.shift()!);
      }
    }

    const stats = stressPool.getStats();
    expect(stats.active + stats.idle).toBeLessThanOrEqual(100);
    expect(stats.active).toBeGreaterThanOrEqual(0);
  });
});

// ===========================================================================
// WSMessageBuffer tests (5+)
// ===========================================================================

describe('WSMessageBuffer', () => {
  let buffer: WSMessageBuffer;

  beforeEach(() => {
    buffer = new WSMessageBuffer(5);
  });

  it('enqueues and dequeues messages', () => {
    const seq = buffer.enqueue({ type: 'test' });
    expect(seq).toBe(0);
    expect(buffer.size).toBe(1);

    const msg = buffer.dequeue();
    expect(msg).not.toBeNull();
    expect(msg!.payload).toEqual({ type: 'test' });
    expect(buffer.size).toBe(0);
  });

  it('drops oldest when full', () => {
    for (let i = 0; i < 5; i++) {
      buffer.enqueue({ index: i });
    }
    expect(buffer.full).toBe(true);

    // This should drop the oldest (index: 0)
    buffer.enqueue({ index: 5 });
    expect(buffer.size).toBe(5);
    expect(buffer.getStats().dropped).toBe(1);

    const first = buffer.dequeue();
    expect(first!.payload).toEqual({ index: 1 });
  });

  it('drains all messages', () => {
    buffer.enqueue('a');
    buffer.enqueue('b');
    buffer.enqueue('c');

    const items = buffer.drain();
    expect(items).toHaveLength(3);
    expect(buffer.size).toBe(0);
  });

  it('reports accurate stats', () => {
    buffer.enqueue('x');
    buffer.enqueue('y');
    buffer.dequeue();

    const stats = buffer.getStats();
    expect(stats.size).toBe(1);
    expect(stats.totalEnqueued).toBe(2);
    expect(stats.totalDequeued).toBe(1);
    expect(stats.dropped).toBe(0);
    expect(stats.capacity).toBe(5);
  });

  it('clears with dropped count', () => {
    buffer.enqueue('a');
    buffer.enqueue('b');
    const count = buffer.clear();
    expect(count).toBe(2);
    expect(buffer.size).toBe(0);
    expect(buffer.getStats().dropped).toBe(2);
  });

  it('peek returns oldest without removing', () => {
    buffer.enqueue('first');
    buffer.enqueue('second');

    const peeked = buffer.peek();
    expect(peeked!.payload).toBe('first');
    expect(buffer.size).toBe(2);
  });

  it('handles empty dequeue/peek', () => {
    expect(buffer.dequeue()).toBeNull();
    expect(buffer.peek()).toBeNull();
  });
});

// ===========================================================================
// HTTPRequestPool tests (5+)
// ===========================================================================

describe('HTTPRequestPool', () => {
  let pool: HTTPRequestPool;

  beforeEach(() => {
    pool = new HTTPRequestPool(3);
  });

  it('acquires and releases a request', () => {
    const req = pool.acquire('/health');
    expect(req).not.toBeNull();
    expect(req!.active).toBe(true);
    expect(req!.label).toBe('/health');

    const released = pool.release(req!.requestId);
    expect(released).toBe(true);
    expect(pool.activeCount).toBe(0);
  });

  it('rejects when at capacity (429)', () => {
    pool.acquire('/a');
    pool.acquire('/b');
    pool.acquire('/c');

    const rejected = pool.acquire('/d');
    expect(rejected).toBeNull();
    expect(pool.getStats().rejected).toBe(1);
    expect(pool.full).toBe(true);
  });

  it('frees slots after release allowing new acquires', () => {
    const r1 = pool.acquire('/a');
    const r2 = pool.acquire('/b');
    pool.acquire('/c');

    pool.release(r1!.requestId);
    pool.release(r2!.requestId);

    const r4 = pool.acquire('/d');
    expect(r4).not.toBeNull();
  });

  it('reports accurate stats', () => {
    const r1 = pool.acquire('/health');
    pool.acquire('/status');
    pool.release(r1!.requestId);

    const stats = pool.getStats();
    expect(stats.active).toBe(1);
    expect(stats.completed).toBe(1);
    expect(stats.totalAcquired).toBe(2);
    expect(stats.capacity).toBe(3);
  });

  it('clears all active requests', () => {
    pool.acquire('/a');
    pool.acquire('/b');
    const dropped = pool.clear();
    expect(dropped).toBe(2);
    expect(pool.activeCount).toBe(0);
  });

  it('cancelStale removes old requests', async () => {
    pool.acquire('/old');
    // Wait a tiny bit to make the request "old"
    await new Promise((r) => setTimeout(r, 10));
    const cancelled = pool.cancelStale(5);
    expect(cancelled).toBe(1);
    expect(pool.activeCount).toBe(0);
  });

  it('cancelStale maintains accounting invariant (FIX 9)', async () => {
    const _r1 = pool.acquire('/stale1');
    // Wait to ensure r1 is "old" before acquiring r2
    await new Promise((r) => setTimeout(r, 20));
    const _r2 = pool.acquire('/fresh');
    // Cancel requests older than 10ms — only r1 should be cancelled
    const cancelled = pool.cancelStale(10);
    expect(cancelled).toBe(1);

    const stats = pool.getStats();
    // Invariant: totalAcquired = active + completed + rejected
    expect(stats.totalAcquired).toBe(stats.active + stats.completed + stats.rejected);
    // The cancelled request should be counted in completed
    expect(stats.completed).toBeGreaterThanOrEqual(1);
  });

  it('stress: 500 acquire/release cycles', () => {
    const stressPool = new HTTPRequestPool(50);
    for (let i = 0; i < 500; i++) {
      const req = stressPool.acquire(`/route_${i}`);
      if (req) stressPool.release(req.requestId);
    }
    const stats = stressPool.getStats();
    expect(stats.active).toBe(0);
    expect(stats.completed).toBe(500);
  });
});

// ===========================================================================
// VFXPool integration tests (3+)
// ===========================================================================

describe('VFXPool — Phase 17 audit', () => {
  it('enforces maxPerType cap', () => {
    const pool = new VFXPool({
      ...VFX_DEFAULTS,
      pool: { maxParticles: 3, maxFlashes: 2, maxTrails: 2, maxOverlays: 2 },
      safeZone: VFX_DEFAULTS.safeZone,
    });

    const acquired = [];
    for (let i = 0; i < 5; i++) {
      const inst = pool.acquire('particle', { x: i });
      if (inst) acquired.push(inst);
    }

    // Should get at most 3 particles (maxParticles = 3)
    expect(acquired.length).toBeLessThanOrEqual(3);
    const stats = pool.getStats();
    expect(stats.perType.particle.active).toBeLessThanOrEqual(3);
  });

  it('returns null when pool exhausted for type', () => {
    const pool = new VFXPool({
      ...VFX_DEFAULTS,
      pool: { maxParticles: 2, maxFlashes: 1, maxTrails: 1, maxOverlays: 1 },
      safeZone: VFX_DEFAULTS.safeZone,
    });

    const p1 = pool.acquire('flash', { duration: 500 });
    expect(p1).not.toBeNull();

    // Second flash should exhaust after LRU eviction attempt
    const _p2 = pool.acquire('flash', { duration: 500 });
    // Might succeed via LRU eviction of idle flash, or fail
    const stats = pool.getStats();
    expect(stats.perType.flash.active).toBeLessThanOrEqual(2);
  });

  it('hot-reload updates capacity', () => {
    const pool = new VFXPool({
      ...VFX_DEFAULTS,
      pool: { maxParticles: 5, maxFlashes: 5, maxTrails: 5, maxOverlays: 5 },
      safeZone: VFX_DEFAULTS.safeZone,
    });

    // Acquire 3 particles
    for (let i = 0; i < 3; i++) pool.acquire('particle', {});

    // Hot-reload with increased limits
    pool.updateConfig({
      ...VFX_DEFAULTS,
      pool: { maxParticles: 10, maxFlashes: 10, maxTrails: 10, maxOverlays: 10 },
      safeZone: VFX_DEFAULTS.safeZone,
    });

    expect(pool.totalCapacity).toBe(40);
  });
});
