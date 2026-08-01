/**
 * Phase 12 — Free Engagement Orchestrator.
 *
 * Public facade that wires all engagement components.
 * processEvent(event) → EngagementDecision[]
 * getStats() → FreeEngagementStats
 * getTopContributors() → TopContributorInfo[]
 */

import type { NormalizedLiveEvent, GameCommand } from '@riftcrowd/shared';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FreeEngagementConfigSchema,
  type FreeEngagementConfig,
} from './free_engagement_config.js';
import { SpamFilter } from './spam_filter.js';
import { LikeMilestoneAggregator } from './like_milestone_aggregator.js';
import { FollowGuardian } from './follow_guardian.js';
import { ShareShield } from './share_shield.js';
import { StrategyVote } from './strategy_vote.js';
import { FreeEnergyAbility } from './free_energy_ability.js';
import { TopContributor } from './top_contributor.js';
import { FreeEngagementRule } from './free_engagement_rule.js';

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface FreeEngagementStats {
  eventsProcessed: number;
  commandsProduced: number;
  spamBlocked: number;
  likeMilestonesFired: number;
  guardiansSpawned: number;
  shieldsApplied: number;
  strategyVotesCast: number;
  abilitiesFired: number;
}

export interface TopContributorInfo {
  viewerId: string;
  contributions: number;
}

// ---------------------------------------------------------------------------
// FreeEngagement class
// ---------------------------------------------------------------------------

export class FreeEngagement {
  private config: FreeEngagementConfig;
  private spamFilter: SpamFilter;
  private likeAggregator: LikeMilestoneAggregator;
  private followGuardian: FollowGuardian;
  private shareShield: ShareShield;
  private strategyVote: StrategyVote;
  private freeEnergyAbility: FreeEnergyAbility;
  private topContributor: TopContributor;
  private rule: FreeEngagementRule;
  private readonly getFaction: (viewerId: string) => string | null;

  private stats: FreeEngagementStats = {
    eventsProcessed: 0,
    commandsProduced: 0,
    spamBlocked: 0,
    likeMilestonesFired: 0,
    guardiansSpawned: 0,
    shieldsApplied: 0,
    strategyVotesCast: 0,
    abilitiesFired: 0,
  };

  constructor(
    config: FreeEngagementConfig,
    logFn?: (msg: string) => void,
    getFaction?: (viewerId: string) => string | null,
  ) {
    this.config = config;
    this.getFaction = getFaction ?? (() => null);

    this.spamFilter = new SpamFilter(config.spam);
    this.likeAggregator = new LikeMilestoneAggregator(config.likeMilestones, logFn, getFaction);
    this.followGuardian = new FollowGuardian(
      config.followGuardian,
      config.bounds.maxActiveGuardiansPerFaction,
      logFn,
      getFaction,
    );
    this.shareShield = new ShareShield(
      config.shareShield,
      config.bounds.maxActiveShieldsPerFaction,
      logFn,
      getFaction,
    );
    this.strategyVote = new StrategyVote(config.strategyVote, config.spam.duplicateVoteWindowMs, logFn, getFaction);
    this.freeEnergyAbility = new FreeEnergyAbility(config.freeEnergyAbility, logFn, getFaction);
    this.topContributor = new TopContributor(config.topContributor, getFaction);

    this.rule = new FreeEngagementRule(
      this.spamFilter,
      this.likeAggregator,
      this.followGuardian,
      this.shareShield,
      this.strategyVote,
      this.freeEnergyAbility,
      this.topContributor,
      logFn,
    );
  }

