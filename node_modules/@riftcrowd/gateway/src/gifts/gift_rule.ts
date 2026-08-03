/**
 * Phase 11 — GiftRule.
 *
 * Implements the pipeline's Rule interface. On gift event:
 *   mapper → streak aggregator → cooldown check → overflow converter → produce GameCommand(s).
 *
 * Logs every decision at info level (transparent logs).
 * Registers itself via registerRule() on startup.
 */

import {
  COMMAND_SCHEMA_VERSION,
  type GameCommand,
  type GameCommandType,
  type NormalizedLiveEvent,
} from '@riftcrowd/shared';
import { randomUUID } from 'node:crypto';
import type { Rule, RuleContext } from '../pipeline/command_rules.js';
import type { GiftMapper } from './gift_mapper.js';
import type { StreakAggregator } from './streak_aggregator.js';
import type { CooldownManager } from './cooldown_manager.js';
import type { OverflowConverter } from './overflow_converter.js';
import type { GiftImpactType } from './gift_config.js';

// ---------------------------------------------------------------------------
// GiftDecision — logged outcome
// ---------------------------------------------------------------------------

export interface GiftDecision {
  eventId: string;
  viewerId: string;
  factionId: string;
  giftId: string;
  tierId?: string;
  tierName?: string;
  impactType?: GiftImpactType;
  magnitude?: number;
  streak: boolean;
  cooldownBlocked: boolean;
  cooldownReason?: string;
  overflowed: boolean;
  reserveAdded: number;
  commandsProduced: number;
  log: string;
}

// ---------------------------------------------------------------------------
// Map GiftImpactType to GameCommandType
// ---------------------------------------------------------------------------

function impactToCommandType(impactType: GiftImpactType): GameCommandType {
  switch (impactType) {
    case 'spawn_champion':
      return 'SPAWN_CHAMPION';
    case 'add_energy':
      return 'ADD_ENERGY';
    case 'add_shield':
      return 'ADD_SHIELD';
    case 'spawn_squad':
      return 'SPAWN_SQUAD';
    case 'cast_ability':
      return 'CAST_ABILITY';
    case 'start_world_event':
      return 'START_WORLD_EVENT';
    case 'display_spotlight':
      return 'DISPLAY_SPOTLIGHT';
    case 'trigger_technique':
      return 'CAST_TECHNIQUE';
  }
}

// ---------------------------------------------------------------------------
// GiftRule class
// ---------------------------------------------------------------------------

export class GiftRule implements Rule {
  readonly name = 'GiftRule';

  private readonly mapper: GiftMapper;
  private readonly streakAggregator: StreakAggregator;
  private readonly cooldownManager: CooldownManager;
  private readonly overflowConverter: OverflowConverter;
  private readonly decisions: GiftDecision[] = [];

  /** Logger callback — injected for testability. */
  private readonly logFn: (msg: string) => void;

  /** Faction resolver — injected from ViewerRegistry; falls back to hash. */
  private readonly getFaction: (viewerId: string) => string | null;

  constructor(
    mapper: GiftMapper,
    streakAggregator: StreakAggregator,
    cooldownManager: CooldownManager,
    overflowConverter: OverflowConverter,
    logFn?: (msg: string) => void,
    getFaction?: (viewerId: string) => string | null,
  ) {
    this.mapper = mapper;
    this.streakAggregator = streakAggregator;
    this.cooldownManager = cooldownManager;
    this.overflowConverter = overflowConverter;
    this.logFn = logFn ?? (() => {});
    this.getFaction = getFaction ?? (() => null);
  }

  applies(event: NormalizedLiveEvent): boolean {
    return event.type === 'gift' && event.gift !== undefined;
  }

  /** Hash-based fallback faction assignment when no registry lookup is available. */
  private fallbackFaction(viewerId: string): string {
    const viewerHash = viewerId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return viewerHash % 2 === 0 ? 'faction_alpha' : 'faction_beta';
  }

