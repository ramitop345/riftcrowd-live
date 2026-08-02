/**
 * Phase 11 — GiftRule.
 *
 * Implements the pipeline's Rule interface. On gift event:
 *   mapper → streak aggregator → cooldown check → overflow converter → produce GameCommand(s).
 *
 * Logs every decision at info level (transparent logs).
 * Registers itself via registerRule() on startup.
 */
import { COMMAND_SCHEMA_VERSION, } from '@riftcrowd/shared';
import { randomUUID } from 'node:crypto';
// ---------------------------------------------------------------------------
// Map GiftImpactType to GameCommandType
// ---------------------------------------------------------------------------
function impactToCommandType(impactType) {
    switch (impactType) {
        case 'spawn_champion':
            return 'SPAWN_CHAMPION';
        case 'add_energy':
            return 'ADD_ENERGY';
        case 'add_shield':
            return 'ADD_SHIELD';
        case 'spawn_squad':
            return 'SPAWN_SQUAD';
        case 'cast_ability':
            return 'CAST_ABILITY';
        case 'start_world_event':
            return 'START_WORLD_EVENT';
        case 'display_spotlight':
            return 'DISPLAY_SPOTLIGHT';
    }
}
// ---------------------------------------------------------------------------
// GiftRule class
// ---------------------------------------------------------------------------
export class GiftRule {
    name = 'GiftRule';
    mapper;
    streakAggregator;
    cooldownManager;
    overflowConverter;
    decisions = [];
    /** Logger callback — injected for testability. */
    logFn;
    /** Faction resolver — injected from ViewerRegistry; falls back to hash. */
    getFaction;
    constructor(mapper, streakAggregator, cooldownManager, overflowConverter, logFn, getFaction) {
        this.mapper = mapper;
        this.streakAggregator = streakAggregator;
        this.cooldownManager = cooldownManager;
        this.overflowConverter = overflowConverter;
        this.logFn = logFn ?? (() => { });
        this.getFaction = getFaction ?? (() => null);
    }
    applies(event) {
        return event.type === 'gift' && event.gift !== undefined;
    }
    /** Hash-based fallback faction assignment when no registry lookup is available. */
    fallbackFaction(viewerId) {
        const viewerHash = viewerId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        return viewerHash % 2 === 0 ? 'faction_alpha' : 'faction_beta';
    }
    execute(event, _context) {
        const gift = event.gift;
        const viewerId = event.user.id;
        // Resolve faction: registry lookup first, hash fallback
        const factionId = this.getFaction(viewerId) ?? this.fallbackFaction(viewerId);
        const giftId = gift.id;
        const count = gift.repeatCount;
        // 1. Map gift to impact
        const impact = this.mapper.resolve(giftId, count);
        if (!impact) {
            const warnings = this.mapper.drainWarnings();
            const log = `${giftId} from ${viewerId} → unmapped (${warnings.join('; ') || 'unknown'})`;
            this.logFn(`[GiftRule] ${log}`);
            this.decisions.push({
                eventId: event.id,
                viewerId,
                factionId,
                giftId,
                streak: false,
                cooldownBlocked: false,
                overflowed: false,
                reserveAdded: 0,
                commandsProduced: 0,
                log,
            });
            return null;
        }
        // 2. Derive cinematic/ability impactId for cooldown tracking
        const impactId = impact.cinematic ? impact.tierId : undefined;
        // 3. Check cooldown (BEFORE streak recording — FIX 5)
        const canFire = this.cooldownManager.canFire(viewerId, factionId, impact.impactType, impactId);
        if (!canFire) {
            const reason = this.cooldownManager.getBlockReason(viewerId, factionId, impact.impactType, impactId);
            const log = `${giftId} from ${viewerId} → ${impact.tierId} → ${impact.impactType} magnitude=${impact.magnitude} → cooldown active (${reason}), skipping`;
            this.logFn(`[GiftRule] ${log}`);
            this.decisions.push({
                eventId: event.id,
                viewerId,
                factionId,
                giftId,
                tierId: impact.tierId,
                tierName: impact.tierName,
                impactType: impact.impactType,
                magnitude: impact.magnitude,
                streak: false,
                cooldownBlocked: true,
                cooldownReason: reason ?? undefined,
                overflowed: false,
                reserveAdded: 0,
                commandsProduced: 0,
                log,
            });
            return null;
        }
        // 4. Overflow check (BEFORE streak recording — FIX 5)
        const overflowResult = this.overflowConverter.applyOrOverflow(impact.impactType, factionId, impact.magnitude);
        if (!overflowResult.allowed) {
            const log = `${giftId} from ${viewerId} → ${impact.tierId} → ${impact.impactType} magnitude=${impact.magnitude} → overflow, +${overflowResult.reserveAdded} ${overflowResult.reserveType}`;
            this.logFn(`[GiftRule] ${log}`);
            this.decisions.push({
                eventId: event.id,
                viewerId,
                factionId,
                giftId,
                tierId: impact.tierId,
                tierName: impact.tierName,
                impactType: impact.impactType,
                magnitude: impact.magnitude,
                streak: false,
                cooldownBlocked: false,
                overflowed: true,
                reserveAdded: overflowResult.reserveAdded,
                commandsProduced: 0,
                log,
            });
            return null;
        }
        // 5. Record streak (only on happy path — FIX 5)
        const streakResult = this.streakAggregator.record(viewerId, impact.tierId, impact.magnitude);
        const finalMagnitude = streakResult.adjustedMagnitude;
        // 6. Mark cooldown
        this.cooldownManager.markFired(viewerId, factionId, impact.impactType, impactId);
        // 7. Produce command(s)
        const commands = [];
        const cmdType = impactToCommandType(impact.impactType);
        commands.push({
            schemaVersion: COMMAND_SCHEMA_VERSION,
            id: `cmd_${randomUUID()}`,
            type: cmdType,
            createdAt: new Date().toISOString(),
            factionId,
            viewerId,
            displayName: impact.displayName,
            amount: finalMagnitude,
            sourceEventIds: [event.id],
            metadata: {
                giftTier: impact.tierId,
                giftTierName: impact.tierName,
                streak: streakResult.isStreak,
                ...(impact.duration !== undefined ? { duration: impact.duration } : {}),
                ...(impact.cinematic !== undefined ? { cinematic: impact.cinematic } : {}),
            },
        });
        // Cinematic impacts also produce DISPLAY_SPOTLIGHT
        if (impact.cinematic) {
            commands.push({
                schemaVersion: COMMAND_SCHEMA_VERSION,
                id: `cmd_${randomUUID()}`,
                type: 'DISPLAY_SPOTLIGHT',
                createdAt: new Date().toISOString(),
                factionId,
                viewerId,
                displayName: impact.displayName,
                sourceEventIds: [event.id],
                metadata: {
                    giftTier: impact.tierId,
                    cinematic: true,
                },
            });
        }
        const streakLabel = streakResult.isStreak ? ` [STREAK ×${this.streakAggregator.getMultiplier()}]` : '';
        const log = `${giftId} from ${viewerId} → ${impact.tierId} → ${impact.impactType} magnitude=${finalMagnitude}${streakLabel} → ${commands.length} command(s)`;
        this.logFn(`[GiftRule] ${log}`);
        this.decisions.push({
            eventId: event.id,
            viewerId,
            factionId,
            giftId,
            tierId: impact.tierId,
            tierName: impact.tierName,
            impactType: impact.impactType,
            magnitude: finalMagnitude,
            streak: streakResult.isStreak,
            cooldownBlocked: false,
            overflowed: false,
            reserveAdded: 0,
            commandsProduced: commands.length,
            log,
        });
        return commands;
    }
    /** Returns all decisions made (for stats and testing). */
    getDecisions() {
        return this.decisions;
    }
    /** Returns and clears decisions. */
    drainDecisions() {
        const d = [...this.decisions];
        this.decisions.length = 0;
        return d;
    }
}
