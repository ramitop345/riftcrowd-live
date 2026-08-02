/**
 * Phase 12 — Follow Guardian Spawner.
 *
 * When a viewer follows (event.type === 'follow'), spawns a Guardian champion.
 * Per-viewer cooldown + per-faction bound (maxActiveGuardiansPerFaction).
 */
import { COMMAND_SCHEMA_VERSION, } from '@riftcrowd/shared';
import { randomUUID } from 'node:crypto';
// ---------------------------------------------------------------------------
// FollowGuardian class
// ---------------------------------------------------------------------------
export class FollowGuardian {
    config;
    cooldowns = new Map();
    activePerFaction = new Map();
    logFn;
    getFaction;
    bounds;
    constructor(config, bounds, logFn, getFaction) {
        this.config = config;
        this.bounds = bounds;
        this.logFn = logFn ?? (() => { });
        this.getFaction = getFaction ?? (() => null);
    }
    /**
     * Processes a follow event. Returns a decision if guardian can be spawned.
     */
    processFollow(event, nowMs) {
        const viewerId = event.user.id;
        const factionId = this.getFaction(viewerId) ?? this.fallbackFaction(viewerId);
        if (!this.config.enabled) {
            return {
                eventId: event.id,
                viewerId,
                factionId,
                championType: this.config.championType,
                cooldownBlocked: false,
                boundBlocked: false,
                command: null,
                log: `Follow guardian disabled`,
            };
        }
        // Check per-viewer cooldown
        const lastFired = this.cooldowns.get(viewerId);
        if (lastFired !== undefined && nowMs - lastFired < this.config.cooldownMs) {
            const log = `Follow from ${viewerId} → cooldown active, skipping`;
            this.logFn(`[FollowGuardian] ${log}`);
            return {
                eventId: event.id,
                viewerId,
                factionId,
                championType: this.config.championType,
                cooldownBlocked: true,
                boundBlocked: false,
                command: null,
                log,
            };
        }
        // Check per-faction bound
        const active = this.activePerFaction.get(factionId) ?? 0;
        if (active >= this.bounds) {
            const log = `Follow from ${viewerId} → faction ${factionId} at max guardians (${this.bounds}), skipping`;
            this.logFn(`[FollowGuardian] ${log}`);
            return {
                eventId: event.id,
                viewerId,
                factionId,
                championType: this.config.championType,
                cooldownBlocked: false,
                boundBlocked: true,
                command: null,
                log,
            };
        }
        // Spawn guardian
        this.cooldowns.set(viewerId, nowMs);
        this.activePerFaction.set(factionId, active + 1);
        const command = {
            schemaVersion: COMMAND_SCHEMA_VERSION,
            id: `cmd_${randomUUID()}`,
            type: 'FOLLOW_GUARDIAN',
            createdAt: new Date().toISOString(),
            factionId,
            viewerId,
            displayName: event.user.displayName,
            sourceEventIds: [event.id],
            expiresAt: new Date(nowMs + this.config.durationMs).toISOString(),
            metadata: {
                championType: this.config.championType,
                duration: this.config.durationMs,
            },
        };
        const log = `Follow from ${viewerId} → spawn guardian for ${factionId} (${this.config.durationMs}ms)`;
        this.logFn(`[FollowGuardian] ${log}`);
        return {
            eventId: event.id,
            viewerId,
            factionId,
            championType: this.config.championType,
            cooldownBlocked: false,
            boundBlocked: false,
            command,
            log,
        };
    }
    /** Releases a guardian from the active count (called when duration expires). */
    releaseGuardian(factionId) {
        const active = this.activePerFaction.get(factionId) ?? 0;
        if (active > 0) {
            this.activePerFaction.set(factionId, active - 1);
        }
    }
    /** Returns active guardian count for a faction. */
    getActiveCount(factionId) {
        return this.activePerFaction.get(factionId) ?? 0;
    }
    /** Resets all state for a new round. */
    reset() {
        this.cooldowns.clear();
        this.activePerFaction.clear();
    }
    /** Hash-based fallback faction assignment. */
    fallbackFaction(viewerId) {
        const hash = viewerId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        return hash % 2 === 0 ? 'faction_alpha' : 'faction_beta';
    }
}
