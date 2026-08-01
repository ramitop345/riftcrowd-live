/**
 * Phase 14 — TikFinity fixture replay tests.
 *
 * Loads each redacted fixture, feeds through TikFinityAdapter's event parser,
 * asserts NormalizedLiveEvent shape and downstream command emission.
 * Target: ≥10 tests.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseTikfinityPayload,
  TikFinityAdapter,
  TikFinityConfigSchema,
} from '../src/adapters/tikfinity_adapter.js';
import { Pipeline } from '../src/pipeline/pipeline.js';
import { NormalizedLiveEventSchema } from '@riftcrowd/shared';
import type { NormalizedLiveEvent } from '@riftcrowd/shared';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures', 'tikfinity');

function loadFixture(name: string): unknown {
  const raw = readFileSync(join(FIXTURES_DIR, `${name}.json`), 'utf8');
  return JSON.parse(raw);
}

function makePipeline(): Pipeline {
  return new Pipeline({
    eventBusCapacity: 1000,
    dedupeCapacity: 10000,
    rateLimitPerViewer: 100,
    rateLimitBurst: 100,
    rateLimitGlobal: 1000,
    commandQueueCapacity: 500,
  });
}

/** Creates a lightweight TikFinityAdapter for pure mapping tests. */
function makeMapper(): TikFinityAdapter {
  return new TikFinityAdapter({
    config: TikFinityConfigSchema.parse({ url: 'ws://127.0.0.1:0/ws' }),
  });
}

// ===========================================================================
// 1. Fixture loading and validation
// ===========================================================================

describe('TikFinity fixture replay', () => {
  let adapter: TikFinityAdapter;
  beforeEach(() => {
    adapter = makeMapper();
    adapter.resetEventCounter();
  });

  const fixtureNames = ['chat', 'like', 'follow', 'share', 'subscription', 'gift'] as const;

  for (const name of fixtureNames) {
    it(`${name} fixture loads, validates, and maps to NormalizedLiveEvent`, () => {
      const fixture = loadFixture(name);
      const parsed = parseTikfinityPayload(JSON.stringify(fixture));
      expect(parsed.ok).toBe(true);

      if (parsed.ok) {
        const mapped = adapter.mapEvent(parsed.value);
        expect(mapped).not.toBeNull();

        // Validate against shared schema
        const schemaResult = NormalizedLiveEventSchema.safeParse(mapped);
        expect(schemaResult.success, `Schema validation failed for ${name}: ${JSON.stringify(schemaResult.error?.issues)}`).toBe(true);
      }
    });
  }

  it('chat fixture maps comment correctly', () => {
    const fixture = loadFixture('chat');
    const parsed = parseTikfinityPayload(JSON.stringify(fixture));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const mapped = adapter.mapEvent(parsed.value);
      expect(mapped!.comment).toContain('!strategy focus');
    }
  });

  it('gift fixture maps gift payload correctly', () => {
    const fixture = loadFixture('gift');
    const parsed = parseTikfinityPayload(JSON.stringify(fixture));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const mapped = adapter.mapEvent(parsed.value);
      expect(mapped!.gift!.id).toBe('gift_rose_001');
      expect(mapped!.gift!.name).toBe('Rose');
      expect(mapped!.gift!.repeatCount).toBe(3);
    }
  });

  it('all fixtures produce valid NormalizedLiveEvent through pipeline', () => {
    const pipeline = makePipeline();
    let normalized = 0;

    for (const name of fixtureNames) {
      const fixture = loadFixture(name);
      const parsed = parseTikfinityPayload(JSON.stringify(fixture));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        const mapped = adapter.mapEvent(parsed.value);
        if (mapped) {
          const result = pipeline.process(mapped);
          if (!result.dropped) {
            normalized++;
          }
        }
      }
    }

    expect(normalized).toBe(6);
    const stats = pipeline.getStats();
    expect(stats.processed).toBe(6);
    expect(stats.normalized).toBe(6);
  });

  it('malformed fixture is dropped gracefully', () => {
    const pipeline = makePipeline();
    const malformed = { type: 'chat', user: { id: '', nickname: '' } };
    const parsed = parseTikfinityPayload(JSON.stringify(malformed));
    expect(parsed.ok).toBe(false);

    // Even if we bypass parsing and feed raw to pipeline, normalizer rejects it
    const result = pipeline.process(malformed);
    expect(result.dropped).toBe(true);
    expect(result.reason).toContain('normalization failed');
  });

  it('repeated fixture processing produces unique event IDs', () => {
    const fixture = loadFixture('chat');
    const parsed = parseTikfinityPayload(JSON.stringify(fixture));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const m1 = adapter.mapEvent(parsed.value);
      const m2 = adapter.mapEvent(parsed.value);
      expect(m1!.id).not.toBe(m2!.id);
    }
  });

  it('pipeline dedup rejects duplicate event ids', () => {
    const pipeline = makePipeline();
    const event: NormalizedLiveEvent = {
      schemaVersion: 1,
      id: 'evt_tf_dedup_test',
      provider: 'tikfinity',
      type: 'chat',
      receivedAt: new Date().toISOString(),
      user: { id: 'user_001', handle: 'viewer_alpha', displayName: 'viewer_alpha' },
      comment: 'hello',
      rawHash: 'sha256:test_dedup',
    };

    const r1 = pipeline.process(event);
    expect(r1.dropped).toBe(false);

    const r2 = pipeline.process(event);
    expect(r2.dropped).toBe(true);
    expect(r2.reason).toContain('duplicate');
  });
});
