/**
 * Phase 17 — Malformed Payload Tests.
 *
 * Inject malformed events into the pipeline and verify:
 * - No crash
 * - Sanitization applied
 * - Malformed events logged (dropped)
 * - Valid events processed normally alongside malformed ones
 * Target: 10+ tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Pipeline } from '../../src/pipeline/pipeline.js';
import { normalizeProviderEvent } from '../../src/pipeline/normalizer.js';
import { sanitizeText as vfxSanitizeText } from '../../src/vfx/vfx_orchestrator.js';
import { resetPerfEventCounter, generateChatEvent } from './harness.js';

describe('Malformed Payload Tests — Sanitization and Rejection', () => {
  let pipeline: Pipeline;

  beforeEach(() => {
    resetPerfEventCounter();
    pipeline = new Pipeline({
      commandQueueCapacity: 500,
      rateLimitGlobal: 100000,
      rateLimitPerViewer: 100000,
    });
  });

  it('missing required fields: event dropped without crash', () => {
    const result = pipeline.process({
      schemaVersion: 1,
      provider: 'mock',
      type: 'chat',
      // Missing: id, receivedAt, user, rawHash
    });

    expect(result.dropped).toBe(true);
    expect(result.reason).toContain('normalization failed');
  });

  it('wrong type field: event rejected', () => {
    const result = pipeline.process({
      schemaVersion: 1,
      id: 'evt_bad_type',
      provider: 'mock',
      type: 'invalid_event_type',
      receivedAt: new Date().toISOString(),
      user: { id: 'v1', handle: '@v1', displayName: 'Viewer' },
      rawHash: 'sha256:' + 'a'.repeat(64),
    });

    expect(result.dropped).toBe(true);
  });

  it('oversized strings: sanitized and truncated', () => {
    const longComment = 'A'.repeat(5000);
    const normalized = normalizeProviderEvent({
      schemaVersion: 1,
      id: 'evt_long',
      provider: 'mock',
      type: 'chat',
      receivedAt: new Date().toISOString(),
      user: { id: 'v1', handle: '@v1', displayName: 'Viewer' },
      comment: longComment,
      rawHash: 'sha256:' + 'a'.repeat(64),
    });

    expect(normalized.ok).toBe(true);
    if (normalized.ok) {
      expect(normalized.value.comment!.length).toBeLessThanOrEqual(200);
    }
  });

  it('HTML injection: tags stripped', () => {
    const sanitized = vfxSanitizeText('<script>alert("xss")</script>Hello');
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).not.toContain('</script>');
    expect(sanitized).toContain('Hello');
  });

  it('Unicode bidi injection: control chars stripped', () => {
    const sanitized = vfxSanitizeText('\u202EHello\u202CWorld');
    expect(sanitized).not.toContain('\u202E');
    expect(sanitized).not.toContain('\u202C');
    expect(sanitized).toContain('Hello');
    expect(sanitized).toContain('World');
  });

  it('invalid JSON (null input): rejected without crash', () => {
    const result = pipeline.process(null);
    expect(result.dropped).toBe(true);
    expect(result.reason).toContain('normalization failed');
  });

  it('empty object: rejected (missing required fields)', () => {
    const result = pipeline.process({});
    expect(result.dropped).toBe(true);
  });

  it('array input: rejected', () => {
    const result = pipeline.process([1, 2, 3]);
    expect(result.dropped).toBe(true);
  });

  it('wrong schema version: rejected', () => {
    const result = pipeline.process({
      schemaVersion: 99,
      id: 'evt_wrong_ver',
      provider: 'mock',
      type: 'chat',
      receivedAt: new Date().toISOString(),
      user: { id: 'v1', handle: '@v1', displayName: 'Viewer' },
      comment: 'test',
      rawHash: 'sha256:' + 'a'.repeat(64),
    });

    expect(result.dropped).toBe(true);
  });

  it('mixed valid and malformed: valid events still processed', () => {
    // Malformed
    pipeline.process({ invalid: true });
    pipeline.process(null);

    // Valid
    const validEvent = generateChatEvent('viewer_ok');
    const result = pipeline.process(validEvent);

    expect(result.dropped).toBe(false);
    expect(pipeline.getStats().processed).toBe(3);
    expect(pipeline.getStats().dropped).toBe(2);
    expect(pipeline.getStats().normalized).toBe(1);
  });

  it('HTML in display name: passes through normalizer (VFX layer strips tags)', () => {
    const normalized = normalizeProviderEvent({
      schemaVersion: 1,
      id: 'evt_html_name',
      provider: 'mock',
      type: 'chat',
      receivedAt: new Date().toISOString(),
      user: {
        id: 'v1',
        handle: '@v1',
        displayName: '<img src=x onerror=alert(1)>Evil',
      },
      comment: 'hello',
      rawHash: 'sha256:' + 'a'.repeat(64),
    });

    expect(normalized.ok).toBe(true);
    // Normalizer strips control chars but not HTML (that's the VFX layer's job)
    if (normalized.ok) {
      expect(normalized.value.user.displayName.length).toBeLessThanOrEqual(64);
    }

    // VFX sanitizeText DOES strip HTML
    const stripped = vfxSanitizeText('<img src=x onerror=alert(1)>Evil', 64);
    expect(stripped).not.toContain('<img');
    expect(stripped).not.toContain('onerror');
  });

  it('zero-width characters stripped from comment', () => {
    const sanitized = vfxSanitizeText('Hello\u200B\u200C\u200DWorld');
    expect(sanitized).not.toContain('\u200B');
    expect(sanitized).not.toContain('\u200C');
    expect(sanitized).not.toContain('\u200D');
  });

  it('control characters stripped', () => {
    const sanitized = vfxSanitizeText('Hello\x00\x01\x02World');
    expect(sanitized).not.toContain('\x00');
    expect(sanitized).not.toContain('\x01');
    expect(sanitized).toContain('HelloWorld');
  });

  it('pipeline stats track malformed events', () => {
    for (let i = 0; i < 5; i++) {
      pipeline.process({ garbage: i });
    }

    const stats = pipeline.getStats();
    expect(stats.processed).toBe(5);
    expect(stats.dropped).toBe(5);
    expect(stats.normalized).toBe(0);
  });
});
