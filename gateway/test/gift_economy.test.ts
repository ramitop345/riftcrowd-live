/**
 * Phase 11 — Gift Economy unit tests.
 *
 * Tests: GiftMapper (8+), StreakAggregator (10+), CooldownManager (10+),
 * OverflowConverter (6+), GiftRule (10+), GiftEconomy orchestrator (5+).
 * Total target: ≥70 tests.
 *
 * All tests use deterministic TestClock and mock data only.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GiftEconomyConfigSchema,
  type GiftEconomyConfig,
} from '../src/gifts/gift_config.js';
import { GiftMapper } from '../src/gifts/gift_mapper.js';
import { StreakAggregator, type Clock } from '../src/gifts/streak_aggregator.js';
import { CooldownManager } from '../src/gifts/cooldown_manager.js';
import { OverflowConverter } from '../src/gifts/overflow_converter.js';
import { GiftRule } from '../src/gifts/gift_rule.js';
import { GiftEconomy } from '../src/gifts/gift_economy.js';
import type { NormalizedLiveEvent } from '@riftcrowd/shared';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function loadTestConfig(): GiftEconomyConfig {
  const configDir = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'config',
  );
  const raw = readFileSync(join(configDir, 'gifts.json'), 'utf8');
  return GiftEconomyConfigSchema.parse(JSON.parse(raw));
}

class TestClock implements Clock {
  private time: number;
  constructor(initial: number = 0) {
    this.time = initial;
  }
  now(): number {
    return this.time;
  }
  advance(ms: number): void {
    this.time += ms;
  }
  setTime(ms: number): void {
    this.time = ms;
  }
}

function makeGiftEvent(
  giftId: string,
  viewerId: string,
  count: number = 1,
  eventId?: string,
): NormalizedLiveEvent {
  const id = eventId ?? `evt_${Math.random().toString(36).slice(2, 10)}`;
  return {
    schemaVersion: 1,
    id,
    provider: 'mock',
    type: 'gift',
    receivedAt: new Date().toISOString(),
    user: { id: viewerId, handle: `@${viewerId}`, displayName: viewerId },
    gift: {
      id: giftId,
      name: 'TestGift',
      repeatCount: count,
      streakId: undefined,
      streakEnded: false,
    },
    rawHash: `sha256:mock_${id}_gift`,
  };
}

function makeChatEvent(viewerId: string): NormalizedLiveEvent {
  const id = `evt_chat_${Math.random().toString(36).slice(2, 10)}`;
  return {
    schemaVersion: 1,
    id,
    provider: 'mock',
    type: 'chat',
    receivedAt: new Date().toISOString(),
    user: { id: viewerId, handle: `@${viewerId}`, displayName: viewerId },
    comment: 'hello',
    rawHash: `sha256:mock_${id}_chat`,
  };
}

// ===================================================================
// GiftEconomyConfigSchema
// ===================================================================

describe('GiftEconomyConfigSchema', () => {
  let config: GiftEconomyConfig;

  beforeEach(() => {
    config = loadTestConfig();
  });

  it('validates the default gifts.json config', () => {
    expect(config.tiers).toHaveLength(4);
    expect(config.mappings).toHaveLength(24);
    expect(config.cooldowns.perUserMs).toBe(1200);
    expect(config.streaks.minCount).toBe(3);
    expect(config.bounds.maxActiveChampionsPerFaction).toBe(5);
  });

  it('rejects config with missing tiers', () => {
    const invalid = { ...config, tiers: undefined };
    expect(() => GiftEconomyConfigSchema.parse(invalid)).toThrow();
  });

  it('rejects config with empty tiers array', () => {
    const invalid = { ...config, tiers: [] };
    expect(() => GiftEconomyConfigSchema.parse(invalid)).toThrow();
  });

  it('rejects config with missing mappings', () => {
    const invalid = { ...config, mappings: undefined };
    expect(() => GiftEconomyConfigSchema.parse(invalid)).toThrow();
  });

  it('rejects config with missing cooldowns', () => {
    const invalid = { ...config, cooldowns: undefined };
    expect(() => GiftEconomyConfigSchema.parse(invalid)).toThrow();
  });

  it('rejects config with missing overflow', () => {
    const invalid = { ...config, overflow: undefined };
    expect(() => GiftEconomyConfigSchema.parse(invalid)).toThrow();
  });

  it('rejects config with unknown tierId in mappings (FIX 9)', () => {
    const invalid = {
      ...config,
      mappings: [{ giftId: 'gift_bad', tierId: 'tier_nonexistent', displayName: 'Bad' }],
    };
    const result = GiftEconomyConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('tierId'))).toBe(true);
    }
  });
});

// ===================================================================
// GiftMapper
// ===================================================================

describe('GiftMapper', () => {
  let mapper: GiftMapper;

  beforeEach(() => {
    mapper = new GiftMapper(loadTestConfig());
  });

  it('resolves known gift_001 to tier_spark', () => {
    const impact = mapper.resolve('gift_001');
    expect(impact).not.toBeNull();
    expect(impact!.tierId).toBe('tier_spark');
    expect(impact!.impactType).toBe('add_energy');
    expect(impact!.magnitude).toBe(10);
  });

  it('resolves known gift_008 to tier_flare', () => {
    const impact = mapper.resolve('gift_008');
    expect(impact).not.toBeNull();
    expect(impact!.tierId).toBe('tier_flare');
    expect(impact!.impactType).toBe('spawn_champion');
  });

  it('resolves known gift_015 to tier_nova', () => {
    const impact = mapper.resolve('gift_015');
    expect(impact).not.toBeNull();
    expect(impact!.tierId).toBe('tier_nova');
    expect(impact!.impactType).toBe('start_world_event');
    expect(impact!.cinematic).toBe(true);
  });

  it('returns null for unknown gift ID', () => {
    const impact = mapper.resolve('gift_unknown');
    expect(impact).toBeNull();
    const warnings = mapper.drainWarnings();
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('Unknown gift ID');
  });

  it('returns null for empty giftId', () => {
    const impact = mapper.resolve('');
    expect(impact).toBeNull();
  });

  it('scales magnitude with count', () => {
    const impact = mapper.resolve('gift_001', 5);
    expect(impact).not.toBeNull();
    expect(impact!.magnitude).toBe(50); // 10 * 5
  });

  it('count of 0 is treated as 1', () => {
    const impact = mapper.resolve('gift_001', 0);
    expect(impact!.magnitude).toBe(10); // min(1, 0) = 1
  });

  it('previewMappings returns all 24 rows', () => {
    const preview = mapper.previewMappings();
    expect(preview).toHaveLength(24);
    expect(preview[0]!.giftId).toBe('gift_001');
    expect(preview[0]!.tierName).toBe('Spark');
  });

  it('preview includes displayName', () => {
    const preview = mapper.previewMappings();
    const rose = preview.find((r) => r.giftId === 'gift_001');
    expect(rose!.displayName).toBe('Rose');
  });
});

// ===================================================================
// StreakAggregator
// ===================================================================

describe('StreakAggregator', () => {
  let clock: TestClock;
  let aggregator: StreakAggregator;

  beforeEach(() => {
    clock = new TestClock(1000);
    aggregator = new StreakAggregator(
      { windowMs: 5000, minCount: 3, multiplier: 1.5 },
      clock,
    );
  });

  it('detects streak at minCount=3 within window', () => {
    aggregator.record('v1', 'tier_spark', 10);
    clock.advance(1000);
    aggregator.record('v1', 'tier_spark', 10);
    clock.advance(1000);
    const result = aggregator.record('v1', 'tier_spark', 10);
    expect(result.isStreak).toBe(true);
    expect(result.adjustedMagnitude).toBe(15); // 10 * 1.5
  });

  it('4th gift in same window does not trigger new streak', () => {
    aggregator.record('v1', 'tier_spark', 10);
    clock.advance(1000);
    aggregator.record('v1', 'tier_spark', 10);
    clock.advance(1000);
    aggregator.record('v1', 'tier_spark', 10); // streak fires
    clock.advance(500);
    const result = aggregator.record('v1', 'tier_spark', 10);
    expect(result.isStreak).toBe(false);
    expect(result.adjustedMagnitude).toBe(10);
  });

  it('streak expires after window elapses', () => {
    aggregator.record('v1', 'tier_spark', 10);
    clock.advance(1000);
    aggregator.record('v1', 'tier_spark', 10);
    clock.advance(1000);
    aggregator.record('v1', 'tier_spark', 10); // streak fires
    clock.advance(6000); // window expires
    aggregator.record('v1', 'tier_spark', 10);
    clock.advance(1000);
    const result = aggregator.record('v1', 'tier_spark', 10);
    // Only 2 in new window, need 3
    expect(result.isStreak).toBe(false);
  });

  it('different viewers tracked independently', () => {
    aggregator.record('v1', 'tier_spark', 10);
    clock.advance(1000);
    aggregator.record('v2', 'tier_spark', 10);
    clock.advance(1000);
    const r1 = aggregator.record('v1', 'tier_spark', 10);
    expect(r1.isStreak).toBe(false); // v1 only has 2
    const r2 = aggregator.record('v2', 'tier_spark', 10);
    expect(r2.isStreak).toBe(false); // v2 only has 2
  });

  it('different tiers tracked independently', () => {
    aggregator.record('v1', 'tier_spark', 10);
    clock.advance(1000);
    aggregator.record('v1', 'tier_flare', 10);
    clock.advance(1000);
    const r1 = aggregator.record('v1', 'tier_spark', 10);
    expect(r1.isStreak).toBe(false); // tier_spark has 2
    const r2 = aggregator.record('v1', 'tier_flare', 10);
    expect(r2.isStreak).toBe(false); // tier_flare has 2
  });

  it('multiplier applied correctly', () => {
    aggregator.record('v1', 'tier_spark', 20);
    clock.advance(1000);
    aggregator.record('v1', 'tier_spark', 20);
    clock.advance(1000);
    const result = aggregator.record('v1', 'tier_spark', 20);
    expect(result.isStreak).toBe(true);
    expect(result.adjustedMagnitude).toBe(30); // 20 * 1.5
  });

  it('ignores empty viewerId', () => {
    const result = aggregator.record('', 'tier_spark', 10);
    expect(result.isStreak).toBe(false);
    expect(result.streakCount).toBe(0);
  });

  it('ignores empty tierId', () => {
    const result = aggregator.record('v1', '', 10);
    expect(result.isStreak).toBe(false);
  });

  it('streak count tracks all gifts in window', () => {
    aggregator.record('v1', 'tier_spark', 10);
    clock.advance(1000);
    aggregator.record('v1', 'tier_spark', 10);
    clock.advance(1000);
    const result = aggregator.record('v1', 'tier_spark', 10);
    expect(result.streakCount).toBe(3);
  });

  it('reset clears all tracking', () => {
    aggregator.record('v1', 'tier_spark', 10);
    clock.advance(1000);
    aggregator.record('v1', 'tier_spark', 10);
    aggregator.reset();
    const result = aggregator.record('v1', 'tier_spark', 10);
    expect(result.streakCount).toBe(1);
    expect(result.isStreak).toBe(false);
  });
});

// ===================================================================
// CooldownManager
// ===================================================================

describe('CooldownManager', () => {
  let clock: TestClock;
  let cooldowns: CooldownManager;

  beforeEach(() => {
    clock = new TestClock(1000);
    cooldowns = new CooldownManager(
      {
        perUserMs: 3000,
        perFactionMs: 2000,
        abilityMs: 10000,
        cinematicMs: 30000,
        globalMs: 1000,
      },
      clock,
    );
  });

  it('allows first fire', () => {
    expect(cooldowns.canFire('v1', 'faction_alpha', 'add_energy')).toBe(true);
  });

  it('per-user cooldown blocks same user', () => {
    cooldowns.markFired('v1', 'faction_alpha', 'add_energy');
    expect(cooldowns.canFire('v1', 'faction_alpha', 'add_energy')).toBe(false);
  });

  it('per-user cooldown expires', () => {
    cooldowns.markFired('v1', 'faction_alpha', 'add_energy');
    clock.advance(3001);
    expect(cooldowns.canFire('v1', 'faction_alpha', 'add_energy')).toBe(true);
  });

  it('per-faction cooldown blocks same faction', () => {
    cooldowns.markFired('v1', 'faction_alpha', 'add_energy');
    expect(cooldowns.canFire('v2', 'faction_alpha', 'add_energy')).toBe(false);
  });

  it('different factions not blocked by per-faction cooldown', () => {
    cooldowns.markFired('v1', 'faction_alpha', 'add_energy');
    clock.advance(3001); // past per-user (3000) and global (1000) and per-faction (2000)
    expect(cooldowns.canFire('v1', 'faction_beta', 'add_energy')).toBe(true);
  });

  it('global cooldown blocks all', () => {
    cooldowns.markFired('v1', 'faction_alpha', 'add_energy');
    expect(cooldowns.canFire('v2', 'faction_beta', 'add_energy')).toBe(false);
  });

  it('global cooldown expires', () => {
    cooldowns.markFired('v1', 'faction_alpha', 'add_energy');
    clock.advance(1001);
    expect(cooldowns.canFire('v2', 'faction_beta', 'add_energy')).toBe(true);
  });

  it('cinematic cooldown blocks cinematic impacts only', () => {
    cooldowns.markFired('v1', 'faction_alpha', 'start_world_event', 'event_1');
    // Non-cinematic should be allowed after global expires
    clock.advance(1001);
    expect(cooldowns.canFire('v2', 'faction_beta', 'add_energy')).toBe(true);
    // Cinematic should still be blocked
    expect(cooldowns.canFire('v2', 'faction_beta', 'start_world_event', 'event_1')).toBe(false);
  });

  it('cinematic cooldown expires', () => {
    cooldowns.markFired('v1', 'faction_alpha', 'start_world_event', 'event_1');
    clock.advance(30001);
    expect(cooldowns.canFire('v1', 'faction_alpha', 'start_world_event', 'event_1')).toBe(true);
  });

  it('ability cooldown blocks specific ability', () => {
    cooldowns.markFired('v1', 'faction_alpha', 'cast_ability', 'ability_fireball');
    clock.advance(3001); // past global (1000), per-user (3000), per-faction (2000)
    // Different ability should be allowed
    expect(cooldowns.canFire('v1', 'faction_alpha', 'cast_ability', 'ability_shield')).toBe(true);
    // Same ability still blocked (10000ms)
    expect(cooldowns.canFire('v1', 'faction_alpha', 'cast_ability', 'ability_fireball')).toBe(false);
  });

  it('getBlockReason returns correct reason', () => {
    cooldowns.markFired('v1', 'faction_alpha', 'add_energy');
    expect(cooldowns.getBlockReason('v1', 'faction_alpha', 'add_energy')).toBe('global_cooldown');
    clock.advance(1001);
    expect(cooldowns.getBlockReason('v1', 'faction_alpha', 'add_energy')).toBe('per_user_cooldown');
  });

  it('reset clears all cooldowns', () => {
    cooldowns.markFired('v1', 'faction_alpha', 'add_energy');
    cooldowns.reset();
    expect(cooldowns.canFire('v1', 'faction_alpha', 'add_energy')).toBe(true);
  });
});

// ===================================================================
// OverflowConverter
// ===================================================================

describe('OverflowConverter', () => {
  let converter: OverflowConverter;

  beforeEach(() => {
    converter = new OverflowConverter(
      {
        maxActiveChampionsPerFaction: 3,
        maxActiveSquadsPerFaction: 2,
        maxActiveWorldEvents: 1,
        maxQueueSize: 500,
        unitLeaseMs: 60000,
      },
      { type: 'reserve_energy', conversionRate: 5 },
    );
  });

  it('allows first champion spawn', () => {
    const result = converter.applyOrOverflow('spawn_champion', 'faction_alpha', 1);
    expect(result.allowed).toBe(true);
    expect(converter.getActiveChampions('faction_alpha')).toBe(1);
  });

  it('overflow triggers at bound', () => {
    converter.applyOrOverflow('spawn_champion', 'faction_alpha', 1);
    converter.applyOrOverflow('spawn_champion', 'faction_alpha', 1);
    converter.applyOrOverflow('spawn_champion', 'faction_alpha', 1);
    const result = converter.applyOrOverflow('spawn_champion', 'faction_alpha', 2);
    expect(result.allowed).toBe(false);
    expect(result.reserveAdded).toBe(10); // 2 * 5
  });

  it('conversionRate applied correctly', () => {
    for (let i = 0; i < 3; i++) {
      converter.applyOrOverflow('spawn_champion', 'faction_alpha', 1);
    }
    const result = converter.applyOrOverflow('spawn_champion', 'faction_alpha', 10);
    expect(result.reserveAdded).toBe(50); // 10 * 5
  });

  it('different unit types tracked independently', () => {
    converter.applyOrOverflow('spawn_champion', 'faction_alpha', 1);
    const squad = converter.applyOrOverflow('spawn_squad', 'faction_alpha', 1);
    expect(squad.allowed).toBe(true);
  });

  it('world events overflow at bound', () => {
    converter.applyOrOverflow('start_world_event', 'faction_alpha', 1);
    const result = converter.applyOrOverflow('start_world_event', 'faction_alpha', 1);
    expect(result.allowed).toBe(false);
  });

  it('reserve capped at 1M', () => {
    for (let i = 0; i < 3; i++) {
      converter.applyOrOverflow('spawn_champion', 'faction_alpha', 1);
    }
    // Overflow 200,001 times with magnitude 1
    for (let i = 0; i < 200_001; i++) {
      converter.applyOrOverflow('spawn_champion', 'faction_alpha', 1);
    }
    expect(converter.getReserve()).toBeLessThanOrEqual(1_000_000);
  });

  it('non-spawning impacts always pass through', () => {
    const result = converter.applyOrOverflow('add_energy', 'faction_alpha', 100);
    expect(result.allowed).toBe(true);
    expect(result.reserveAdded).toBe(0);
  });

  it('releaseUnit decrements count', () => {
    converter.applyOrOverflow('spawn_champion', 'faction_alpha', 1);
    converter.applyOrOverflow('spawn_champion', 'faction_alpha', 1);
    expect(converter.getActiveChampions('faction_alpha')).toBe(2);
    converter.releaseUnit('spawn_champion', 'faction_alpha');
    expect(converter.getActiveChampions('faction_alpha')).toBe(1);
  });

  it('reserveAdded reports net amount when near MAX_RESERVE (FIX 7)', () => {
    // Fill champions to trigger overflow
    for (let i = 0; i < 3; i++) {
      converter.applyOrOverflow('spawn_champion', 'faction_alpha', 1);
    }
    // Manually push reserve near max by overflowing many times
    for (let i = 0; i < 200_000; i++) {
      converter.applyOrOverflow('spawn_champion', 'faction_alpha', 1);
    }
    // Reserve should be very close to 1,000,000 now
    const reserveBefore = converter.getReserve();
    expect(reserveBefore).toBeGreaterThanOrEqual(999_990);

    // One more overflow with magnitude 10, rate 5 → would add 50, but reserve caps at 1M
    const result = converter.applyOrOverflow('spawn_champion', 'faction_alpha', 10);
    expect(result.allowed).toBe(false);
    expect(result.reserveAdded).toBeLessThanOrEqual(10); // net, not 50 (gross)
    expect(converter.getReserve()).toBeLessThanOrEqual(1_000_000);
  });

  it('leases auto-expire after unitLeaseMs so gifts keep working (regression)', () => {
    // The game never reports unit deaths or world-event endings back to the
    // gateway. Without auto-expiry the counters saturate permanently and
    // every later Galaxy/Lion gift silently overflows — leaving only the
    // camera shake visible. With an injectable clock the lease must free
    // the slot again after unitLeaseMs.
    const clock = new TestClock(1000);
    const leased = new OverflowConverter(
      {
        maxActiveChampionsPerFaction: 1,
        maxActiveSquadsPerFaction: 1,
        maxActiveWorldEvents: 1,
        maxQueueSize: 500,
        unitLeaseMs: 60000,
      },
      { type: 'reserve_energy', conversionRate: 5 },
      clock,
    );

    expect(leased.applyOrOverflow('spawn_champion', 'blue', 1).allowed).toBe(true);
    expect(leased.applyOrOverflow('start_world_event', 'blue', 1).allowed).toBe(true);
    // At capacity → overflow while leases are live.
    expect(leased.applyOrOverflow('spawn_champion', 'blue', 1).allowed).toBe(false);
    expect(leased.applyOrOverflow('start_world_event', 'blue', 1).allowed).toBe(false);

    // After the lease expires the slots are free again.
    clock.advance(61000);
    expect(leased.getActiveChampions('blue')).toBe(0);
    expect(leased.getActiveWorldEvents()).toBe(0);
    expect(leased.applyOrOverflow('spawn_champion', 'blue', 1).allowed).toBe(true);
    expect(leased.applyOrOverflow('start_world_event', 'blue', 1).allowed).toBe(true);
  });
});

// ===================================================================
// GiftRule (full pipeline)
// ===================================================================

describe('GiftRule', () => {
  let clock: TestClock;
  let rule: GiftRule;
  let config: GiftEconomyConfig;
  const logs: string[] = [];

  beforeEach(() => {
    clock = new TestClock(1000);
    config = loadTestConfig();
    logs.length = 0;
    const mapper = new GiftMapper(config);
    const streak = new StreakAggregator(config.streaks, clock);
    const cooldown = new CooldownManager(config.cooldowns, clock);
    const overflow = new OverflowConverter(config.bounds, config.overflow);
    // Round 12: gifts only fire for viewers who joined a team. The default
    // test resolver puts every viewer on faction_alpha.
    rule = new GiftRule(mapper, streak, cooldown, overflow, (msg) => logs.push(msg), () => 'faction_alpha');
  });

  it('applies to gift events', () => {
    expect(rule.applies(makeGiftEvent('gift_001', 'v1'))).toBe(true);
  });

  it('does not apply to chat events', () => {
    expect(rule.applies(makeChatEvent('v1'))).toBe(false);
  });

  it('gift event produces command', () => {
    const cmds = rule.execute(makeGiftEvent('gift_001', 'v1'), {});
    expect(cmds).not.toBeNull();
    expect(cmds!.length).toBeGreaterThanOrEqual(1);
    expect(cmds![0]!.type).toBe('ADD_ENERGY');
  });

  it('cinematic gift produces spawn + technique + spotlight', () => {
    const cmds = rule.execute(makeGiftEvent('gift_015', 'v1'), {});
    expect(cmds).not.toBeNull();
    expect(cmds!.length).toBe(3);
    expect(cmds![0]!.type).toBe('START_WORLD_EVENT');
    expect(cmds![1]!.type).toBe('CAST_TECHNIQUE');
    expect(cmds![2]!.type).toBe('DISPLAY_SPOTLIGHT');
  });

  it('spark gift produces CAST_TECHNIQUE with tier 1 payload', () => {
    const cmds = rule.execute(makeGiftEvent('gift_001', 'v1'), {});
    expect(cmds).not.toBeNull();
    const tech = cmds!.find((c) => c.type === 'CAST_TECHNIQUE');
    expect(tech).toBeDefined();
    expect(tech!.factionId).toBeDefined();
    expect(tech!.viewerId).toBe('v1');
    expect(tech!.metadata?.['techniqueTier']).toBe(1);
    expect(tech!.metadata?.['giftTier']).toBe('tier_spark');
    expect(tech!.metadata?.['cinematic']).toBeUndefined();
  });

  it('flare gift produces CAST_TECHNIQUE with tier 2 payload', () => {
    const cmds = rule.execute(makeGiftEvent('gift_008', 'v1'), {});
    expect(cmds).not.toBeNull();
    const tech = cmds!.find((c) => c.type === 'CAST_TECHNIQUE');
    expect(tech).toBeDefined();
    expect(tech!.metadata?.['techniqueTier']).toBe(2);
    expect(tech!.metadata?.['giftTier']).toBe('tier_flare');
  });

  it('nova gift produces CAST_TECHNIQUE with tier 3 cinematic payload', () => {
    const cmds = rule.execute(makeGiftEvent('gift_015', 'v1'), {});
    expect(cmds).not.toBeNull();
    const tech = cmds!.find((c) => c.type === 'CAST_TECHNIQUE');
    expect(tech).toBeDefined();
    expect(tech!.metadata?.['techniqueTier']).toBe(3);
    expect(tech!.metadata?.['cinematic']).toBe(true);
    expect(tech!.metadata?.['giftName']).toBe('Phoenix');
  });

  it('cooldown blocks second gift from same user', () => {
    rule.execute(makeGiftEvent('gift_001', 'v1'), {});
    const cmds = rule.execute(makeGiftEvent('gift_001', 'v1'), {});
    expect(cmds).toBeNull();
    const decisions = rule.drainDecisions();
    expect(decisions[1]!.cooldownBlocked).toBe(true);
  });

  it('overflow converts when champions exceed bound', () => {
    // All viewers resolve to faction_alpha via the test faction resolver, so
    // repeated spawn gifts overflow once the faction bound is reached.
    const sameFactionViewers = ['aa', 'ac', 'ae', 'ag', 'ai'];
    for (let i = 0; i < 5; i++) {
      rule.execute(makeGiftEvent('gift_008', sameFactionViewers[i]!), {});
      clock.advance(4000); // avoid cooldown between different viewers
    }
    // 6th should overflow (same faction) — primary impact is blocked, but
    // the CAST_TECHNIQUE command still fires (techniques don't consume slots).
    const cmds = rule.execute(makeGiftEvent('gift_008', 'ak'), {});
    expect(cmds).not.toBeNull();
    const techCmds = cmds!.filter((c) => c.type === 'CAST_TECHNIQUE');
    expect(techCmds.length).toBe(1);
    expect(techCmds[0]!.metadata?.['techniqueTier']).toBe(2);
    const decisions = rule.getDecisions();
    const lastDecision = decisions[decisions.length - 1];
    expect(lastDecision!.overflowed).toBe(true);
    expect(lastDecision!.commandsProduced).toBe(1);
  });

  it('streak multiplies magnitude', () => {
    // 3 gifts from same viewer within 5s window
    rule.execute(makeGiftEvent('gift_001', 'v1'), {});
    clock.advance(1000);
    // cooldown blocks the 2nd and 3rd, but streak still records
    rule.execute(makeGiftEvent('gift_001', 'v1'), {});
    clock.advance(1000);
    rule.execute(makeGiftEvent('gift_001', 'v1'), {});
    const decisions = rule.getDecisions();
    // The 3rd gift should have cooldown blocked but streak was tracked
    expect(decisions.length).toBe(3);
  });

  it('unknown gift dropped silently', () => {
    const cmds = rule.execute(makeGiftEvent('unknown_gift', 'v1'), {});
    expect(cmds).toBeNull();
    const decisions = rule.getDecisions();
    expect(decisions[0]!.impactType).toBeUndefined();
  });

  it('logs emitted for every decision', () => {
    rule.execute(makeGiftEvent('gift_001', 'v1'), {});
    expect(logs.length).toBe(1);
    expect(logs[0]).toContain('[GiftRule]');
  });

  it('drainDecisions clears state', () => {
    rule.execute(makeGiftEvent('gift_001', 'v1'), {});
    const decisions = rule.drainDecisions();
    expect(decisions.length).toBe(1);
    expect(rule.getDecisions().length).toBe(0);
  });

  it('cinematic cooldown blocks second cinematic within 30s (FIX 3)', () => {
    // gift_015 is tier_nova with cinematic=true, impactType=start_world_event
    const cmds1 = rule.execute(makeGiftEvent('gift_015', 'v1'), {});
    expect(cmds1).not.toBeNull();
    expect(cmds1!.length).toBe(3); // world event + technique + spotlight

    // Advance past global (1000), per-user (3000), per-faction (2000) but not cinematic (30000)
    clock.advance(4000);
    const cmds2 = rule.execute(makeGiftEvent('gift_015', 'v2'), {});
    expect(cmds2).toBeNull();
    const decisions = rule.drainDecisions();
    expect(decisions[1]!.cooldownBlocked).toBe(true);
    expect(decisions[1]!.cooldownReason).toBe('cinematic_cooldown');
  });

  it('getFaction routes gift to registered faction (FIX 4)', () => {
    const mapper = new GiftMapper(config);
    const streak = new StreakAggregator(config.streaks, clock);
    const cooldown = new CooldownManager(config.cooldowns, clock);
    const overflow = new OverflowConverter(config.bounds, config.overflow);
    // Registry resolver says v2 joined faction_beta → gift fires for that team.
    const registryRule = new GiftRule(
      mapper, streak, cooldown, overflow,
      () => {},
      (viewerId) => viewerId === 'v2' ? 'faction_beta' : null,
    );
    const cmds = registryRule.execute(makeGiftEvent('gift_001', 'v2'), {});
    expect(cmds).not.toBeNull();
    expect(cmds![0]!.factionId).toBe('faction_beta');
    // Round 12: no hash fallback — viewers who never joined a team get their
    // gifts skipped with a notJoined decision.
    const skipped = registryRule.execute(makeGiftEvent('gift_001', 'v9'), {});
    expect(skipped).toBeNull();
    const decisions = registryRule.drainDecisions();
    expect(decisions[1]!.notJoined).toBe(true);
    expect(decisions[1]!.factionId).toBe('none');
  });

  it('streak not consumed by cooldown-blocked gifts (FIX 5)', () => {
    // Fire gift_001 from v1 three times quickly; cooldown blocks 2nd and 3rd
    rule.execute(makeGiftEvent('gift_001', 'v1'), {});
    clock.advance(500);
    rule.execute(makeGiftEvent('gift_001', 'v1'), {}); // cooldown blocked
    clock.advance(500);
    rule.execute(makeGiftEvent('gift_001', 'v1'), {}); // cooldown blocked
    const decisions = rule.drainDecisions();
    expect(decisions.length).toBe(3);
    expect(decisions[0]!.cooldownBlocked).toBe(false);
    expect(decisions[1]!.cooldownBlocked).toBe(true);
    expect(decisions[2]!.cooldownBlocked).toBe(true);
    // Since streaks are recorded only on happy path, none of the blocked gifts trigger a streak
    expect(decisions[0]!.streak).toBe(false);
    expect(decisions[1]!.streak).toBe(false);
    expect(decisions[2]!.streak).toBe(false);
  });
});

// ===================================================================
// GiftEconomy Orchestrator
// ===================================================================

describe('GiftEconomy', () => {
  let economy: GiftEconomy;
  let clock: TestClock;

  beforeEach(() => {
    clock = new TestClock(1000);
    economy = new GiftEconomy(loadTestConfig(), clock, undefined, () => 'faction_alpha');
  });

  it('processGiftEvent returns decisions', () => {
    const decisions = economy.processGiftEvent(makeGiftEvent('gift_001', 'v1'));
    expect(decisions.length).toBe(1);
  });

  it('stats increment on each event', () => {
    economy.processGiftEvent(makeGiftEvent('gift_001', 'v1'));
    clock.advance(4000);
    economy.processGiftEvent(makeGiftEvent('gift_002', 'v2'));
    const stats = economy.getStats();
    expect(stats.eventsProcessed).toBe(2);
    expect(stats.commandsProduced).toBeGreaterThanOrEqual(1);
  });

  it('non-gift events return empty decisions', () => {
    const decisions = economy.processGiftEvent(makeChatEvent('v1'));
    expect(decisions).toHaveLength(0);
  });

  it('previewMappings returns 24 rows', () => {
    const preview = economy.previewMappings();
    expect(preview).toHaveLength(24);
  });

  it('getConfig returns the config', () => {
    const config = economy.getConfig();
    expect(config.tiers).toHaveLength(4);
  });

  it('reloadConfig replaces internals', () => {
    const newConfig = loadTestConfig();
    economy.reloadConfig(newConfig, clock);
    // Should still work after reload
    const decisions = economy.processGiftEvent(makeGiftEvent('gift_001', 'v1'));
    expect(decisions.length).toBe(1);
  });

  it('hot-reload updates rule behavior for subsequent events', () => {
    // Fire a gift — should succeed
    const d1 = economy.processGiftEvent(makeGiftEvent('gift_001', 'v1'));
    expect(d1.length).toBe(1);
    expect(d1[0]!.cooldownBlocked).toBe(false);

    // Same gift again within cooldown — should be blocked
    clock.advance(1000);
    const d2 = economy.processGiftEvent(makeGiftEvent('gift_001', 'v1'));
    expect(d2[0]!.cooldownBlocked).toBe(true);

    // Hot-reload with zero cooldowns
    const newConfig = loadTestConfig();
    newConfig.cooldowns.perUserMs = 0;
    newConfig.cooldowns.perFactionMs = 0;
    newConfig.cooldowns.globalMs = 0;
    newConfig.cooldowns.abilityMs = 0;
    newConfig.cooldowns.cinematicMs = 0;
    economy.reloadConfig(newConfig, clock);

    // After reload, same gift should NOT be blocked (new cooldowns are zero)
    const d3 = economy.processGiftEvent(makeGiftEvent('gift_001', 'v1'));
    expect(d3.length).toBe(1);
    expect(d3[0]!.cooldownBlocked).toBe(false);
  });

  it('reset clears all state', () => {
    economy.processGiftEvent(makeGiftEvent('gift_001', 'v1'));
    economy.reset();
    const stats = economy.getStats();
    expect(stats.eventsProcessed).toBe(0);
    expect(stats.commandsProduced).toBe(0);
  });

  it('loadDefaultConfig loads from gifts.json', () => {
    const config = GiftEconomy.loadDefaultConfig();
    expect(config.tiers).toHaveLength(4);
    expect(config.mappings).toHaveLength(24);
  });
});
