/**
 * ContributionTracker — tracks per-viewer contribution category counters
 * (combat, defense, engagement, gifts).
 *
 * Bounded: each counter is capped at a safe integer (default 1,000,000)
 * to prevent overflow in long sessions.
 */
const ALL_CATEGORIES = ['combat', 'defense', 'engagement', 'gifts'];
// ---------------------------------------------------------------------------
// ContributionTracker class
// ---------------------------------------------------------------------------
export class ContributionTracker {
    contributions = new Map();
    cap;
    constructor(cap = 1_000_000) {
        this.cap = cap;
    }
    // -------------------------------------------------------------------------
    // Record methods
    // -------------------------------------------------------------------------
    /** Records a combat contribution for the viewer. */
    recordCombat(viewerId, amount = 1) {
        this.record(viewerId, 'combat', amount);
    }
    /** Records a defense contribution for the viewer. */
    recordDefense(viewerId, amount = 1) {
        this.record(viewerId, 'defense', amount);
    }
    /** Records an engagement contribution for the viewer. */
    recordEngagement(viewerId, amount = 1) {
        this.record(viewerId, 'engagement', amount);
    }
    /** Records a gift contribution for the viewer. */
    recordGift(viewerId, amount = 1) {
        this.record(viewerId, 'gifts', amount);
    }
    // -------------------------------------------------------------------------
    // Query methods
    // -------------------------------------------------------------------------
    /**
     * Returns the viewerId with the highest total in the given category,
     * or null if no contributions exist.
     */
    getTopContributor(category) {
        let topId = null;
        let topValue = -1;
        for (const [viewerId, contrib] of this.contributions) {
            if (contrib[category] > topValue) {
                topValue = contrib[category];
                topId = viewerId;
            }
        }
        return topId;
    }
    /** Returns the contribution counters for a specific viewer. */
    getViewerContributions(viewerId) {
        return this.contributions.get(viewerId) ?? { combat: 0, defense: 0, engagement: 0, gifts: 0 };
    }
    /**
     * Zeroes all per-viewer contribution counters.
     * Does NOT touch viewer profile roundsParticipated — that is managed by the registry.
     */
    resetRound() {
        this.contributions.clear();
    }
    /** Number of viewers with recorded contributions. */
    get size() {
        return this.contributions.size;
    }
    // -------------------------------------------------------------------------
    // Private
    // -------------------------------------------------------------------------
    record(viewerId, category, amount) {
        let contrib = this.contributions.get(viewerId);
        if (!contrib) {
            contrib = { combat: 0, defense: 0, engagement: 0, gifts: 0 };
            this.contributions.set(viewerId, contrib);
        }
        contrib[category] = Math.min(this.cap, contrib[category] + Math.max(0, Math.floor(amount)));
    }
}
export { ALL_CATEGORIES };
