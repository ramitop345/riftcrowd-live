import { describe, expect, it } from 'vitest';
import {
  computeRawHash,
  deterministicCommandId,
  deterministicEventId,
  stableStringify,
} from '@riftcrowd/shared/identity';

describe('stableStringify', () => {
  it('is invariant to object key insertion order', () => {
    const a = { user: { id: 'u1', handle: 'h1' }, type: 'chat', comment: 'lions' };
    const b = { comment: 'lions', type: 'chat', user: { handle: 'h1', id: 'u1' } };

    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it('preserves array order', () => {
    expect(stableStringify([1, 2, 3])).not.toBe(stableStringify([3, 2, 1]));
    expect(stableStringify(['a', 'b'])).toBe('["a","b"]');
  });

  it('sorts keys recursively, including inside arrays', () => {
    const value = { list: [{ b: 2, a: 1 }] };
    expect(stableStringify(value)).toBe('{"list":[{"a":1,"b":2}]}');
  });

  it('always returns a string, even for unserializable input', () => {
    expect(stableStringify(undefined)).toBe('null');
  });
});

describe('computeRawHash', () => {
  it('returns a sha256:-prefixed 64-hex digest', () => {
    expect(computeRawHash({ any: 'payload' })).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('produces the same hash for objects with different key insertion order', () => {
    const a = { giftId: 'rose', count: 3, user: { id: 'u1', handle: 'h1' } };
    const b = { user: { handle: 'h1', id: 'u1' }, count: 3, giftId: 'rose' };

    expect(computeRawHash(a)).toBe(computeRawHash(b));
  });

  it('produces different hashes for different payloads', () => {
    expect(computeRawHash({ count: 3 })).not.toBe(computeRawHash({ count: 4 }));
  });
});

describe('deterministicEventId', () => {
  const rawHash = computeRawHash({ sample: true });

  it('matches the documented shape', () => {
    expect(deterministicEventId('mock', 'chat', rawHash)).toMatch(/^evt_[0-9a-f]{24}$/);
  });

  it('is stable: same inputs yield the same id', () => {
    expect(deterministicEventId('mock', 'chat', rawHash)).toBe(
      deterministicEventId('mock', 'chat', rawHash),
    );
  });

  it('changes when any input changes', () => {
    const base = deterministicEventId('mock', 'chat', rawHash);
    expect(deterministicEventId('tikfinity', 'chat', rawHash)).not.toBe(base);
    expect(deterministicEventId('mock', 'like', rawHash)).not.toBe(base);
    expect(deterministicEventId('mock', 'chat', computeRawHash({ sample: false }))).not.toBe(base);
  });

  it('does not collide when a delimiter character shifts between inputs', () => {
    expect(deterministicEventId('a|b', 'c', 'h')).not.toBe(deterministicEventId('a', 'b|c', 'h'));
  });
});

describe('deterministicCommandId', () => {
  it('matches the documented shape', () => {
    expect(deterministicCommandId('ADD_ENERGY', ['evt-1'])).toMatch(/^cmd_[0-9a-f]{24}$/);
  });

  it('is stable: same inputs yield the same id', () => {
    expect(deterministicCommandId('ADD_ENERGY', ['evt-1', 'evt-2'])).toBe(
      deterministicCommandId('ADD_ENERGY', ['evt-1', 'evt-2']),
    );
  });

  it('changes when the type or the source event ids change', () => {
    const base = deterministicCommandId('ADD_ENERGY', ['evt-1', 'evt-2']);
    expect(deterministicCommandId('ADD_SHIELD', ['evt-1', 'evt-2'])).not.toBe(base);
    expect(deterministicCommandId('ADD_ENERGY', ['evt-1'])).not.toBe(base);
    expect(deterministicCommandId('ADD_ENERGY', ['evt-2', 'evt-1'])).not.toBe(base);
  });

  it('does not collide when ids contain the old join delimiter', () => {
    expect(deterministicCommandId('ADD_ENERGY', ['evt-1,evt-2'])).not.toBe(
      deterministicCommandId('ADD_ENERGY', ['evt-1', 'evt-2']),
    );
  });
});
