/**
 * Phase 10 — RetryBuffer tests.
 *
 * Capacity enforcement, acked-eviction-first, getRange, drain, monotonic sequence.
 */

import { describe, it, expect } from 'vitest';
import { RetryBuffer } from '../src/ws/retry_buffer.js';
import type { GameCommand } from '@riftcrowd/shared';

function makeCmd(id: string): GameCommand {
  return {
    schemaVersion: 1,
    id,
    type: 'SPAWN_CHAMPION',
    createdAt: new Date().toISOString(),
    sourceEventIds: ['evt_001'],
  };
}

describe('RetryBuffer', () => {
  it('starts empty with correct defaults', () => {
    const buf = new RetryBuffer(10);
    expect(buf.size).toBe(0);
    expect(buf.capacity).toBe(10);
    expect(buf.currentSequenceNumber).toBe(0);
    expect(buf.peek()).toBeNull();
  });

  it('adds commands with monotonic sequence numbers', () => {
    const buf = new RetryBuffer(10);
    const s0 = buf.add(makeCmd('a'), 100);
    const s1 = buf.add(makeCmd('b'), 200);
    const s2 = buf.add(makeCmd('c'), 300);
    expect(s0).toBe(0);
    expect(s1).toBe(1);
    expect(s2).toBe(2);
    expect(buf.size).toBe(3);
    expect(buf.currentSequenceNumber).toBe(3);
  });

  it('enforces capacity: evicts oldest unacked when full', () => {
    const buf = new RetryBuffer(3);
    buf.add(makeCmd('a'), 100); // seq 0
    buf.add(makeCmd('b'), 200); // seq 1
    buf.add(makeCmd('c'), 300); // seq 2
    // Buffer at capacity (3). Adding another should evict oldest.
    buf.add(makeCmd('d'), 400); // seq 3, evicts seq 0
    expect(buf.size).toBe(3);
    expect(buf.getRange(0, 4)).toHaveLength(3);
    // seq 0 was evicted
    expect(buf.getRange(0, 1)).toHaveLength(0);
    // seqs 1,2,3 remain
    expect(buf.getRange(1, 4)).toHaveLength(3);
  });

  it('evicts oldest acked entry first when full', () => {
    const buf = new RetryBuffer(3);
    buf.add(makeCmd('a'), 100); // seq 0
    buf.add(makeCmd('b'), 200); // seq 1
    buf.add(makeCmd('c'), 300); // seq 2
    // Ack seq 1 and seq 2
    buf.markAcked(1, 250);
    buf.markAcked(2, 350);
    // Add seq 3: should evict oldest acked (seq 1), not unacked seq 0
    buf.add(makeCmd('d'), 400); // seq 3
    expect(buf.size).toBe(3);
    expect(buf.getRange(0, 1)).toHaveLength(1); // seq 0 still present (unacked)
    expect(buf.getRange(1, 2)).toHaveLength(0); // seq 1 evicted (oldest acked)
    expect(buf.getRange(2, 4)).toHaveLength(2); // seqs 2,3 present
  });

  it('getRange returns commands in order', () => {
    const buf = new RetryBuffer(10);
    buf.add(makeCmd('a'), 100);
    buf.add(makeCmd('b'), 200);
    buf.add(makeCmd('c'), 300);
    const range = buf.getRange(0, 3);
    expect(range).toHaveLength(3);
    expect(range[0]!.id).toBe('a');
    expect(range[1]!.id).toBe('b');
    expect(range[2]!.id).toBe('c');
  });

  it('getRange handles gaps from eviction', () => {
    const buf = new RetryBuffer(3);
    buf.add(makeCmd('a'), 100); // seq 0
    buf.add(makeCmd('b'), 200); // seq 1
    buf.add(makeCmd('c'), 300); // seq 2
    buf.add(makeCmd('d'), 400); // seq 3, evicts seq 0
    const range = buf.getRange(0, 4);
    expect(range).toHaveLength(3); // seq 0 missing
    expect(range[0]!.id).toBe('b');
  });

  it('markAcked returns true for existing, false for missing', () => {
    const buf = new RetryBuffer(10);
    buf.add(makeCmd('a'), 100);
    expect(buf.markAcked(0, 150)).toBe(true);
    expect(buf.markAcked(99, 200)).toBe(false);
  });

  it('peek returns oldest entry', () => {
    const buf = new RetryBuffer(10);
    buf.add(makeCmd('a'), 100);
    buf.add(makeCmd('b'), 200);
    const peek = buf.peek();
    expect(peek).not.toBeNull();
    expect(peek!.sequenceNumber).toBe(0);
    expect(peek!.command.id).toBe('a');
    expect(buf.size).toBe(2); // not removed
  });

  it('drain returns all entries and clears', () => {
    const buf = new RetryBuffer(10);
    buf.add(makeCmd('a'), 100);
    buf.add(makeCmd('b'), 200);
    buf.add(makeCmd('c'), 300);
    const entries = buf.drain();
    expect(entries).toHaveLength(3);
    expect(buf.size).toBe(0);
    expect(buf.peek()).toBeNull();
  });

  it('clear returns count and empties buffer', () => {
    const buf = new RetryBuffer(10);
    buf.add(makeCmd('a'), 100);
    buf.add(makeCmd('b'), 200);
    const dropped = buf.clear();
    expect(dropped).toBe(2);
    expect(buf.size).toBe(0);
  });

  it('toArray returns entries sorted by sequence number', () => {
    const buf = new RetryBuffer(10);
    buf.add(makeCmd('c'), 300);
    buf.add(makeCmd('a'), 100);
    buf.add(makeCmd('b'), 200);
    const arr = buf.toArray();
    expect(arr).toHaveLength(3);
    expect(arr[0]!.sequenceNumber).toBe(0);
    expect(arr[1]!.sequenceNumber).toBe(1);
    expect(arr[2]!.sequenceNumber).toBe(2);
  });
});
