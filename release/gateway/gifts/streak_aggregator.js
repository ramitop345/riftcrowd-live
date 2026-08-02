/**
 * Phase 11 — StreakAggregator.
 *
 * Tracks per-viewer gift streaks within a sliding window.
 * A streak: ≥ minCount gifts of the same tier from the same viewer within windowMs.
 * Applies multiplier when a streak is detected.
 * No double counting: once a streak fires, subsequent gifts in the same window
 * don't trigger a new streak until the window elapses.
 */
class SystemClock {
    now() {
        return Date.now();
    }
}
// ---------------------------------------------------------------------------
// StreakAggregator class
// ---------------------------------------------------------------------------
export class StreakAggregator {
    windowMs;
    minCount;
    multiplier;
    clock;
    /** Map key: `${viewerId}:${tierId}` */
    entries = new Map();
    constructor(config, clock) {
        this.windowMs = config.windowMs;
        this.minCount = config.minCount;
        this.multiplier = config.multiplier;
        this.clock = clock ?? new SystemClock();
    }
    /**
     * Records a gift and checks if a streak is active.
     * @param viewerId — the viewer who sent the gift
     * @param tierId — the resolved tier of the gift
     * @param baseMagnitude — the base impact magnitude before streak multiplier
     * @returns StreakResult with adjusted magnitude
     */
    record(viewerId, tierId, baseMagnitude) {
        if (!viewerId || !tierId) {
            return { isStreak: false, adjustedMagnitude: baseMagnitude, streakCount: 0 };
        }
        const key = `${viewerId}:${tierId}`;
        const now = this.clock.now();
        let entry = this.entries.get(key);
        if (!entry) {
            entry = { timestamps: [], lastStreakFiredAt: -1 };
            this.entries.set(key, entry);
        }
        // Add current timestamp
        entry.timestamps.push(now);
        // Prune timestamps outside the window
        const windowStart = now - this.windowMs;
        entry.timestamps = entry.timestamps.filter((t) => t >= windowStart);
        const count = entry.timestamps.length;
        // Check streak: count >= minCount AND last streak fired is outside the window
        // lastStreakFiredAt === -1 means never fired (always eligible)
        const isStreak = count >= this.minCount &&
            (entry.lastStreakFiredAt === -1 || entry.lastStreakFiredAt < windowStart);
        if (isStreak) {
            entry.lastStreakFiredAt = now;
            return {
                isStreak: true,
                adjustedMagnitude: Math.round(baseMagnitude * this.multiplier),
                streakCount: count,
            };
        }
        return {
            isStreak: false,
            adjustedMagnitude: baseMagnitude,
            streakCount: count,
        };
    }
    /** Returns the current streak multiplier. */
    getMultiplier() {
        return this.multiplier;
    }
    /** Returns the total number of distinct streaks detected (for stats). */
    getTrackedCount() {
        let total = 0;
        for (const entry of this.entries.values()) {
            if (entry.lastStreakFiredAt >= 0)
                total++;
        }
        return total;
    }
    /** Resets all tracking state. */
    reset() {
        this.entries.clear();
    }
}
