/**
 * Phase 12 — Top Free Contributor Tracker.
 *
 * Tracks per-viewer free-engagement contributions (likes, follows, shares, votes, abilities).
 * At round end (RESULTS stage), the top contributor gets a spotlight (DISPLAY_SPOTLIGHT).
 * Separate from gift economy's contribution tracking.
 */

import {
  COMMAND_SCHEMA_VERSION,
  type GameCommand,
} from '@riftcrowd/shared';
import { randomUUID } from 'node:crypto';
import type { TopContributorConfig } from './free_engagement_config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FreeEngagementAction =
  | 'like'
  | 'follow'
  | 'share'
  | 'vote'
  | 'ability';

interface ViewerContributions {
  likes: number;
  follows: number;
  shares: number;
  votes: number;
  abilities: number;
  total: number;
}

export interface TopContributorDecision {
  viewerId: string;
  factionId: string;
  contributions: number;
  command: GameCommand;
  log: string;
}

// ---------------------------------------------------------------------------
// Weights for different actions
// ---------------------------------------------------------------------------

const ACTION_WEIGHTS: Record<FreeEngagementAction, number> = {
  like: 1,
  follow: 5,
  share: 5,
  vote: 1,
  ability: 1,
};

// ---------------------------------------------------------------------------
// TopContributor class
// ---------------------------------------------------------------------------

export class TopContributor {
  private readonly config: TopContributorConfig;
  private readonly contributions = new Map<string, ViewerContributions>();
  private readonly getFaction: (viewerId: string) => string | null;

  constructor(
    config: TopContributorConfig,
    getFaction?: (viewerId: string) => string | null,
  ) {
    this.config = config;
    this.getFaction = getFaction ?? (() => null);
  }

  /** Records a free-engagement action for a viewer. */
  record(viewerId: string, action: FreeEngagementAction): void {
    let contrib = this.contributions.get(viewerId);
    if (!contrib) {
      contrib = { likes: 0, follows: 0, shares: 0, votes: 0, abilities: 0, total: 0 };
      this.contributions.set(viewerId, contrib);
    }

    const weight = ACTION_WEIGHTS[action];
    contrib[action === 'like' ? 'likes' : action === 'follow' ? 'follows' : action === 'share' ? 'shares' : action === 'vote' ? 'votes' : 'abilities'] += 1;
    contrib.total += weight;
  }

  /**
   * Identifies the top contributor and produces a spotlight command.
   * Returns null if no contributions or disabled.
   */
  getTopContributorAtRoundEnd(): TopContributorDecision | null {
    if (!this.config.enabled) return null;

    let topViewerId: string | null = null;
    let topTotal = 0;

    // Find top contributor (ties broken alphabetically by viewerId)
    for (const [viewerId, contrib] of this.contributions) {
      if (contrib.total > topTotal || (contrib.total === topTotal && (topViewerId === null || viewerId < topViewerId))) {
        topTotal = contrib.total;
        topViewerId = viewerId;
      }
    }

    if (!topViewerId) return null;

    const factionId = this.getFaction(topViewerId) ?? this.fallbackFaction(topViewerId);

    const command: GameCommand = {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      id: `cmd_${randomUUID()}`,
      type: 'DISPLAY_SPOTLIGHT',
      createdAt: new Date().toISOString(),
      factionId,
      viewerId: topViewerId,
      amount: this.config.magnitude,
      sourceEventIds: [],
      metadata: {
        source: 'top_free_contributor',
        contributions: topTotal,
      },
    };

    const log = `Top free contributor: ${topViewerId} with ${topTotal} points → DISPLAY_SPOTLIGHT`;

    return {
      viewerId: topViewerId,
      factionId,
      contributions: topTotal,
      command,
      log,
    };
  }

  /** Returns all viewer contributions. */
  getAllContributions(): Record<string, { likes: number; follows: number; shares: number; votes: number; abilities: number; total: number }> {
    const result: Record<string, { likes: number; follows: number; shares: number; votes: number; abilities: number; total: number }> = {};
    for (const [k, v] of this.contributions) {
      result[k] = { ...v };
    }
    return result;
  }

  /** Returns contributions for a specific viewer. */
  getViewerContributions(viewerId: string): Readonly<ViewerContributions> {
    return this.contributions.get(viewerId) ?? { likes: 0, follows: 0, shares: 0, votes: 0, abilities: 0, total: 0 };
  }

  /** Resets all state for a new round. */
  reset(): void {
    this.contributions.clear();
  }

  /** Hash-based fallback faction assignment. */
  private fallbackFaction(viewerId: string): string {
    const hash = viewerId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return hash % 2 === 0 ? 'faction_alpha' : 'faction_beta';
  }
}
