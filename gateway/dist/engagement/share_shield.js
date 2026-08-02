/**
 * Phase 12 — Share Shield Activator.
 *
 * When a viewer shares (event.type === 'share'), applies a shield to the faction.
 * Per-viewer cooldown + per-faction bound.
 */
import { COMMAND_SCHEMA_VERSION, } from '@riftcrowd/shared';
import { randomUUID } from 'node:crypto';
// ---------------------------------------------------------------------------
// ShareShield class
// ---------------------------------------------------------------------------
export class ShareShield {
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
     * Processes a share event. Returns a decision if shield can be applied.
     */
    processShare(event, nowMs) {
        const viewerId = event.user.id;
        const factionId = this.getFaction(viewerId) ?? this.fallbackFaction(viewerId);
        if (!this.config.enabled) {
            return {
                eventId: event.id,
                viewerId,
                factionId,
                cooldownBlocked: false,
                boundBlocked: false,
                magnitude: 0,
                command: null,
                log: `Share shield disabled`,
            };
        }
        // Check per-viewer cooldown
        const lastFired = this.cooldowns.get(viewerId);
        if (lastFired !== undefined && nowMs - lastFired < this.config.cooldownMs) {
            const log = `Share from ${viewerId} → cooldown active, skipping`;
            this.logFn(`[ShareShield] ${log}`);
            return {
                eventId: event.id,
                viewerId,
                factionId,
                cooldownBlocked: true,
                boundBlocked: false,
                magnitude: 0,
                command: null,
                log,
            };
        }
        // Check per-faction bound
        const active = this.activePerFaction.get(factionId) ?? 0;
        if (active >= this.bounds) {
            const log = `Share from ${viewerId} → faction ${factionId} at max shields (${this.bounds}), skipping`;
            this.logFn(`[ShareShield] ${log}`);
            return {
                eventId: event.id,
                viewerId,
                factionId,
                cooldownBlocked: false,
                boundBlocked: true,
                magnitude: 0,
                command: null,
                log,
            };
        }
        // Apply shield
        this.cooldowns.set(viewerId, nowMs);
        this.activePerFaction.set(factionId, active + 1);
        const command = {
            schemaVersion: COMMAND_SCHEMA_VERSION,
            id: `cmd_${randomUUID()}`,
            type: 'SHARE_SHIELD',
            createdAt: new Date().toISOString(),
            factionId,
            viewerId,
            displayName: event.user.displayName,
            amount: this.config.magnitude,
            sourceEventIds: [event.id],
            expiresAt: new Date(nowMs + this.config.durationMs).toISOString(),
            metadata: {
                duration: this.config.durationMs,
            },
        };
        const log = `Share from ${viewerId} → shield +${this.config.magnitude} for ${factionId} (${this.config.durationMs}ms)`;
        this.logFn(`[ShareShield] ${log}`);
        return {
            eventId: event.id,
            viewerId,
            factionId,
            cooldownBlocked: false,
            boundBlocked: false,
            magnitude: this.config.magnitude,
            command,
            log,
        };
    }
    /** Releases a shield from the active count (called when duration expires). */
    releaseShield(factionId) {
        const active = this.activePerFaction.get(factionId) ?? 0;
        if (active > 0) {
            this.activePerFaction.set(factionId, active - 1);
        }
    }
    /** Returns active shield count for a faction. */
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
