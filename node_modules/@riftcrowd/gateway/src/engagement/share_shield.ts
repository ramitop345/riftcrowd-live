/**
 * Phase 12 — Share Shield Activator.
 *
 * When a viewer shares (event.type === 'share'), applies a shield to the faction.
 * Per-viewer cooldown + per-faction bound.
 */

import {
  COMMAND_SCHEMA_VERSION,
  type GameCommand,
  type NormalizedLiveEvent,
} from '@riftcrowd/shared';
import { randomUUID } from 'node:crypto';
import type { ShareShieldConfig } from './free_engagement_config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShareShieldDecision {
  eventId: string;
  viewerId: string;
  factionId: string;
  cooldownBlocked: boolean;
  boundBlocked: boolean;
  magnitude: number;
  command: GameCommand | null;
  log: string;
}

// ---------------------------------------------------------------------------
// ShareShield class
// ---------------------------------------------------------------------------

export class ShareShield {
  private readonly config: ShareShieldConfig;
  private readonly cooldowns = new Map<string, number>();
  private readonly activePerFaction = new Map<string, number>();
  private readonly logFn: (msg: string) => void;
  private readonly getFaction: (viewerId: string) => string | null;
  private readonly bounds: number;

  constructor(
    config: ShareShieldConfig,
    bounds: number,
    logFn?: (msg: string) => void,
    getFaction?: (viewerId: string) => string | null,
  ) {
    this.config = config;
    this.bounds = bounds;
    this.logFn = logFn ?? (() => {});
    this.getFaction = getFaction ?? (() => null);
  }

  /**
   * Processes a share event. Returns a decision if shield can be applied.
   */
  processShare(event: NormalizedLiveEvent, nowMs: number): ShareShieldDecision {
    const viewerId = event.user.id;
    const factionId = this.getFaction(viewerId) ?? this.fallbackFaction(viewerId);

    if (!this.config.enabled) {
      return {
        eventId: event.id,
        viewerId,
        factionId,
        cooldownBlocked: false,
        boundBlocked: false,
        magnitude: 0,
        command: null,
        log: `Share shield disabled`,
      };
    }

    // Check per-viewer cooldown
    const lastFired = this.cooldowns.get(viewerId);
    if (lastFired !== undefined && nowMs - lastFired < this.config.cooldownMs) {
      const log = `Share from ${viewerId} → cooldown active, skipping`;
      this.logFn(`[ShareShield] ${log}`);
      return {
        eventId: event.id,
        viewerId,
        factionId,
        cooldownBlocked: true,
        boundBlocked: false,
        magnitude: 0,
        command: null,
        log,
      };
    }

    // Check per-faction bound
    const active = this.activePerFaction.get(factionId) ?? 0;
    if (active >= this.bounds) {
      const log = `Share from ${viewerId} → faction ${factionId} at max shields (${this.bounds}), skipping`;
      this.logFn(`[ShareShield] ${log}`);
      return {
        eventId: event.id,
        viewerId,
        factionId,
        cooldownBlocked: false,
        boundBlocked: true,
        magnitude: 0,
        command: null,
        log,
      };
    }

    // Apply shield
    this.cooldowns.set(viewerId, nowMs);
    this.activePerFaction.set(factionId, active + 1);

    const command: GameCommand = {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      id: `cmd_${randomUUID()}`,
      type: 'SHARE_SHIELD',
      createdAt: new Date().toISOString(),
      factionId,
      viewerId,
      displayName: event.user.displayName,
      amount: this.config.magnitude,
      sourceEventIds: [event.id],
      expiresAt: new Date(nowMs + this.config.durationMs).toISOString(),
      metadata: {
        duration: this.config.durationMs,
      },
    };

    const log = `Share from ${viewerId} → shield +${this.config.magnitude} for ${factionId} (${this.config.durationMs}ms)`;
    this.logFn(`[ShareShield] ${log}`);

    return {
      eventId: event.id,
      viewerId,
      factionId,
      cooldownBlocked: false,
      boundBlocked: false,
      magnitude: this.config.magnitude,
      command,
      log,
    };
  }

  /** Releases a shield from the active count (called when duration expires). */
  releaseShield(factionId: string): void {
    const active = this.activePerFaction.get(factionId) ?? 0;
    if (active > 0) {
      this.activePerFaction.set(factionId, active - 1);
    }
  }

  /** Returns active shield count for a faction. */
  getActiveCount(factionId: string): number {
    return this.activePerFaction.get(factionId) ?? 0;
  }

  /** Resets all state for a new round. */
  reset(): void {
    this.cooldowns.clear();
    this.activePerFaction.clear();
  }

  /** Hash-based fallback faction assignment. */
  private fallbackFaction(viewerId: string): string {
    const hash = viewerId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return hash % 2 === 0 ? 'faction_alpha' : 'faction_beta';
  }
}
