/**
 * Phase 11 — GiftEconomy Orchestrator.
 *
 * Public facade that wires mapper + streak aggregator + cooldown manager +
 * overflow converter + gift rule.
 *
 * processGiftEvent(event) → GiftDecision[]
 * getStats() → GiftEconomyStats
 * previewMappings() → MappingPreviewRow[]
 */

import type { NormalizedLiveEvent } from '@riftcrowd/shared';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GiftEconomyConfigSchema,
  type GiftEconomyConfig,
} from './gift_config.js';
import { GiftMapper, type MappingPreviewRow } from './gift_mapper.js';
import { StreakAggregator, type Clock } from './streak_aggregator.js';
import { CooldownManager } from './cooldown_manager.js';
import { OverflowConverter } from './overflow_converter.js';
import { GiftRule, type GiftDecision } from './gift_rule.js';

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface GiftEconomyStats {
  eventsProcessed: number;
  commandsProduced: number;
  cooldownHits: number;
  overflowConversions: number;
  streaksDetected: number;
  perTier: Record<string, number>;
  perImpactType: Record<string, number>;
  reserve: number;
}

// ---------------------------------------------------------------------------
// GiftEconomy class
// ---------------------------------------------------------------------------

export class GiftEconomy {
  private config: GiftEconomyConfig;
  private mapper: GiftMapper;
  private streakAggregator: StreakAggregator;
  private cooldownManager: CooldownManager;
  private overflowConverter: OverflowConverter;
  private giftRule: GiftRule;
  private readonly getFaction: (viewerId: string) => string | null;

  private stats: GiftEconomyStats = {
    eventsProcessed: 0,
    commandsProduced: 0,
    cooldownHits: 0,
    overflowConversions: 0,
    streaksDetected: 0,
    perTier: {},
    perImpactType: {},
    reserve: 0,
  };

  constructor(
    config: GiftEconomyConfig,
    clock?: Clock,
    logFn?: (msg: string) => void,
    getFaction?: (viewerId: string) => string | null,
  ) {
    this.config = config;
    this.mapper = new GiftMapper(config);
    this.streakAggregator = new StreakAggregator(config.streaks, clock);
    this.cooldownManager = new CooldownManager(config.cooldowns, clock);
    this.overflowConverter = new OverflowConverter(config.bounds, config.overflow);
    this.getFaction = getFaction ?? (() => null);
    this.giftRule = new GiftRule(
      this.mapper,
      this.streakAggregator,
      this.cooldownManager,
      this.overflowConverter,
      logFn,
      getFaction,
    );
  }

  /**
   * Processes a single gift event through the full gift economy pipeline.
   * Returns all decisions made.
   */
  processGiftEvent(event: NormalizedLiveEvent): GiftDecision[] {
    this.stats.eventsProcessed++;

    if (event.type !== 'gift' || !event.gift) {
      return [];
    }

    this.giftRule.execute(event, {});
    const decisions = this.giftRule.drainDecisions();

    for (const decision of decisions) {
      if (decision.tierId) {
        this.stats.perTier[decision.tierId] = (this.stats.perTier[decision.tierId] ?? 0) + 1;
      }
      if (decision.impactType) {
        this.stats.perImpactType[decision.impactType] =
          (this.stats.perImpactType[decision.impactType] ?? 0) + 1;
      }
      if (decision.cooldownBlocked) this.stats.cooldownHits++;
      if (decision.overflowed) this.stats.overflowConversions++;
      if (decision.streak) this.stats.streaksDetected++;
      this.stats.commandsProduced += decision.commandsProduced;
    }

    this.stats.reserve = this.overflowConverter.getReserve();

    return decisions;
  }

  /** Returns accumulated stats. */
  getStats(): GiftEconomyStats {
    return { ...this.stats };
  }

  /** Returns the mapping preview table (delegated to mapper). */
  previewMappings(): MappingPreviewRow[] {
    return this.mapper.previewMappings();
  }

  /** Returns the underlying GiftRule for pipeline registration. */
  getRule(): GiftRule {
    return this.giftRule;
  }

  /** Returns the OverflowConverter for external unit release. */
  getOverflowConverter(): OverflowConverter {
    return this.overflowConverter;
  }

  /** Returns the current config. */
  getConfig(): GiftEconomyConfig {
    return this.config;
  }

  /**
   * Hot-reloads the config: replaces all internal components.
   * Preserves stats counters.
   */
  reloadConfig(
    newConfig: GiftEconomyConfig,
    clock?: Clock,
    logFn?: (msg: string) => void,
  ): void {
    this.config = newConfig;
    this.mapper = new GiftMapper(newConfig);
    this.streakAggregator = new StreakAggregator(newConfig.streaks, clock);
    this.cooldownManager = new CooldownManager(newConfig.cooldowns, clock);
    this.overflowConverter = new OverflowConverter(newConfig.bounds, newConfig.overflow);
    this.giftRule = new GiftRule(
      this.mapper,
      this.streakAggregator,
      this.cooldownManager,
      this.overflowConverter,
      logFn,
      this.getFaction,
    );
  }

  /** Resets all state (stats + internal tracking). */
  reset(): void {
    this.stats = {
      eventsProcessed: 0,
      commandsProduced: 0,
      cooldownHits: 0,
      overflowConversions: 0,
      streaksDetected: 0,
      perTier: {},
      perImpactType: {},
      reserve: 0,
    };
    this.streakAggregator.reset();
    this.cooldownManager.reset();
    this.overflowConverter.reset();
  }

  /**
   * Loads the default gift config from gateway/config/gifts.json.
   */
  static loadDefaultConfig(): GiftEconomyConfig {
    const configDir = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      'config',
    );
    const configPath = join(configDir, 'gifts.json');
    const raw = readFileSync(configPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return GiftEconomyConfigSchema.parse(parsed);
  }
}
