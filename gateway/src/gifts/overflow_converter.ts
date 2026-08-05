/**
 * Phase 11 — OverflowConverter.
 *
 * When a gift impact would spawn more units than bounds allow, convert to
 * reserve energy/score at the configured conversion rate.
 * Tracks active unit counts per faction and global world events.
 */

import type { GiftBounds, GiftOverflow, GiftImpactType } from './gift_config.js';
import type { Clock } from './streak_aggregator.js';

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
  private readonly clock: Clock;

  /** Active champion lease expiry timestamps per faction. */
  private readonly championLeases: Map<string, number[]> = new Map();
  /** Active squad lease expiry timestamps per faction. */
  private readonly squadLeases: Map<string, number[]> = new Map();
  /** Active world event lease expiry timestamps. */
  private worldEventLeases: number[] = [];
  /** Accumulated reserve energy/score. */
  private reserve: number = 0;
  /** Total overflow conversions performed. */
  private overflowCount: number = 0;

  constructor(bounds: GiftBounds, overflow: GiftOverflow, clock?: Clock) {
    this.bounds = bounds;
    this.overflow = overflow;
    this.clock = clock ?? { now: () => Date.now() };
  }

  /** Number of currently active (lease not expired) entries. */
  private countActive(leases: number[]): number {
    const now = this.clock.now();
    return leases.filter((expiry) => expiry > now).length;
  }

  /** Adds a lease entry and returns the allowed/overflow decision. */
  private leaseOrOverflow(leases: number[], max: number, magnitude: number): OverflowResult {
    const now = this.clock.now();
    const active = this.countActive(leases);
    if (active >= max) {
      return this.convertToReserve(magnitude);
    }
    leases.push(now + this.bounds.unitLeaseMs);
    return { allowed: true, reserveAdded: 0, reserveType: this.overflow.type };
  }

  /**
   * Checks if an impact can be applied or should overflow to reserve.
   * If allowed, grants a bounded lease on the active count (auto-released
   * after unitLeaseMs, since the game never reports deaths/endings).
   * If overflowed, adds reserve.
   */
  applyOrOverflow(
    impactType: GiftImpactType,
    factionId: string,
    magnitude: number,
  ): OverflowResult {
    switch (impactType) {
      case 'spawn_champion': {
        const leases = this.championLeases.get(factionId) ?? [];
        this.championLeases.set(factionId, leases);
        return this.leaseOrOverflow(leases, this.bounds.maxActiveChampionsPerFaction, magnitude);
      }

      case 'spawn_squad': {
        const leases = this.squadLeases.get(factionId) ?? [];
        this.squadLeases.set(factionId, leases);
        return this.leaseOrOverflow(leases, this.bounds.maxActiveSquadsPerFaction, magnitude);
      }

      case 'start_world_event':
        return this.leaseOrOverflow(this.worldEventLeases, this.bounds.maxActiveWorldEvents, magnitude);

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
    return this.countActive(this.championLeases.get(factionId) ?? []);
  }

  /** Returns current active squad count for a faction. */
  getActiveSquads(factionId: string): number {
    return this.countActive(this.squadLeases.get(factionId) ?? []);
  }

  /** Returns current active world event count. */
  getActiveWorldEvents(): number {
    return this.countActive(this.worldEventLeases);
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
    const releaseOne = (leases: number[]): void => {
      if (leases.length > 0) leases.shift();
    };
    switch (impactType) {
      case 'spawn_champion':
        releaseOne(this.championLeases.get(factionId) ?? []);
        break;
      case 'spawn_squad':
        releaseOne(this.squadLeases.get(factionId) ?? []);
        break;
      case 'start_world_event':
        releaseOne(this.worldEventLeases);
        break;
    }
  }

  /** Resets all tracking state. */
  reset(): void {
    this.championLeases.clear();
    this.squadLeases.clear();
    this.worldEventLeases = [];
    this.reserve = 0;
    this.overflowCount = 0;
  }
}
