/**
 * RetryBuffer — bounded buffer of sequenced commands for reconnect recovery.
 *
 * When a client disconnects and reconnects with a `lastReceivedSequenceNumber`,
 * the server uses this buffer to build a snapshot of missed commands.
 *
 * Eviction policy:
 *   1. When full, evict the oldest ACKED entry first.
 *   2. If no acked entries exist, evict the oldest entry (ring-buffer semantics).
 */

import type { GameCommand } from '@riftcrowd/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetryBufferEntry {
  sequenceNumber: number;
  command: GameCommand;
  sentAt: number;
  ackedAt?: number;
}

// ---------------------------------------------------------------------------
// RetryBuffer class
// ---------------------------------------------------------------------------

export class RetryBuffer {
  private readonly entries: Map<number, RetryBufferEntry> = new Map();
  private readonly _capacity: number;
  private _nextSequenceNumber: number = 0;

  constructor(capacity: number = 1000) {
    this._capacity = capacity;
  }

  /** Current capacity. */
  get capacity(): number {
    return this._capacity;
  }

  /** Number of entries currently in the buffer. */
  get size(): number {
    return this.entries.size;
  }

  /** The next sequence number that will be assigned (also the count of commands added). */
  get nextSequenceNumber(): number {
    return this._nextSequenceNumber;
  }

  /** @deprecated Use `nextSequenceNumber` instead. Kept for backward compat. */
  get currentSequenceNumber(): number {
    return this._nextSequenceNumber;
  }

  /**
   * Adds a command to the buffer, assigns the next sequence number, and returns it.
   * If the buffer is full, evicts the oldest acked entry first, then oldest unacked.
   */
  add(command: GameCommand, now: number = Date.now()): number {
    const seq = this._nextSequenceNumber++;

    // Evict if at capacity
    if (this.entries.size >= this._capacity) {
      this.evict();
    }

    this.entries.set(seq, {
      sequenceNumber: seq,
      command,
      sentAt: now,
    });

    return seq;
  }

  /**
   * Marks a command as acknowledged by its sequence number.
   * Returns true if found and marked, false if not present.
   */
  markAcked(sequenceNumber: number, now: number = Date.now()): boolean {
    const entry = this.entries.get(sequenceNumber);
    if (!entry) return false;
    entry.ackedAt = now;
    return true;
  }

  /**
   * Returns commands in the range [fromSeq, toSeq) for snapshot building.
   * Commands are returned in sequence order.
   */
  getRange(fromSeq: number, toSeq: number): GameCommand[] {
    const result: GameCommand[] = [];
    for (let seq = fromSeq; seq < toSeq; seq++) {
      const entry = this.entries.get(seq);
      if (entry) {
        result.push(entry.command);
      }
    }
    return result;
  }

  /**
   * Returns the oldest entry without removing it. Returns null if empty.
   */
  peek(): RetryBufferEntry | null {
    if (this.entries.size === 0) return null;
    // Map preserves insertion order, so first key is oldest
    const firstKey = this.entries.keys().next().value;
    if (firstKey === undefined) return null;
    return this.entries.get(firstKey) ?? null;
  }

  /**
   * Drains and returns all entries in sequence order.
   */
  drain(): RetryBufferEntry[] {
    const items = [...this.entries.values()].sort(
      (a, b) => a.sequenceNumber - b.sequenceNumber,
    );
    this.entries.clear();
    return items;
  }

  /**
   * Clears the buffer. Returns the number of entries dropped.
   */
  clear(): number {
    const count = this.entries.size;
    this.entries.clear();
    return count;
  }

  /**
   * Returns all entries as an array (for inspection/testing).
   */
  toArray(): RetryBufferEntry[] {
    return [...this.entries.values()].sort(
      (a, b) => a.sequenceNumber - b.sequenceNumber,
    );
  }

  /**
   * Evicts one entry: oldest acked first, then oldest unacked.
   * Returns the evicted entry or null if buffer is empty.
   */
  private evict(): RetryBufferEntry | null {
    if (this.entries.size === 0) return null;

    // First pass: find oldest acked entry
    let oldestAckedKey: number | null = null;
    for (const [key, entry] of this.entries) {
      if (entry.ackedAt !== undefined) {
        oldestAckedKey = key;
        break; // Map iterates in insertion order; first acked is oldest
      }
    }

    if (oldestAckedKey !== null) {
      const evicted = this.entries.get(oldestAckedKey)!;
      this.entries.delete(oldestAckedKey);
      return evicted;
    }

    // No acked entries: evict oldest (first in map)
    const firstKey = this.entries.keys().next().value;
    if (firstKey === undefined) return null;
    const evicted = this.entries.get(firstKey)!;
    this.entries.delete(firstKey);
    return evicted;
  }
}
