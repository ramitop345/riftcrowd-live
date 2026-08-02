/**
 * Phase 11 — OverflowConverter.
 *
 * When a gift impact would spawn more units than bounds allow, convert to
 * reserve energy/score at the configured conversion rate.
 * Tracks active unit counts per faction and global world events.
 */
// ---------------------------------------------------------------------------
// OverflowConverter class
// ---------------------------------------------------------------------------
const MAX_RESERVE = 1_000_000;
export class OverflowConverter {
    bounds;
    overflow;
    /** Active champion counts per faction. */
    championsPerFaction = new Map();
    /** Active squad counts per faction. */
    squadsPerFaction = new Map();
    /** Active world event count. */
    activeWorldEvents = 0;
    /** Accumulated reserve energy/score. */
    reserve = 0;
    /** Total overflow conversions performed. */
    overflowCount = 0;
    constructor(bounds, overflow) {
        this.bounds = bounds;
        this.overflow = overflow;
    }
    /**
     * Checks if an impact can be applied or should overflow to reserve.
     * If allowed, increments the active count. If overflowed, adds reserve.
     */
    applyOrOverflow(impactType, factionId, magnitude) {
        switch (impactType) {
            case 'spawn_champion': {
                const current = this.championsPerFaction.get(factionId) ?? 0;
                if (current >= this.bounds.maxActiveChampionsPerFaction) {
                    return this.convertToReserve(magnitude);
                }
                this.championsPerFaction.set(factionId, current + 1);
                return { allowed: true, reserveAdded: 0, reserveType: this.overflow.type };
            }
            case 'spawn_squad': {
                const current = this.squadsPerFaction.get(factionId) ?? 0;
                if (current >= this.bounds.maxActiveSquadsPerFaction) {
                    return this.convertToReserve(magnitude);
                }
                this.squadsPerFaction.set(factionId, current + 1);
                return { allowed: true, reserveAdded: 0, reserveType: this.overflow.type };
            }
            case 'start_world_event': {
                if (this.activeWorldEvents >= this.bounds.maxActiveWorldEvents) {
                    return this.convertToReserve(magnitude);
                }
                this.activeWorldEvents++;
                return { allowed: true, reserveAdded: 0, reserveType: this.overflow.type };
            }
            // Non-spawning impacts always pass through
            case 'add_energy':
            case 'add_shield':
            case 'cast_ability':
            case 'display_spotlight':
                return { allowed: true, reserveAdded: 0, reserveType: this.overflow.type };
            default:
                return { allowed: true, reserveAdded: 0, reserveType: this.overflow.type };
        }
    }
    convertToReserve(magnitude) {
        const amount = Math.round(magnitude * this.overflow.conversionRate);
        const prevReserve = this.reserve;
        this.reserve = Math.min(MAX_RESERVE, this.reserve + amount);
        const actualAdded = this.reserve - prevReserve;
        this.overflowCount++;
        return {
            allowed: false,
            reserveAdded: actualAdded,
            reserveType: this.overflow.type,
        };
    }
    /** Returns current active champion count for a faction. */
    getActiveChampions(factionId) {
        return this.championsPerFaction.get(factionId) ?? 0;
    }
    /** Returns current active squad count for a faction. */
    getActiveSquads(factionId) {
        return this.squadsPerFaction.get(factionId) ?? 0;
    }
    /** Returns current active world event count. */
    getActiveWorldEvents() {
        return this.activeWorldEvents;
    }
    /** Returns accumulated reserve. */
    getReserve() {
        return this.reserve;
    }
    /** Returns total overflow conversion count. */
    getOverflowCount() {
        return this.overflowCount;
    }
    /** Decrements an active unit (call when unit dies or event ends). */
    releaseUnit(impactType, factionId) {
        switch (impactType) {
            case 'spawn_champion': {
                const current = this.championsPerFaction.get(factionId) ?? 0;
                if (current > 0)
                    this.championsPerFaction.set(factionId, current - 1);
                break;
            }
            case 'spawn_squad': {
                const current = this.squadsPerFaction.get(factionId) ?? 0;
                if (current > 0)
                    this.squadsPerFaction.set(factionId, current - 1);
                break;
            }
            case 'start_world_event': {
                if (this.activeWorldEvents > 0)
                    this.activeWorldEvents--;
                break;
            }
        }
    }
    /** Resets all tracking state. */
    reset() {
        this.championsPerFaction.clear();
        this.squadsPerFaction.clear();
        this.activeWorldEvents = 0;
        this.reserve = 0;
        this.overflowCount = 0;
    }
}
