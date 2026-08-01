/**
 * DedupeStore — sliding-window deduplication keyed on (providerEventId, eventType).
 *
 * O(1) LRU eviction using Map insertion-order semantics:
 * - On `seen()`, existing keys are deleted and re-inserted (moves to end = most recent).
 * - On capacity overflow, the first key (oldest) is deleted in O(1).
 *
 * `seen(id, type)` returns true if the event was already processed,
 * false (and records it) if new.
 */

// ---------------------------------------------------------------------------
// DedupeStore class
// ---------------------------------------------------------------------------

export class DedupeStore {
  private readonly store = new Map<string, true>(); // key → true (insertion-order = LRU)
  private capacity: number;

  constructor(capacity: number = 10_000) {
    this.capacity = capacity;
  }

  /**
   * Checks if an event (id + type) has already been processed.
   * Returns true if seen before, false if new (and records it).
   *
   * Uses Map insertion-order for O(1) LRU:
   * - Hit: delete + re-set moves entry to end (most recent).
   * - Miss at capacity: delete first key (oldest) before inserting.
   */
  seen(id: string, type: string): boolean {
    const key = `${id}::${type}`;

    if (this.store.has(key)) {
      // Move to end (most recently used)
      this.store.delete(key);
      this.store.set(key, true);
      return true;
    }

    // New event — evict LRU (oldest = first key) if at capacity
    if (this.store.size >= this.capacity) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }

    this.store.set(key, true);
    return false;
  }

  /** Returns the current number of tracked events. */
  get size(): number {
    return this.store.size;
  }

  /** Clears all tracked events. */
  clear(): void {
    this.store.clear();
  }

  /** Updates the capacity. Does not evict immediately. */
  setCapacity(capacity: number): void {
    this.capacity = capacity;
  }
}
