/**
 * Phase 12 — Comment Spam Filter.
 *
 * Per-viewer sliding window: if > maxCommentsPerWindowMs comments within windowMs,
 * reject further comments. Applied BEFORE rules engine.
 */

import type { SpamConfig } from './free_engagement_config.js';

// ---------------------------------------------------------------------------
// SpamFilter class
// ---------------------------------------------------------------------------

export class SpamFilter {
  private readonly config: SpamConfig;
  private readonly timestamps = new Map<string, number[]>();

  constructor(config: SpamConfig) {
    this.config = config;
  }

  /**
   * Returns true if the comment is allowed (not spam).
   * Records the timestamp for the viewer.
   */
  allow(viewerId: string, nowMs: number): boolean {
    let ts = this.timestamps.get(viewerId);
    if (!ts) {
      ts = [];
      this.timestamps.set(viewerId, ts);
    }

    // Remove expired timestamps (outside the window)
    const cutoff = nowMs - this.config.windowMs;
    while (ts.length > 0 && ts[0]! <= cutoff) {
      ts.shift();
    }

    // Check if over limit
    if (ts.length >= this.config.maxCommentsPerWindowMs) {
      return false;
    }

    // Record this comment
    ts.push(nowMs);
    return true;
  }

  /** Resets all tracking state. */
  reset(): void {
    this.timestamps.clear();
  }

  /** Returns the current config. */
  getConfig(): SpamConfig {
    return { ...this.config };
  }
}
