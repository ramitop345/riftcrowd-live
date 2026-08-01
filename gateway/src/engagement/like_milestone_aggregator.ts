/**
 * Phase 12 — Like Milestone Aggregator.
 *
 * Tracks cumulative like counts per faction. When a milestone threshold is crossed,
 * emits a reward command (ADD_ENERGY or ADD_SCORE). Each milestone fires only ONCE per round.
 */

import {
  COMMAND_SCHEMA_VERSION,
  type GameCommand,
  type NormalizedLiveEvent,
} from '@riftcrowd/shared';
import { randomUUID } from 'node:crypto';
import type { LikeMilestone } from './free_engagement_config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LikeMilestoneDecision {
  eventId: string;
  factionId: string;
  milestoneCount: number;
  rewardType: 'add_energy' | 'add_score';
  magnitude: number;
  command: GameCommand;
  log: string;
}

// ---------------------------------------------------------------------------
// LikeMilestoneAggregator class
// ---------------------------------------------------------------------------

export class LikeMilestoneAggregator {
  private readonly milestones: LikeMilestone[];
  private readonly factionCounts = new Map<string, number>();
  private readonly firedMilestones = new Map<string, Set<number>>();

  /** Logger callback — injected for testability. */
  private readonly logFn: (msg: string) => void;

  /** Faction resolver — injected from ViewerRegistry; falls back to hash. */
  private readonly getFaction: (viewerId: string) => string | null;

  constructor(
    milestones: LikeMilestone[],
    logFn?: (msg: string) => void,
    getFaction?: (viewerId: string) => string | null,
  ) {
    // Sort milestones by count ascending
    this.milestones = [...milestones].sort((a, b) => a.count - b.count);
    this.logFn = logFn ?? (() => {});
    this.getFaction = getFaction ?? (() => null);
  }

  /**
   * Processes a like event. Returns any milestone decisions triggered.
   * Multiple milestones can fire if count jumps past several thresholds.
   */
  processLike(event: NormalizedLiveEvent): LikeMilestoneDecision[] {
    if (event.type !== 'like') return [];

    const viewerId = event.user.id;
    const factionId = this.getFaction(viewerId) ?? this.fallbackFaction(viewerId);

    // Increment count
    const current = (this.factionCounts.get(factionId) ?? 0) + 1;
    this.factionCounts.set(factionId, current);

    // Get already-fired milestones for this faction
    let fired = this.firedMilestones.get(factionId);
    if (!fired) {
      fired = new Set();
      this.firedMilestones.set(factionId, fired);
    }

    const decisions: LikeMilestoneDecision[] = [];

    // Check each milestone
    for (const milestone of this.milestones) {
      if (current >= milestone.count && !fired.has(milestone.count)) {
        fired.add(milestone.count);

        const commandType = milestone.reward.type === 'add_energy' ? 'ADD_ENERGY' : 'ADD_SCORE';
        const command: GameCommand = {
          schemaVersion: COMMAND_SCHEMA_VERSION,
          id: `cmd_${randomUUID()}`,
          type: commandType,
          createdAt: new Date().toISOString(),
          factionId,
          amount: milestone.reward.magnitude,
          sourceEventIds: [event.id],
          metadata: {
            source: 'like_milestone',
            milestoneCount: milestone.count,
          },
        };

        const log = `Like milestone ${milestone.count} reached for ${factionId} → ${commandType} ${milestone.reward.magnitude}`;
        this.logFn(`[LikeMilestone] ${log}`);

        decisions.push({
          eventId: event.id,
          factionId,
          milestoneCount: milestone.count,
          rewardType: milestone.reward.type,
          magnitude: milestone.reward.magnitude,
          command,
          log,
        });
      }
    }

    return decisions;
  }

  /** Returns the current like count for a faction. */
  getCount(factionId: string): number {
    return this.factionCounts.get(factionId) ?? 0;
  }

  /** Returns all faction counts. */
  getAllCounts(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [k, v] of this.factionCounts) {
      result[k] = v;
    }
    return result;
  }

  /** Resets all state for a new round. */
  reset(): void {
    this.factionCounts.clear();
    this.firedMilestones.clear();
  }

  /** Hash-based fallback faction assignment. */
  private fallbackFaction(viewerId: string): string {
    const hash = viewerId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return hash % 2 === 0 ? 'faction_alpha' : 'faction_beta';
  }
}
