/**
 * ContributionTracker — tracks per-viewer contribution category counters
 * (combat, defense, engagement, gifts).
 *
 * Bounded: each counter is capped at a safe integer (default 1,000,000)
 * to prevent overflow in long sessions.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContributionCategory = 'combat' | 'defense' | 'engagement' | 'gifts';

const ALL_CATEGORIES: readonly ContributionCategory[] = ['combat', 'defense', 'engagement', 'gifts'];

interface ViewerContributions {
  combat: number;
  defense: number;
  engagement: number;
  gifts: number;
}

// ---------------------------------------------------------------------------
// ContributionTracker class
// ---------------------------------------------------------------------------

export class ContributionTracker {
  private readonly contributions = new Map<string, ViewerContributions>();
  private readonly cap: number;

  constructor(cap: number = 1_000_000) {
    this.cap = cap;
  }

  // -------------------------------------------------------------------------
  // Record methods
  // -------------------------------------------------------------------------

  /** Records a combat contribution for the viewer. */
  recordCombat(viewerId: string, amount: number = 1): void {
    this.record(viewerId, 'combat', amount);
  }

  /** Records a defense contribution for the viewer. */
  recordDefense(viewerId: string, amount: number = 1): void {
    this.record(viewerId, 'defense', amount);
  }

  /** Records an engagement contribution for the viewer. */
  recordEngagement(viewerId: string, amount: number = 1): void {
    this.record(viewerId, 'engagement', amount);
  }

  /** Records a gift contribution for the viewer. */
  recordGift(viewerId: string, amount: number = 1): void {
    this.record(viewerId, 'gifts', amount);
  }

  // -------------------------------------------------------------------------
  // Query methods
  // -------------------------------------------------------------------------

  /**
   * Returns the viewerId with the highest total in the given category,
   * or null if no contributions exist.
   */
  getTopContributor(category: ContributionCategory): string | null {
    let topId: string | null = null;
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
  getViewerContributions(viewerId: string): Readonly<ViewerContributions> {
    return this.contributions.get(viewerId) ?? { combat: 0, defense: 0, engagement: 0, gifts: 0 };
  }

  /**
   * Zeroes all per-viewer contribution counters.
   * Does NOT touch viewer profile roundsParticipated — that is managed by the registry.
   */
  resetRound(): void {
    this.contributions.clear();
  }

  /** Number of viewers with recorded contributions. */
  get size(): number {
    return this.contributions.size;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private record(viewerId: string, category: ContributionCategory, amount: number): void {
    let contrib = this.contributions.get(viewerId);
    if (!contrib) {
      contrib = { combat: 0, defense: 0, engagement: 0, gifts: 0 };
      this.contributions.set(viewerId, contrib);
    }
    contrib[category] = Math.min(this.cap, contrib[category] + Math.max(0, Math.floor(amount)));
  }
}

export { ALL_CATEGORIES };
