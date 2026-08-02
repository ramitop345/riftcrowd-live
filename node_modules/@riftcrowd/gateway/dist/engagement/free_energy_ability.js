/**
 * Phase 12 — Free Energy Ability.
 *
 * A viewer can trigger a free-energy ability via !ability chat keyword.
 * Per-viewer cooldown + max per round. Emits ADD_ENERGY command.
 */
import { COMMAND_SCHEMA_VERSION, } from '@riftcrowd/shared';
import { randomUUID } from 'node:crypto';
// ---------------------------------------------------------------------------
// FreeEnergyAbility class
// ---------------------------------------------------------------------------
export class FreeEnergyAbility {
    config;
    cooldowns = new Map();
    usageCount = new Map();
    logFn;
    getFaction;
    constructor(config, logFn, getFaction) {
        this.config = config;
        this.logFn = logFn ?? (() => { });
        this.getFaction = getFaction ?? (() => null);
    }
    /**
     * Processes an ability trigger from a chat event.
     * Returns a decision if energy can be added.
     */
    processAbility(event, nowMs) {
        const viewerId = event.user.id;
        const factionId = this.getFaction(viewerId) ?? this.fallbackFaction(viewerId);
        // Check per-viewer cooldown
        const lastFired = this.cooldowns.get(viewerId);
        if (lastFired !== undefined && nowMs - lastFired < this.config.cooldownMs) {
            const log = `Ability from ${viewerId} → cooldown active, skipping`;
            this.logFn(`[FreeEnergyAbility] ${log}`);
            return {
                eventId: event.id,
                viewerId,
                factionId,
                cooldownBlocked: true,
                maxReached: false,
                magnitude: 0,
                command: null,
                log,
            };
        }
        // Check max per round
        const count = this.usageCount.get(viewerId) ?? 0;
        if (count >= this.config.maxPerViewerPerRound) {
            const log = `Ability from ${viewerId} → max per round (${this.config.maxPerViewerPerRound}) reached, skipping`;
            this.logFn(`[FreeEnergyAbility] ${log}`);
            return {
                eventId: event.id,
                viewerId,
                factionId,
                cooldownBlocked: false,
                maxReached: true,
                magnitude: 0,
                command: null,
                log,
            };
        }
        // Fire ability
        this.cooldowns.set(viewerId, nowMs);
        this.usageCount.set(viewerId, count + 1);
        const command = {
            schemaVersion: COMMAND_SCHEMA_VERSION,
            id: `cmd_${randomUUID()}`,
            type: 'FREE_ENERGY_ABILITY',
            createdAt: new Date().toISOString(),
            factionId,
            viewerId,
            displayName: event.user.displayName,
            amount: this.config.magnitude,
            sourceEventIds: [event.id],
            metadata: {
                source: 'free_energy_ability',
            },
        };
        const log = `Ability from ${viewerId} → ADD_ENERGY +${this.config.magnitude} for ${factionId}`;
        this.logFn(`[FreeEnergyAbility] ${log}`);
        return {
            eventId: event.id,
            viewerId,
            factionId,
            cooldownBlocked: false,
            maxReached: false,
            magnitude: this.config.magnitude,
            command,
            log,
        };
    }
    /** Returns usage count for a viewer. */
    getUsageCount(viewerId) {
        return this.usageCount.get(viewerId) ?? 0;
    }
    /** Resets all state for a new round. */
    reset() {
        this.cooldowns.clear();
        this.usageCount.clear();
    }
    /** Hash-based fallback faction assignment. */
    fallbackFaction(viewerId) {
        const hash = viewerId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        return hash % 2 === 0 ? 'faction_alpha' : 'faction_beta';
    }
}
