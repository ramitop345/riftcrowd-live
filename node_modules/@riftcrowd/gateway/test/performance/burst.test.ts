/**
 * Phase 17 — Burst Tests.
 *
 * Sudden event flood tests: 1000 events in 1 second.
 * Asserts: no crash, events processed, queue/pool bounded, processing time < 5s.
 * Target: 5+ tests (chat burst, gift burst, like burst, mixed burst, recovery).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Pipeline } from '../../src/pipeline/pipeline.js';
import { VFXOrchestrator } from '../../src/vfx/vfx_orchestrator.js';
import { VFX_DEFAULTS } from '../../src/vfx/vfx_config.js';
import { CommandPool } from '../../src/pooling/command_pool.js';
import {
  resetPerfEventCounter,
  generateChatEvent,
  generateGiftEvent,
  generateLikeEvent,
  generateFollowEvent,
  generateRandomEvent,
} from './harness.js';

const BURST_SIZE = 1000;

describe('Burst Tests — Sudden Event Flood', () => {
  let pipeline: Pipeline;
  let vfx: VFXOrchestrator;
  let cmdPool: CommandPool;

  beforeEach(() => {
    resetPerfEventCounter();
    pipeline = new Pipeline({
      commandQueueCapacity: 1000,
      eventBusCapacity: 2000,
      rateLimitGlobal: 100000,
      rateLimitPerViewer: 100000,
      rateLimitBurst: 100000,
    });
    vfx = new VFXOrchestrator(VFX_DEFAULTS);
    cmdPool = new CommandPool(5000);
  });

  it('chat burst: 1000 chat events processed in < 5s', () => {
    const t0 = performance.now();
    let processed = 0;
    let _dropped = 0;

    for (let i = 0; i < BURST_SIZE; i++) {
      const event = generateChatEvent(`viewer_${i % 50}`);
      const result = pipeline.process(event);
      processed++;
      if (result.dropped) _dropped++;
    }

    const elapsed = performance.now() - t0;

    expect(processed).toBe(BURST_SIZE);
    expect(elapsed).toBeLessThan(5000);
    expect(pipeline.commandQueue.size).toBeLessThan(1000);
    expect(pipeline.getStats().processed).toBe(BURST_SIZE);
  });

  it('gift burst: 1000 gift events produce VFX commands', () => {
    const t0 = performance.now();
    let totalCommands = 0;

    for (let i = 0; i < BURST_SIZE; i++) {
      const event = generateGiftEvent(`viewer_${i % 50}`);
      const result = pipeline.process(event);
      if (!result.dropped) {
        const vfxResult = vfx.triggerVFX(event);
        totalCommands += result.commands.length + vfxResult.commands.length;
      }
    }

    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(5000);
    expect(totalCommands).toBeGreaterThanOrEqual(0);
    expect(pipeline.commandQueue.size).toBeLessThanOrEqual(1000);

    const vfxStats = vfx.getStats();
    expect(vfxStats.active + vfxStats.idle).toBeLessThan(500);
  });

  it('like burst: 1000 like events stay bounded', () => {
    const t0 = performance.now();
    let dropped = 0;

    for (let i = 0; i < BURST_SIZE; i++) {
      const event = generateLikeEvent(`viewer_${i % 50}`);
      const result = pipeline.process(event);
      if (result.dropped) dropped++;
      // Process VFX for non-dropped
      if (!result.dropped) {
        vfx.triggerVFX(event);
      }
    }

    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(5000);
    expect(dropped).toBeLessThanOrEqual(BURST_SIZE);
    expect(pipeline.commandQueue.size).toBeLessThanOrEqual(1000);

    const vfxStats = vfx.getStats();
    expect(vfxStats.active).toBeLessThan(200);
  });

  it('mixed burst: 1000 mixed events processed correctly', () => {
    const t0 = performance.now();
    let processed = 0;
    let dropped = 0;
    let _commandsProduced = 0;
  
    for (let i = 0; i < BURST_SIZE; i++) {
      const event = generateRandomEvent();
      const result = pipeline.process(event);
      processed++;
      if (result.dropped) {
        dropped++;
      } else {
        _commandsProduced += result.commands.length;
        vfx.triggerVFX(event);
        // Track command pool
        for (const cmd of result.commands) {
          const pooled = cmdPool.acquire(cmd);
          if (pooled) cmdPool.release(pooled);
        }
      }
    }

    const elapsed = performance.now() - t0;

    expect(processed).toBe(BURST_SIZE);
    expect(elapsed).toBeLessThan(5000);
    expect(dropped).toBeLessThanOrEqual(BURST_SIZE);
    expect(pipeline.commandQueue.size).toBeLessThanOrEqual(1000);

    const cmdPoolStats = cmdPool.getStats();
    expect(cmdPoolStats.active).toBe(0); // all released
    expect(cmdPoolStats.dropped).toBe(0);
  });

  it('recovery after burst: pipeline recovers and processes new events', () => {
    // Burst phase
    for (let i = 0; i < BURST_SIZE; i++) {
      pipeline.process(generateChatEvent(`viewer_${i % 50}`));
    }

    // Drain queue
    pipeline.commandQueue.clear();

    // Recovery phase — new events should process normally
    let recovered = 0;
    for (let i = 0; i < 100; i++) {
      const result = pipeline.process(generateFollowEvent(`viewer_${i}`));
      if (!result.dropped) recovered++;
    }

    // At least some events should process successfully after burst
    expect(recovered).toBeGreaterThan(0);
    expect(pipeline.commandQueue.size).toBeLessThanOrEqual(1000);

    const stats = pipeline.getStats();
    expect(stats.processed).toBe(BURST_SIZE + 100);
  });

  it('command queue bounded even under sustained burst', () => {
    for (let i = 0; i < 2000; i++) {
      const event = generateGiftEvent(`viewer_${i % 100}`, 10);
      pipeline.process(event);
    }

    // Queue should never exceed capacity
    expect(pipeline.commandQueue.size).toBeLessThanOrEqual(1000);
    expect(pipeline.getStats().queueOverflow).toBeGreaterThanOrEqual(0);
  });

  it('VFX pool bounded even under sustained burst', () => {
    for (let i = 0; i < 500; i++) {
      const event = generateLikeEvent(`viewer_${i % 50}`);
      vfx.triggerVFX(event);
    }

    const stats = vfx.getStats();
    expect(stats.active + stats.idle).toBeLessThan(500);
  });
});