  /**
   * Processes a single event through all engagement subsystems.
   * Returns any commands produced.
   */
  processEvent(event: NormalizedLiveEvent): GameCommand[] {
    this.stats.eventsProcessed++;

    if (!this.rule.applies(event)) {
      return [];
    }

    const commands = this.rule.execute(event, {});
    if (commands) {
      this.stats.commandsProduced += commands.length;

      // Update stats based on command types
      for (const cmd of commands) {
        if (cmd.type === 'ADD_ENERGY' || cmd.type === 'ADD_SCORE') {
          this.stats.likeMilestonesFired++;
        } else if (cmd.type === 'FOLLOW_GUARDIAN') {
          this.stats.guardiansSpawned++;
        } else if (cmd.type === 'SHARE_SHIELD') {
          this.stats.shieldsApplied++;
        } else if (cmd.type === 'STRATEGY_VOTE') {
          this.stats.strategyVotesCast++;
        } else if (cmd.type === 'FREE_ENERGY_ABILITY') {
          this.stats.abilitiesFired++;
        }
      }

      return commands;
    }

    // If we get here with a chat event, it was likely spam-blocked
    if (event.type === 'chat') {
      this.stats.spamBlocked++;
    }

    return [];
  }

  /**
   * Called at round end to get top contributor spotlight.
   */
  getTopContributorCommand(): GameCommand | null {
    return this.rule.getTopContributorCommand();
  }

  /** Resets all state for a new round. */
  resetRound(): void {
    this.rule.resetRound();
  }

  /** Returns accumulated stats. */
  getStats(): FreeEngagementStats {
    return { ...this.stats };
  }

  /** Returns top contributors list. */
  getTopContributors(): TopContributorInfo[] {
    const all = this.topContributor.getAllContributions();
    return Object.entries(all)
      .map(([viewerId, contrib]) => ({ viewerId, contributions: contrib.total }))
      .sort((a, b) => b.contributions - a.contributions)
      .slice(0, 10);
  }

  /** Returns the underlying rule for pipeline registration. */
  getRule(): FreeEngagementRule {
    return this.rule;
  }

  /** Returns the current config. */
  getConfig(): FreeEngagementConfig {
    return this.config;
  }

  /**
   * Hot-reloads the config: replaces all internal components.
   * Preserves stats counters.
   */
  reloadConfig(newConfig: FreeEngagementConfig, logFn?: (msg: string) => void): void {
    this.config = newConfig;
    this.spamFilter = new SpamFilter(newConfig.spam);
    this.likeAggregator = new LikeMilestoneAggregator(newConfig.likeMilestones, logFn, this.getFaction);
    this.followGuardian = new FollowGuardian(
      newConfig.followGuardian,
      newConfig.bounds.maxActiveGuardiansPerFaction,
      logFn,
      this.getFaction,
    );
    this.shareShield = new ShareShield(
      newConfig.shareShield,
      newConfig.bounds.maxActiveShieldsPerFaction,
      logFn,
      this.getFaction,
    );
    this.strategyVote = new StrategyVote(newConfig.strategyVote, newConfig.spam.duplicateVoteWindowMs, logFn, this.getFaction);
    this.freeEnergyAbility = new FreeEnergyAbility(newConfig.freeEnergyAbility, logFn, this.getFaction);
    this.topContributor = new TopContributor(newConfig.topContributor, this.getFaction);

    this.rule = new FreeEngagementRule(
      this.spamFilter,
      this.likeAggregator,
      this.followGuardian,
      this.shareShield,
      this.strategyVote,
      this.freeEnergyAbility,
      this.topContributor,
      logFn,
    );
  }

  /** Resets all state (stats + internal tracking). */
  reset(): void {
    this.stats = {
      eventsProcessed: 0,
      commandsProduced: 0,
      spamBlocked: 0,
      likeMilestonesFired: 0,
      guardiansSpawned: 0,
      shieldsApplied: 0,
      strategyVotesCast: 0,
      abilitiesFired: 0,
    };
    this.rule.resetRound();
  }

  /**
   * Loads the default config from gateway/config/free_engagement.json.
   */
  static loadDefaultConfig(): FreeEngagementConfig {
    const configDir = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      'config',
    );
    const configPath = join(configDir, 'free_engagement.json');
    const raw = readFileSync(configPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return FreeEngagementConfigSchema.parse(parsed);
  }
}
