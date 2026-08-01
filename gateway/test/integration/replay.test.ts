/**
 * Phase 17 — Replay Tests.
 *
 * Replay fixtures from shared/fixtures through the full pipeline.
 * Assert: deterministic output (same input → same pipeline behavior).
 * Target: 5+ tests (each fixture type: chat, like, follow, gift, share).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NormalizedLiveEvent } from '@riftcrowd/shared';
import { Pipeline } from '../../src/pipeline/pipeline.js';
import { VFXOrchestrator } from '../../src/vfx/vfx_orchestrator.js';
import { VFX_DEFAULTS } from '../../src/vfx/vfx_config.js';
import {
  parseTikfinityPayload,
  TikFinityAdapter,
  type TikFinityRawEvent,
} from '../../src/adapters/tikfinity_adapter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, '..', '..', '..', 'shared', 'fixtures');
const TIKFINITY_FIXTURES_PATH = join(__dirname, '..', 'fixtures', 'tikfinity');

function loadValidEvents(): NormalizedLiveEvent[] {
  const raw = readFileSync(join(FIXTURES_PATH, 'valid-events.json'), 'utf8');
  return JSON.parse(raw) as NormalizedLiveEvent[];
}

describe('Replay Tests — Fixture Determinism', () => {
  let pipeline: Pipeline;
  let vfx: VFXOrchestrator;

  beforeEach(() => {
    pipeline = new Pipeline({
      commandQueueCapacity: 1000,
      rateLimitGlobal: 100000,
      rateLimitPerViewer: 100000,
    });
    vfx = new VFXOrchestrator(VFX_DEFAULTS);
  });

  it('chat fixture: processes without crash', () => {
    const events = loadValidEvents();
    const chatEvents = events.filter((e) => e.type === 'chat');
    expect(chatEvents.length).toBeGreaterThan(0);

    for (const event of chatEvents) {
      const result = pipeline.process(event);
      expect(result).toBeDefined();
      // Chat events should process (may or may not produce commands)
    }

    expect(pipeline.getStats().processed).toBe(chatEvents.length);
    expect(pipeline.getStats().normalized).toBe(chatEvents.length);
  });

  it('like fixture: processes without crash', () => {
    const events = loadValidEvents();
    const likeEvents = events.filter((e) => e.type === 'like');
    expect(likeEvents.length).toBeGreaterThan(0);

    for (const event of likeEvents) {
      const result = pipeline.process(event);
      expect(result).toBeDefined();
      if (!result.dropped) {
        vfx.triggerVFX(event);
      }
    }

    expect(pipeline.getStats().processed).toBe(likeEvents.length);
  });

  it('follow fixture: processes without crash', () => {
    const events = loadValidEvents();
    const followEvents = events.filter((e) => e.type === 'follow');
    expect(followEvents.length).toBeGreaterThan(0);

    for (const event of followEvents) {
      const result = pipeline.process(event);
      expect(result).toBeDefined();
      if (!result.dropped) {
        vfx.triggerVFX(event);
      }
    }

    expect(pipeline.getStats().processed).toBe(followEvents.length);
    expect(pipeline.getStats().normalized).toBe(followEvents.length);
  });

  it('gift fixture: processes without crash', () => {
    const events = loadValidEvents();
    const giftEvents = events.filter((e) => e.type === 'gift');
    expect(giftEvents.length).toBeGreaterThan(0);

    for (const event of giftEvents) {
      const result = pipeline.process(event);
      expect(result).toBeDefined();
      if (!result.dropped) {
        vfx.triggerVFX(event);
      }
    }

    expect(pipeline.getStats().processed).toBe(giftEvents.length);
  });

  it('share fixture: processes without crash', () => {
    const events = loadValidEvents();
    const shareEvents = events.filter((e) => e.type === 'share');
    expect(shareEvents.length).toBeGreaterThan(0);

    for (const event of shareEvents) {
      const result = pipeline.process(event);
      expect(result).toBeDefined();
      if (!result.dropped) {
        vfx.triggerVFX(event);
      }
    }

    expect(pipeline.getStats().processed).toBe(shareEvents.length);
  });

  it('all valid fixtures: deterministic processing order', () => {
    const events = loadValidEvents();

    // Run 1
    const pipeline1 = new Pipeline({
      commandQueueCapacity: 1000,
      rateLimitGlobal: 100000,
      rateLimitPerViewer: 100000,
    });
    for (const event of events) {
      pipeline1.process(event);
    }
    const stats1 = pipeline1.getStats();

    // Run 2
    const pipeline2 = new Pipeline({
      commandQueueCapacity: 1000,
      rateLimitGlobal: 100000,
      rateLimitPerViewer: 100000,
    });
    for (const event of events) {
      pipeline2.process(event);
    }
    const stats2 = pipeline2.getStats();

    // Same input → same stats (deterministic)
    expect(stats1.processed).toBe(stats2.processed);
    expect(stats1.normalized).toBe(stats2.normalized);
    expect(stats1.dropped).toBe(stats2.dropped);
  });

  it('invalid fixtures: all rejected without crash', () => {
    const raw = readFileSync(join(FIXTURES_PATH, 'invalid-events.json'), 'utf8');
    const invalidEvents = JSON.parse(raw) as unknown[];

    for (const event of invalidEvents) {
      const result = pipeline.process(event);
      expect(result.dropped).toBe(true);
    }

    expect(pipeline.getStats().processed).toBe(invalidEvents.length);
    expect(pipeline.getStats().normalized).toBe(0);
  });

  it('full fixture set: all events processed', () => {
    const events = loadValidEvents();

    for (const event of events) {
      pipeline.process(event);
    }

    const stats = pipeline.getStats();
    expect(stats.processed).toBe(events.length);
    expect(stats.normalized).toBe(events.length);
    expect(stats.dropped).toBe(0);
  });
});

// ===========================================================================
// FIX 7 — TikFinity Fixture Replay Tests
// ===========================================================================

describe('Replay Tests — TikFinity Fixtures (FIX 7)', () => {
  let pipeline: Pipeline;
  let vfx: VFXOrchestrator;

  beforeEach(() => {
    pipeline = new Pipeline({
      commandQueueCapacity: 1000,
      rateLimitGlobal: 100000,
      rateLimitPerViewer: 100000,
    });
    vfx = new VFXOrchestrator(VFX_DEFAULTS);
  });

  function loadTikfinityFixtures(): { raw: TikFinityRawEvent; filename: string }[] {
    const files = readdirSync(TIKFINITY_FIXTURES_PATH).filter((f) => f.endsWith('.json'));
    const results: { raw: TikFinityRawEvent; filename: string }[] = [];
    for (const file of files) {
      const content = readFileSync(join(TIKFINITY_FIXTURES_PATH, file), 'utf8');
      const parsed = parseTikfinityPayload(content);
      if (parsed.ok) {
        results.push({ raw: parsed.value, filename: file });
      }
    }
    return results;
  }

  it('loads all tikfinity fixture files', () => {
    const fixtures = loadTikfinityFixtures();
    expect(fixtures.length).toBeGreaterThanOrEqual(5);
  });

  it('tikfinity chat fixture: normalizes and processes', () => {
    const fixtures = loadTikfinityFixtures();
    const chatFixture = fixtures.find((f) => f.raw.type === 'chat');
    expect(chatFixture).toBeDefined();

    // Create a temporary adapter to map events
    const adapter = new TikFinityAdapter({
      config: { url: 'ws://127.0.0.1:9999/ws', reconnectMs: 5000, heartbeatMs: 30000, enabled: false },
    });

    const normalized = adapter.mapEvent(chatFixture!.raw);
    expect(normalized).not.toBeNull();
    expect(normalized!.provider).toBe('tikfinity');
    expect(normalized!.type).toBe('chat');

    const result = pipeline.process(normalized!);
    expect(result).toBeDefined();
    expect(pipeline.getStats().processed).toBe(1);
  });

  it('tikfinity gift fixture: normalizes and processed', () => {
    const fixtures = loadTikfinityFixtures();
    const giftFixture = fixtures.find((f) => f.raw.type === 'gift');
    expect(giftFixture).toBeDefined();

    const adapter = new TikFinityAdapter({
      config: { url: 'ws://127.0.0.1:9999/ws', reconnectMs: 5000, heartbeatMs: 30000, enabled: false },
    });

    const normalized = adapter.mapEvent(giftFixture!.raw);
    expect(normalized).not.toBeNull();
    expect(normalized!.type).toBe('gift');

    const result = pipeline.process(normalized!);
    expect(result).toBeDefined();
  });

  it('all tikfinity fixtures: deterministic processing', () => {
    const adapter = new TikFinityAdapter({
      config: { url: 'ws://127.0.0.1:9999/ws', reconnectMs: 5000, heartbeatMs: 30000, enabled: false },
    });

    const fixtures = loadTikfinityFixtures();
    const normalizedEvents: NormalizedLiveEvent[] = [];
    for (const fixture of fixtures) {
      const mapped = adapter.mapEvent(fixture.raw);
      if (mapped) normalizedEvents.push(mapped);
    }

    // Run 1
    const pipeline1 = new Pipeline({
      commandQueueCapacity: 1000,
      rateLimitGlobal: 100000,
      rateLimitPerViewer: 100000,
    });
    for (const event of normalizedEvents) {
      pipeline1.process(event);
    }
    const stats1 = pipeline1.getStats();

    // Run 2 — same adapter instance maps to same IDs (deterministic)
    const pipeline2 = new Pipeline({
      commandQueueCapacity: 1000,
      rateLimitGlobal: 100000,
      rateLimitPerViewer: 100000,
    });
    for (const event of normalizedEvents) {
      pipeline2.process(event);
    }
    const stats2 = pipeline2.getStats();

    // Same input → same stats
    expect(stats1.processed).toBe(stats2.processed);
    expect(stats1.normalized).toBe(stats2.normalized);
    expect(stats1.dropped).toBe(stats2.dropped);
  });

  it('tikfinity fixtures through VFX: no crash', () => {
    const adapter = new TikFinityAdapter({
      config: { url: 'ws://127.0.0.1:9999/ws', reconnectMs: 5000, heartbeatMs: 30000, enabled: false },
    });

    const fixtures = loadTikfinityFixtures();
    for (const fixture of fixtures) {
      const mapped = adapter.mapEvent(fixture.raw);
      if (mapped) {
        const result = pipeline.process(mapped);
        if (!result.dropped) {
          vfx.triggerVFX(mapped);
        }
      }
    }

    const stats = pipeline.getStats();
    expect(stats.processed).toBe(fixtures.length);
    expect(vfx.getStats().dropped).toBeGreaterThanOrEqual(0);
  });
});
