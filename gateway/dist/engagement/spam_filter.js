/**
 * Phase 12 — Comment Spam Filter.
 *
 * Per-viewer sliding window: if > maxCommentsPerWindowMs comments within windowMs,
 * reject further comments. Applied BEFORE rules engine.
 */
// ---------------------------------------------------------------------------
// SpamFilter class
// ---------------------------------------------------------------------------
export class SpamFilter {
    config;
    timestamps = new Map();
    constructor(config) {
        this.config = config;
    }
    /**
     * Returns true if the comment is allowed (not spam).
     * Records the timestamp for the viewer.
     */
    allow(viewerId, nowMs) {
        let ts = this.timestamps.get(viewerId);
        if (!ts) {
            ts = [];
            this.timestamps.set(viewerId, ts);
        }
        // Remove expired timestamps (outside the window)
        const cutoff = nowMs - this.config.windowMs;
        while (ts.length > 0 && ts[0] <= cutoff) {
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
    reset() {
        this.timestamps.clear();
    }
    /** Returns the current config. */
    getConfig() {
        return { ...this.config };
    }
}
