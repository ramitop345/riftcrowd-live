/**
 * Phase 12 — Strategy Vote Aggregator.
 *
 * Collects STRATEGY votes from chat commands (!strategy <option>).
 * Within windowMs, if an option reaches minVotes, emits a CAST_ABILITY command.
 * Duplicate vote prevention: same viewer + same option within duplicateVoteWindowMs → rejected.
 */

import {
  COMMAND_SCHEMA_VERSION,
  type GameCommand,
  type NormalizedLiveEvent,
} from '@riftcrowd/shared';
import { randomUUID } from 'node:crypto';
import type { StrategyVoteConfig } from './free_engagement_config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StrategyVoteDecision {
  eventId: string;
  viewerId: string;
  factionId: string;
  option: string;
  duplicate: boolean;
  reached: boolean;
  voteCount: number;
  command: GameCommand | null;
  log: string;
}

interface VoteRecord {
  viewerId: string;
  option: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// StrategyVote class
// ---------------------------------------------------------------------------

export class StrategyVote {
  private readonly config: StrategyVoteConfig;
  private readonly votes = new Map<string, VoteRecord[]>();
  private readonly logFn: (msg: string) => void;
  private readonly getFaction: (viewerId: string) => string | null;
  private readonly duplicateWindowMs: number;

  constructor(
    config: StrategyVoteConfig,
    duplicateWindowMs: number,
    logFn?: (msg: string) => void,
    getFaction?: (viewerId: string) => string | null,
  ) {
    this.config = config;
    this.duplicateWindowMs = duplicateWindowMs;
    this.logFn = logFn ?? (() => {});
    this.getFaction = getFaction ?? (() => null);
  }

  /**
   * Processes a strategy vote from a chat event.
   * Returns a decision if the vote is valid.
   */
  processVote(event: NormalizedLiveEvent, option: string, nowMs: number): StrategyVoteDecision | null {
    const viewerId = event.user.id;
    const factionId = this.getFaction(viewerId) ?? this.fallbackFaction(viewerId);

    // Validate option
    if (!this.config.options.includes(option.toLowerCase())) {
      return null;
    }

    const normalizedOption = option.toLowerCase();

    // Check for duplicate vote (same viewer + same option within duplicateVoteWindowMs)
    const existingVotes = this.votes.get(factionId) ?? [];
    const duplicate = existingVotes.some(
      (v) =>
        v.viewerId === viewerId &&
        v.option === normalizedOption &&
        nowMs - v.timestamp < this.duplicateWindowMs,
    );

    if (duplicate) {
      const log = `Strategy vote from ${viewerId} for ${normalizedOption} → duplicate within ${this.duplicateWindowMs}ms, skipping`;
      this.logFn(`[StrategyVote] ${log}`);
      return {
        eventId: event.id,
        viewerId,
        factionId,
        option: normalizedOption,
        duplicate: true,
        reached: false,
        voteCount: this.countVotes(factionId, normalizedOption, nowMs),
        command: null,
        log,
      };
    }

    // Record vote
    if (!this.votes.has(factionId)) {
      this.votes.set(factionId, []);
    }
    this.votes.get(factionId)!.push({
      viewerId,
      option: normalizedOption,
      timestamp: nowMs,
    });

    // Count votes for this option within window
    const voteCount = this.countVotes(factionId, normalizedOption, nowMs);

    // Check if reached threshold
    if (voteCount >= this.config.minVotes) {
      const command: GameCommand = {
        schemaVersion: COMMAND_SCHEMA_VERSION,
        id: `cmd_${randomUUID()}`,
        type: 'STRATEGY_VOTE',
        createdAt: new Date().toISOString(),
        factionId,
        abilityId: normalizedOption,
        sourceEventIds: [event.id],
        metadata: {
          source: 'strategy_vote',
          option: normalizedOption,
          voteCount,
        },
      };

      const log = `Strategy vote ${normalizedOption} reached ${voteCount} votes for ${factionId} → STRATEGY_VOTE`;
      this.logFn(`[StrategyVote] ${log}`);

      // Clear votes for this option to prevent re-firing
      this.clearVotesForOption(factionId, normalizedOption, nowMs);

      return {
        eventId: event.id,
        viewerId,
        factionId,
        option: normalizedOption,
        duplicate: false,
        reached: true,
        voteCount,
        command,
        log,
      };
    }

    const log = `Strategy vote ${normalizedOption} from ${viewerId} for ${factionId} (${voteCount}/${this.config.minVotes})`;
    this.logFn(`[StrategyVote] ${log}`);

    return {
      eventId: event.id,
      viewerId,
      factionId,
      option: normalizedOption,
      duplicate: false,
      reached: false,
      voteCount,
      command: null,
      log,
    };
  }

  /** Counts votes for an option within the window. */
  private countVotes(factionId: string, option: string, nowMs: number): number {
    const votes = this.votes.get(factionId) ?? [];
    const cutoff = nowMs - this.config.windowMs;
    return votes.filter((v) => v.option === option && v.timestamp > cutoff).length;
  }

  /** Clears votes for an option (after reaching threshold). */
  private clearVotesForOption(factionId: string, option: string, nowMs: number): void {
    const votes = this.votes.get(factionId) ?? [];
    const cutoff = nowMs - this.config.windowMs;
    const remaining = votes.filter((v) => !(v.option === option && v.timestamp > cutoff));
    this.votes.set(factionId, remaining);
  }

  /** Returns vote counts for all options in a faction. */
  getVoteCounts(factionId: string, nowMs: number): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const option of this.config.options) {
      counts[option] = this.countVotes(factionId, option, nowMs);
    }
    return counts;
  }

  /** Resets all state for a new round. */
  reset(): void {
    this.votes.clear();
  }

  /** Hash-based fallback faction assignment. */
  private fallbackFaction(viewerId: string): string {
    const hash = viewerId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return hash % 2 === 0 ? 'faction_alpha' : 'faction_beta';
  }
}
