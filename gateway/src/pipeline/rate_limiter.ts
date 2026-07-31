/**
 * RateLimiter — per-viewerId and global token bucket rate limiting.
 *
 * Per-viewer: configurable rate (events/sec) and burst.
 * Global: separate rate limit for overall gateway throughput.
 *
 * **Bucket eviction (FIX 5):**
 * The per-viewer bucket map is capped at `maxBuckets` (default 50,000).
 * When the cap is reached, the least-recently-used bucket (oldest Map entry)
 * is evicted in O(1) using Map insertion-order semantics. This prevents
 * unbounded memory growth in long-running production gateways with thousands
 * of unique viewers.
 */

// ---------------------------------------------------------------------------
// TokenBucket
// ---------------------------------------------------------------------------

interface Bucket {
  tokens: number;
  lastRefill: number;
}

/**
 * Token bucket limiter with LRU eviction.
 *
 * Uses Map insertion-order to track recency:
 * - On `allow()`, existing buckets are deleted and re-inserted (moves to end = most recent).
 * - On capacity overflow, the first key (oldest) is deleted in O(1).
 *
 * @param maxBuckets — maximum number of tracked keys before LRU eviction kicks in.
 */
class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private _rate: number; // tokens per second
  private _burst: number; // max tokens
  private readonly maxBuckets: number;

  constructor(rate: number, burst: number, maxBuckets: number = 50_000) {
    this._rate = rate;
    this._burst = burst;
    this.maxBuckets = maxBuckets;
  }

  /**
   * Returns true if the request is allowed, false if rate-limited.
   * Refills tokens based on elapsed time. Moves the bucket to the end
   * of the Map (most recently used) on each access.
   */
  allow(key: string, now: number = Date.now()): boolean {
    let bucket = this.buckets.get(key);

    if (bucket) {
      // Move to end (most recently used) via delete + re-insert
      this.buckets.delete(key);
    } else {
      // New bucket — evict LRU if at capacity
      if (this.buckets.size >= this.maxBuckets) {
        const oldest = this.buckets.keys().next().value;
        if (oldest !== undefined) this.buckets.delete(oldest);
      }
      bucket = { tokens: this._burst, lastRefill: now };
    }

    // Refill tokens
    const elapsed = (now - bucket.lastRefill) / 1000; // seconds
    bucket.tokens = Math.min(this._burst, bucket.tokens + elapsed * this._rate);
    bucket.lastRefill = now;

    this.buckets.set(key, bucket);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }

    return false;
  }

  /** Updates rate and burst for future requests. */
  updateConfig(rate: number, burst: number): void {
    this._rate = rate;
    this._burst = burst;
  }

  /** Returns the number of tracked buckets. */
  get size(): number {
    return this.buckets.size;
  }

  /** Clears all buckets. */
  clear(): void {
    this.buckets.clear();
  }

  /** Returns the maximum number of buckets before LRU eviction. */
  getMaxBuckets(): number {
    return this.maxBuckets;
  }
}

// ---------------------------------------------------------------------------
// RateLimiter (wraps per-viewer + global)
// ---------------------------------------------------------------------------

/**
 * Combined per-viewer + global rate limiter.
 *
 * Per-viewer buckets are capped at `maxViewerBuckets` (default 50,000).
 * When exceeded, the least-recently-used viewer bucket is evicted.
 * The global limiter uses a single key and is not subject to eviction.
 */
export class RateLimiter {
  private perViewer: TokenBucketLimiter;
  private global: TokenBucketLimiter;
  private _rateLimitPerViewer: number;
  private _rateLimitBurst: number;
  private _rateLimitGlobal: number;

  constructor(
    rateLimitPerViewer: number = 10,
    rateLimitBurst: number = 50,
    rateLimitGlobal: number = 1000,
    maxViewerBuckets: number = 50_000,
  ) {
    this._rateLimitPerViewer = rateLimitPerViewer;
    this._rateLimitBurst = rateLimitBurst;
    this._rateLimitGlobal = rateLimitGlobal;
    this.perViewer = new TokenBucketLimiter(rateLimitPerViewer, rateLimitBurst, maxViewerBuckets);
    this.global = new TokenBucketLimiter(rateLimitGlobal, rateLimitGlobal * 2);
  }

  /**
   * Checks if a request from the given viewerId is allowed.
   * Both per-viewer and global limits must pass.
   */
  allow(viewerId: string, now?: number): boolean {
    if (!this.global.allow('__global__', now)) {
      return false;
    }
    return this.perViewer.allow(viewerId, now);
  }

  /** Updates per-viewer rate and burst. */
  updatePerViewer(rate: number, burst: number): void {
    this._rateLimitPerViewer = rate;
    this._rateLimitBurst = burst;
    this.perViewer.updateConfig(rate, burst);
  }

  /** Updates global rate. */
  updateGlobal(rate: number): void {
    this._rateLimitGlobal = rate;
    this.global.updateConfig(rate, rate * 2);
  }

  /** Returns config for testing/inspection. */
  getConfig(): { rateLimitPerViewer: number; rateLimitBurst: number; rateLimitGlobal: number } {
    return {
      rateLimitPerViewer: this._rateLimitPerViewer,
      rateLimitBurst: this._rateLimitBurst,
      rateLimitGlobal: this._rateLimitGlobal,
    };
  }

  /** Returns the number of tracked per-viewer buckets. */
  getPerViewerSize(): number {
    return this.perViewer.size;
  }

  /** Clears all rate limit state. */
  clear(): void {
    this.perViewer.clear();
    this.global.clear();
  }
}
