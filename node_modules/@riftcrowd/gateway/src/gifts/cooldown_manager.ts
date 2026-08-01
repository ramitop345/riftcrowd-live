/**
 * Phase 11 — CooldownManager.
 *
 * 5 independent cooldown timers:
 *   - perUser (per viewerId)
 *   - perFaction (per factionId)
 *   - ability (per ability ID)
 *   - cinematic (per cinematic ID)
 *   - global (single timer)
 *
 * Injectable clock for deterministic tests.
 */

import type { GiftCooldowns, GiftImpactType } from './gift_config.js';
import type { Clock } from './streak_aggregator.js';

// ---------------------------------------------------------------------------
// CooldownManager class
// ---------------------------------------------------------------------------

export class CooldownManager {
  private readonly perUserMs: number;
  private readonly perFactionMs: number;
  private readonly abilityMs: number;
  private readonly cinematicMs: number;
  private readonly globalMs: number;
  private readonly clock: Clock;

  /** Per-viewer cooldown expiry timestamps. */
  private readonly userCooldowns: Map<string, number> = new Map();
  /** Per-faction cooldown expiry timestamps. */
  private readonly factionCooldowns: Map<string, number> = new Map();
  /** Per-ability cooldown expiry timestamps. */
  private readonly abilityCooldowns: Map<string, number> = new Map();
  /** Per-cinematic cooldown expiry timestamps. */
  private readonly cinematicCooldowns: Map<string, number> = new Map();
  /** Global cooldown expiry timestamp. */
  private globalExpiry: number = 0;

  constructor(config: GiftCooldowns, clock?: Clock) {
    this.perUserMs = config.perUserMs;
    this.perFactionMs = config.perFactionMs;
    this.abilityMs = config.abilityMs;
    this.cinematicMs = config.cinematicMs;
    this.globalMs = config.globalMs;
    this.clock = clock ?? { now: () => Date.now() };
  }

  /**
   * Checks if a gift impact can fire given all cooldown constraints.
   * @param viewerId — the viewer triggering the impact
   * @param factionId — the faction affected
   * @param impactType — the type of impact
   * @param impactId — optional specific ID for ability/cinematic cooldowns
   * @returns true if all cooldowns have expired and the impact can fire
   */
  canFire(
    viewerId: string,
    factionId: string,
    impactType: GiftImpactType,
    impactId?: string,
  ): boolean {
    const now = this.clock.now();

    // Global cooldown
    if (now < this.globalExpiry) return false;

    // Per-user cooldown
    const userExpiry = this.userCooldowns.get(viewerId) ?? 0;
    if (now < userExpiry) return false;

    // Per-faction cooldown
    const factionExpiry = this.factionCooldowns.get(factionId) ?? 0;
    if (now < factionExpiry) return false;

    // Ability cooldown (only for cast_ability impacts)
    if (impactType === 'cast_ability' && impactId) {
      const abilityExpiry = this.abilityCooldowns.get(impactId) ?? 0;
      if (now < abilityExpiry) return false;
    }

    // Cinematic cooldown (only for cinematic impacts)
    if (impactId && (impactType === 'start_world_event' || impactType === 'display_spotlight')) {
      const cinematicExpiry = this.cinematicCooldowns.get(impactId) ?? 0;
      if (now < cinematicExpiry) return false;
    }

    return true;
  }

  /**
   * Marks that an impact has fired, starting all applicable cooldowns.
   */
  markFired(
    viewerId: string,
    factionId: string,
    impactType: GiftImpactType,
    impactId?: string,
  ): void {
    const now = this.clock.now();

    this.globalExpiry = now + this.globalMs;
    this.userCooldowns.set(viewerId, now + this.perUserMs);
    this.factionCooldowns.set(factionId, now + this.perFactionMs);

    if (impactType === 'cast_ability' && impactId) {
      this.abilityCooldowns.set(impactId, now + this.abilityMs);
    }

    if (impactId && (impactType === 'start_world_event' || impactType === 'display_spotlight')) {
      this.cinematicCooldowns.set(impactId, now + this.cinematicMs);
    }
  }

  /** Returns the reason why an impact can't fire, or null if it can. */
  getBlockReason(
    viewerId: string,
    factionId: string,
    impactType: GiftImpactType,
    impactId?: string,
  ): string | null {
    const now = this.clock.now();

    if (now < this.globalExpiry) return 'global_cooldown';
    if (now < (this.userCooldowns.get(viewerId) ?? 0)) return 'per_user_cooldown';
    if (now < (this.factionCooldowns.get(factionId) ?? 0)) return 'per_faction_cooldown';
    if (impactType === 'cast_ability' && impactId && now < (this.abilityCooldowns.get(impactId) ?? 0)) {
      return 'ability_cooldown';
    }
    if (
      impactId &&
      (impactType === 'start_world_event' || impactType === 'display_spotlight') &&
      now < (this.cinematicCooldowns.get(impactId) ?? 0)
    ) {
      return 'cinematic_cooldown';
    }

    return null;
  }

  /** Resets all cooldown state. */
  reset(): void {
    this.userCooldowns.clear();
    this.factionCooldowns.clear();
    this.abilityCooldowns.clear();
    this.cinematicCooldowns.clear();
    this.globalExpiry = 0;
  }
}