  execute(event: NormalizedLiveEvent, _context: RuleContext): GameCommand[] | null {
    const gift = event.gift!;
    const viewerId = event.user.id;
    // Resolve faction: registry lookup first, hash fallback
    const factionId = this.getFaction(viewerId) ?? this.fallbackFaction(viewerId);
    const giftId = gift.id;
    const count = gift.repeatCount;

    // 1. Map gift to impact
    const impact = this.mapper.resolve(giftId, count);
    if (!impact) {
      const warnings = this.mapper.drainWarnings();
      const log = `${giftId} from ${viewerId} → unmapped (${warnings.join('; ') || 'unknown'})`;
      this.logFn(`[GiftRule] ${log}`);
      this.decisions.push({
        eventId: event.id,
        viewerId,
        factionId,
        giftId,
        streak: false,
        cooldownBlocked: false,
        overflowed: false,
        reserveAdded: 0,
        commandsProduced: 0,
        log,
      });
      return null;
    }

    // 2. Derive cinematic/ability impactId for cooldown tracking
    const impactId = impact.cinematic ? impact.tierId : undefined;

    // 3. Check cooldown (BEFORE streak recording — FIX 5)
    const canFire = this.cooldownManager.canFire(viewerId, factionId, impact.impactType, impactId);
    if (!canFire) {
      const reason = this.cooldownManager.getBlockReason(viewerId, factionId, impact.impactType, impactId);
      const log = `${giftId} from ${viewerId} → ${impact.tierId} → ${impact.impactType} magnitude=${impact.magnitude} → cooldown active (${reason}), skipping`;
      this.logFn(`[GiftRule] ${log}`);
      this.decisions.push({
        eventId: event.id,
        viewerId,
        factionId,
        giftId,
        tierId: impact.tierId,
        tierName: impact.tierName,
        impactType: impact.impactType,
        magnitude: impact.magnitude,
        streak: false,
        cooldownBlocked: true,
        cooldownReason: reason ?? undefined,
        overflowed: false,
        reserveAdded: 0,
        commandsProduced: 0,
        log,
      });
      return null;
    }

    // 4. Overflow check (BEFORE streak recording — FIX 5)
    const overflowResult = this.overflowConverter.applyOrOverflow(
      impact.impactType,
      factionId,
      impact.magnitude,
    );

    if (!overflowResult.allowed) {
      const log = `${giftId} from ${viewerId} → ${impact.tierId} → ${impact.impactType} magnitude=${impact.magnitude} → overflow, +${overflowResult.reserveAdded} ${overflowResult.reserveType}`;
      this.logFn(`[GiftRule] ${log}`);
      this.decisions.push({
        eventId: event.id,
        viewerId,
        factionId,
        giftId,
        tierId: impact.tierId,
        tierName: impact.tierName,
        impactType: impact.impactType,
        magnitude: impact.magnitude,
        streak: false,
        cooldownBlocked: false,
        overflowed: true,
        reserveAdded: overflowResult.reserveAdded,
        commandsProduced: 0,
        log,
      });
      return null;
    }

    // 5. Record streak (only on happy path — FIX 5)
    const streakResult = this.streakAggregator.record(viewerId, impact.tierId, impact.magnitude);
    const finalMagnitude = streakResult.adjustedMagnitude;

    // 6. Mark cooldown
    this.cooldownManager.markFired(viewerId, factionId, impact.impactType, impactId);

    // 7. Produce command(s)
    const commands: GameCommand[] = [];
    const cmdType = impactToCommandType(impact.impactType);

    commands.push({
      schemaVersion: COMMAND_SCHEMA_VERSION,
      id: `cmd_${randomUUID()}`,
      type: cmdType,
      createdAt: new Date().toISOString(),
      factionId,
      viewerId,
      displayName: impact.displayName,
      amount: finalMagnitude,
      sourceEventIds: [event.id],
      metadata: {
        giftTier: impact.tierId,
        giftTierName: impact.tierName,
        streak: streakResult.isStreak,
        ...(impact.duration !== undefined ? { duration: impact.duration } : {}),
        ...(impact.cinematic !== undefined ? { cinematic: impact.cinematic } : {}),
      },
    });

    // Gift tiers with a technique block also produce CAST_TECHNIQUE
    if (impact.techniqueTier !== undefined) {
      commands.push({
        schemaVersion: COMMAND_SCHEMA_VERSION,
        id: `cmd_${randomUUID()}`,
        type: 'CAST_TECHNIQUE',
        createdAt: new Date().toISOString(),
        factionId,
        viewerId,
        displayName: impact.displayName,
        sourceEventIds: [event.id],
        metadata: {
          giftTier: impact.tierId,
          giftName: impact.displayName ?? giftId,
          techniqueTier: impact.techniqueTier,
          ...(impact.techniqueCinematic !== undefined ? { cinematic: impact.techniqueCinematic } : {}),
        },
      });
    }

    // Cinematic impacts also produce DISPLAY_SPOTLIGHT
    if (impact.cinematic) {
      commands.push({
        schemaVersion: COMMAND_SCHEMA_VERSION,
        id: `cmd_${randomUUID()}`,
        type: 'DISPLAY_SPOTLIGHT',
        createdAt: new Date().toISOString(),
        factionId,
        viewerId,
        displayName: impact.displayName,
        sourceEventIds: [event.id],
        metadata: {
          giftTier: impact.tierId,
          cinematic: true,
        },
      });
    }

    const streakLabel = streakResult.isStreak ? ` [STREAK ×${this.streakAggregator.getMultiplier()}]` : '';
    const log = `${giftId} from ${viewerId} → ${impact.tierId} → ${impact.impactType} magnitude=${finalMagnitude}${streakLabel} → ${commands.length} command(s)`;
    this.logFn(`[GiftRule] ${log}`);

    this.decisions.push({
      eventId: event.id,
      viewerId,
      factionId,
      giftId,
      tierId: impact.tierId,
      tierName: impact.tierName,
      impactType: impact.impactType,
      magnitude: finalMagnitude,
      streak: streakResult.isStreak,
      cooldownBlocked: false,
      overflowed: false,
      reserveAdded: 0,
      commandsProduced: commands.length,
      log,
    });

    return commands;
  }

  /** Returns all decisions made (for stats and testing). */
  getDecisions(): readonly GiftDecision[] {
    return this.decisions;
  }

  /** Returns and clears decisions. */
  drainDecisions(): GiftDecision[] {
    const d = [...this.decisions];
    this.decisions.length = 0;
    return d;
  }
}
