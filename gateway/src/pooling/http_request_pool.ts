/**
 * Phase 17 — HTTPRequestPool.
 *
 * Bounded pool for in-flight HTTP requests. When full, new requests are
 * rejected with a 429 status indication. Tracks active and completed counts.
 *
 * Cap: 100 (configurable). Policy: reject with 429 when full.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PooledRequest {
  /** Pool-assigned request ID. */
  requestId: number;
  /** Request identifier (route or label). */
  label: string;
  /** Whether this request is currently in-flight. */
  active: boolean;
  /** Timestamp when the request was acquired. */
  startedAt: number;
}

export interface HTTPRequestPoolStats {
  /** Number of active (in-flight) requests. */
  active: number;
  /** Total requests rejected due to pool exhaustion. */
  rejected: number;
  /** Total requests completed (released). */
  completed: number;
  /** Total requests acquired. */
  totalAcquired: number;
  /** Current capacity. */
  capacity: number;
}

// ---------------------------------------------------------------------------
// HTTPRequestPool
// ---------------------------------------------------------------------------

export class HTTPRequestPool {
  private readonly requests: Map<number, PooledRequest> = new Map();
  private nextId = 0;
  private rejected = 0;
  private completed = 0;
  private totalAcquired = 0;
  private _capacity: number;

  constructor(capacity: number = 100) {
    this._capacity = capacity;
  }

  /**
   * Try to acquire a slot for an in-flight request.
   * Returns the pooled request or null if pool is full (429).
   */
  acquire(label: string): PooledRequest | null {
    // Count active requests
    let activeCount = 0;
    for (const req of this.requests.values()) {
      if (req.active) activeCount++;
    }

    if (activeCount >= this._capacity) {
      this.rejected++;
      return null;
    }

    const req: PooledRequest = {
      requestId: this.nextId++,
      label,
      active: true,
      startedAt: Date.now(),
    };
    this.requests.set(req.requestId, req);
    this.totalAcquired++;
    return req;
  }

  /**
   * Release (complete) a request. Returns true if the request was found and active.
   */
  release(requestId: number): boolean {
    const req = this.requests.get(requestId);
    if (req && req.active) {
      req.active = false;
      this.completed++;
      // Clean up completed requests to prevent unbounded growth
      this.requests.delete(requestId);
      return true;
    }
    return false;
  }

  /** Get pool statistics. */
  getStats(): HTTPRequestPoolStats {
    let active = 0;
    for (const req of this.requests.values()) {
      if (req.active) active++;
    }
    return {
      active,
      rejected: this.rejected,
      completed: this.completed,
      totalAcquired: this.totalAcquired,
      capacity: this._capacity,
    };
  }

  /** Number of active requests. */
  get activeCount(): number {
    let count = 0;
    for (const req of this.requests.values()) {
      if (req.active) count++;
    }
    return count;
  }

  /** Whether the pool is at capacity. */
  get full(): boolean {
    return this.activeCount >= this._capacity;
  }

  /** Current capacity. */
  get capacity(): number {
    return this._capacity;
  }

  /** Update capacity. */
  setCapacity(capacity: number): void {
    this._capacity = capacity;
  }

  /** Clear all requests. Returns count of active requests dropped. */
  clear(): number {
    let activeDropped = 0;
    for (const req of this.requests.values()) {
      if (req.active) activeDropped++;
    }
    this.requests.clear();
    return activeDropped;
  }

  /** Cancel all requests older than the given age (ms). Returns count cancelled.
   * FIX 9: Increments completed counter to maintain accounting invariant:
   * totalAcquired = active + completed + rejected.
   */
  cancelStale(maxAgeMs: number): number {
    const now = Date.now();
    let cancelled = 0;
    for (const [id, req] of this.requests) {
      if (req.active && now - req.startedAt > maxAgeMs) {
        req.active = false;
        this.requests.delete(id);
        cancelled++;
      }
    }
    // FIX 9: cancelled requests count as completed for accounting invariant
    this.completed += cancelled;
    return cancelled;
  }
}
