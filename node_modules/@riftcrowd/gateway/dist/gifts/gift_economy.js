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
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GiftEconomyConfigSchema, } from './gift_config.js';
import { GiftMapper } from './gift_mapper.js';
import { StreakAggregator } from './streak_aggregator.js';
import { CooldownManager } from './cooldown_manager.js';
import { OverflowConverter } from './overflow_converter.js';
import { GiftRule } from './gift_rule.js';
// ---------------------------------------------------------------------------
// GiftEconomy class
// ---------------------------------------------------------------------------
export class GiftEconomy {
    config;
    mapper;
    streakAggregator;
    cooldownManager;
    overflowConverter;
    giftRule;
    getFaction;
    stats = {
        eventsProcessed: 0,
        commandsProduced: 0,
        cooldownHits: 0,
        overflowConversions: 0,
        streaksDetected: 0,
        perTier: {},
        perImpactType: {},
        reserve: 0,
    };
    constructor(config, clock, logFn, getFaction) {
        this.config = config;
        this.mapper = new GiftMapper(config);
        this.streakAggregator = new StreakAggregator(config.streaks, clock);
        this.cooldownManager = new CooldownManager(config.cooldowns, clock);
        this.overflowConverter = new OverflowConverter(config.bounds, config.overflow);
        this.getFaction = getFaction ?? (() => null);
        this.giftRule = new GiftRule(this.mapper, this.streakAggregator, this.cooldownManager, this.overflowConverter, logFn, getFaction);
    }
    /**
     * Processes a single gift event through the full gift economy pipeline.
     * Returns all decisions made.
     */
    processGiftEvent(event) {
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
            if (decision.cooldownBlocked)
                this.stats.cooldownHits++;
            if (decision.overflowed)
                this.stats.overflowConversions++;
            if (decision.streak)
                this.stats.streaksDetected++;
            this.stats.commandsProduced += decision.commandsProduced;
        }
        this.stats.reserve = this.overflowConverter.getReserve();
        return decisions;
    }
    /** Returns accumulated stats. */
    getStats() {
        return { ...this.stats };
    }
    /** Returns the mapping preview table (delegated to mapper). */
    previewMappings() {
        return this.mapper.previewMappings();
    }
    /** Returns the underlying GiftRule for pipeline registration. */
    getRule() {
        return this.giftRule;
    }
    /** Returns the OverflowConverter for external unit release. */
    getOverflowConverter() {
        return this.overflowConverter;
    }
    /** Returns the current config. */
    getConfig() {
        return this.config;
    }
    /**
     * Hot-reloads the config: replaces all internal components.
     * Preserves stats counters.
     */
    reloadConfig(newConfig, clock, logFn) {
        this.config = newConfig;
        this.mapper = new GiftMapper(newConfig);
        this.streakAggregator = new StreakAggregator(newConfig.streaks, clock);
        this.cooldownManager = new CooldownManager(newConfig.cooldowns, clock);
        this.overflowConverter = new OverflowConverter(newConfig.bounds, newConfig.overflow);
        this.giftRule = new GiftRule(this.mapper, this.streakAggregator, this.cooldownManager, this.overflowConverter, logFn, this.getFaction);
    }
    /** Resets all state (stats + internal tracking). */
    reset() {
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
    static loadDefaultConfig() {
        const configDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'config');
        const configPath = join(configDir, 'gifts.json');
        const raw = readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw);
        return GiftEconomyConfigSchema.parse(parsed);
    }
}
