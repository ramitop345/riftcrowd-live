/**
 * Phase 11 — OverflowConverter.
 *
 * When a gift impact would spawn more units than bounds allow, convert to
 * reserve energy/score at the configured conversion rate.
 * Tracks active unit counts per faction and global world events.
 */

import type { GiftBounds, GiftOverflow, GiftImpactType } from './gift_config.js';

// ---------------------------------------------------------------------------
// Overflow result
// ---------------------------------------------------------------------------

export interface OverflowResult {
  /** Whether the impact was allowed (not overflowing). */
  allowed: boolean;
  /** If overflowed, the reserve amount added. */
  reserveAdded: number;
  /** The type of reserve (from config). */
  reserveType: 'reserve_energy' | 'reserve_score';
}

// ---------------------------------------------------------------------------
// OverflowConverter class
// ---------------------------------------------------------------------------

const MAX_RESERVE = 1_000_000;

export class OverflowConverter {
  private readonly bounds: GiftBounds;
  private readonly overflow: GiftOverflow;

  /** Active champion counts per faction. */
  private readonly championsPerFaction: Map<string, number> = new Map();
  /** Active squad counts per faction. */
  private readonly squadsPerFaction: Map<string, number> = new Map();
  /** Active world event count. */
  private activeWorldEvents: number = 0;
  /** Accumulated reserve energy/score. */
  private reserve: number = 0;
  /** Total overflow conversions performed. */
  private overflowCount: number = 0;

  constructor(bounds: GiftBounds, overflow: GiftOverflow) {
    this.bounds = bounds;
    this.overflow = overflow;
  }

  /**
   * Checks if an impact can be applied or should overflow to reserve.
   * If allowed, increments the active count. If overflowed, adds reserve.
   */
  applyOrOverflow(
    impactType: GiftImpactType,
    factionId: string,
    magnitude: number,
  ): OverflowResult {
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

  private convertToReserve(magnitude: number): OverflowResult {
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
  getActiveChampions(factionId: string): number {
    return this.championsPerFaction.get(factionId) ?? 0;
  }

  /** Returns current active squad count for a faction. */
  getActiveSquads(factionId: string): number {
    return this.squadsPerFaction.get(factionId) ?? 0;
  }

  /** Returns current active world event count. */
  getActiveWorldEvents(): number {
    return this.activeWorldEvents;
  }

  /** Returns accumulated reserve. */
  getReserve(): number {
    return this.reserve;
  }

  /** Returns total overflow conversion count. */
  getOverflowCount(): number {
    return this.overflowCount;
  }

  /** Decrements an active unit (call when unit dies or event ends). */
  releaseUnit(impactType: GiftImpactType, factionId: string): void {
    switch (impactType) {
      case 'spawn_champion': {
        const current = this.championsPerFaction.get(factionId) ?? 0;
        if (current > 0) this.championsPerFaction.set(factionId, current - 1);
        break;
      }
      case 'spawn_squad': {
        const current = this.squadsPerFaction.get(factionId) ?? 0;
        if (current > 0) this.squadsPerFaction.set(factionId, current - 1);
        break;
      }
      case 'start_world_event': {
        if (this.activeWorldEvents > 0) this.activeWorldEvents--;
        break;
      }
    }
  }

  /** Resets all tracking state. */
  reset(): void {
    this.championsPerFaction.clear();
    this.squadsPerFaction.clear();
    this.activeWorldEvents = 0;
    this.reserve = 0;
    this.overflowCount = 0;
  }
}
