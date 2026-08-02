/**
 * Phase 12 — Top Free Contributor Tracker.
 *
 * Tracks per-viewer free-engagement contributions (likes, follows, shares, votes, abilities).
 * At round end (RESULTS stage), the top contributor gets a spotlight (DISPLAY_SPOTLIGHT).
 * Separate from gift economy's contribution tracking.
 */
import { COMMAND_SCHEMA_VERSION, } from '@riftcrowd/shared';
import { randomUUID } from 'node:crypto';
// ---------------------------------------------------------------------------
// Weights for different actions
// ---------------------------------------------------------------------------
const ACTION_WEIGHTS = {
    like: 1,
    follow: 5,
    share: 5,
    vote: 1,
    ability: 1,
};
// ---------------------------------------------------------------------------
// TopContributor class
// ---------------------------------------------------------------------------
export class TopContributor {
    config;
    contributions = new Map();
    getFaction;
    constructor(config, getFaction) {
        this.config = config;
        this.getFaction = getFaction ?? (() => null);
    }
    /** Records a free-engagement action for a viewer. */
    record(viewerId, action) {
        let contrib = this.contributions.get(viewerId);
        if (!contrib) {
            contrib = { likes: 0, follows: 0, shares: 0, votes: 0, abilities: 0, total: 0 };
            this.contributions.set(viewerId, contrib);
        }
        const weight = ACTION_WEIGHTS[action];
        contrib[action === 'like' ? 'likes' : action === 'follow' ? 'follows' : action === 'share' ? 'shares' : action === 'vote' ? 'votes' : 'abilities'] += 1;
        contrib.total += weight;
    }
    /**
     * Identifies the top contributor and produces a spotlight command.
     * Returns null if no contributions or disabled.
     */
    getTopContributorAtRoundEnd() {
        if (!this.config.enabled)
            return null;
        let topViewerId = null;
        let topTotal = 0;
        // Find top contributor (ties broken alphabetically by viewerId)
        for (const [viewerId, contrib] of this.contributions) {
            if (contrib.total > topTotal || (contrib.total === topTotal && (topViewerId === null || viewerId < topViewerId))) {
                topTotal = contrib.total;
                topViewerId = viewerId;
            }
        }
        if (!topViewerId)
            return null;
        const factionId = this.getFaction(topViewerId) ?? this.fallbackFaction(topViewerId);
        const command = {
            schemaVersion: COMMAND_SCHEMA_VERSION,
            id: `cmd_${randomUUID()}`,
            type: 'DISPLAY_SPOTLIGHT',
            createdAt: new Date().toISOString(),
            factionId,
            viewerId: topViewerId,
            amount: this.config.magnitude,
            sourceEventIds: [],
            metadata: {
                source: 'top_free_contributor',
                contributions: topTotal,
            },
        };
        const log = `Top free contributor: ${topViewerId} with ${topTotal} points → DISPLAY_SPOTLIGHT`;
        return {
            viewerId: topViewerId,
            factionId,
            contributions: topTotal,
            command,
            log,
        };
    }
    /** Returns all viewer contributions. */
    getAllContributions() {
        const result = {};
        for (const [k, v] of this.contributions) {
            result[k] = { ...v };
        }
        return result;
    }
    /** Returns contributions for a specific viewer. */
    getViewerContributions(viewerId) {
        return this.contributions.get(viewerId) ?? { likes: 0, follows: 0, shares: 0, votes: 0, abilities: 0, total: 0 };
    }
    /** Resets all state for a new round. */
    reset() {
        this.contributions.clear();
    }
    /** Hash-based fallback faction assignment. */
    fallbackFaction(viewerId) {
        const hash = viewerId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        return hash % 2 === 0 ? 'faction_alpha' : 'faction_beta';
    }
}
