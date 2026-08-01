/**
 * Phase 15 — VFX Orchestrator.
 *
 * Facade wiring VFX pool + config + command emission.
 * Decides which VFX to trigger based on event type, respects quality level,
 * motion reduction, and color-blind mode. Sanitizes all text before emitting.
 */

import type { NormalizedLiveEvent } from '@riftcrowd/shared';
import {
  COMMAND_SCHEMA_VERSION,
  type GameCommand,
  type GameCommandType,
} from '@riftcrowd/shared';
import { VFXPool, type VFXParams, type VFXInstance, type VFXPoolStats } from './vfx_pool.js';
import type { VFXConfig } from './vfx_config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VFXCommandResult {
  commands: GameCommand[];
  vfxAcquired: VFXInstance | null;
  dropped: boolean;
}

// ---------------------------------------------------------------------------
// Text sanitization
// ---------------------------------------------------------------------------

/** Strip HTML tags, control characters, and known XSS vectors. */
export function sanitizeText(input: string, maxLen: number = 128): string {
  return input
    .replace(/<[^>]*>/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F\u200B-\u200F\u202A-\u202E\uFEFF]/g, '')
    .replace(/[<>&"'`]/g, '')
    .slice(0, maxLen);
}

// ---------------------------------------------------------------------------
// VFXOrchestrator
// ---------------------------------------------------------------------------

export class VFXOrchestrator {
  private pool: VFXPool;
  private config: VFXConfig;
  private commands: GameCommand[] = [];
  private cmdCounter = 0;
  /** Rolling average processing time in ms (exponential moving average). */
  private rollingAvgMs = 0;
  private readonly ALPHA = 0.1;
  /** Whether quality has been downgraded due to frame-rate budget overrun. */
  private qualityDowngraded = false;

  constructor(config: VFXConfig) {
    this.config = config;
    this.pool = new VFXPool(config);
  }

  /** Main entry: decide which VFX to trigger based on event type. */
  triggerVFX(event: NormalizedLiveEvent): VFXCommandResult {
    const t0 = performance.now();

    // Frame-rate budget enforcement: drop low-priority events when over budget
    if (this.rollingAvgMs > 0 && this.config.frameRateBudget > 0) {
      const budgetMs = 1000 / this.config.frameRateBudget;
      if (this.rollingAvgMs > budgetMs) {
        this.qualityDowngraded = true;
        // Drop lower-priority events (chat, like) under budget pressure
        if (event.type === 'chat' || event.type === 'like') {
          this.updateRollingAvg(performance.now() - t0);
          return { commands: [], vfxAcquired: null, dropped: true };
        }
      } else {
        this.qualityDowngraded = false;
      }
    }

    let result: VFXCommandResult;
    switch (event.type) {
      case 'chat':
        result = this.handleChat(event);
        break;
      case 'like':
        result = this.handleLike(event);
        break;
      case 'follow':
        result = this.handleFollow(event);
        break;
      case 'share':
        result = this.handleShare(event);
        break;
      case 'gift':
        result = this.handleGift(event);
        break;
      case 'subscribe':
        result = this.handleSubscription(event);
        break;
      default:
        result = { commands: [], vfxAcquired: null, dropped: false };
    }

    // Push commands into internal buffer for drainCommands()
    if (result.commands.length > 0) {
      this.commands.push(...result.commands);
    }

    this.updateRollingAvg(performance.now() - t0);
    return result;
  }

  /** Update exponential moving average of processing time. */
  private updateRollingAvg(elapsedMs: number): void {
    this.rollingAvgMs = this.ALPHA * elapsedMs + (1 - this.ALPHA) * this.rollingAvgMs;
  }

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  private handleChat(event: NormalizedLiveEvent): VFXCommandResult {
    // Chat → no VFX unless it's an !ability command
    const comment = event.comment ?? '';
    if (comment.toLowerCase().startsWith('!ability')) {
      return this.emitAbilitySequence(event);
    }
    return { commands: [], vfxAcquired: null, dropped: false };
  }

  private handleLike(event: NormalizedLiveEvent): VFXCommandResult {
    const qualityMultiplier = this.getQualityMultiplier();
    const particleCount = Math.max(1, Math.floor(10 * qualityMultiplier));

    const params: VFXParams = {
      x: 0,
      y: 0,
      duration: 1000,
      color: '#FFD700',
      intensity: 0.5,
      particleCount,
    };

    if (this.config.colorBlindMode) {
      params.pattern = 'dots';
    }

    const instance = this.pool.acquire('particle', params);
    if (!instance) {
      return { commands: [], vfxAcquired: null, dropped: true };
    }

    const cmds = [
      this.makeCommand('SPAWN_VFX', event, {
        vfxType: 'particle',
        particleCount,
        color: '#FFD700',
        intensity: 0.5,
      }),
    ];

    return { commands: cmds, vfxAcquired: instance, dropped: false };
  }

  private handleFollow(event: NormalizedLiveEvent): VFXCommandResult {
    const overlayParams: VFXParams = {
      duration: 3000,
      color: '#4488FF',
      intensity: 0.8,
    };

    if (this.config.colorBlindMode) {
      overlayParams.pattern = 'stripes';
    }

    const overlayInstance = this.pool.acquire('overlay', overlayParams);
    if (!overlayInstance) {
      return { commands: [], vfxAcquired: null, dropped: true };
    }

    const displayName = sanitizeText(event.user.displayName, 64);
    const cmds = [
      this.makeCommand('SPAWN_VFX', event, {
        vfxType: 'overlay',
        color: '#4488FF',
        duration: 3000,
      }),
      this.makeCommand('SPOTLIGHT_CARD', event, {
        viewerName: displayName,
        message: sanitizeText('New follower!', 200),
      }),
    ];

    return { commands: cmds, vfxAcquired: overlayInstance, dropped: false };
  }

  private handleShare(event: NormalizedLiveEvent): VFXCommandResult {
    const trailDuration = this.config.motionReduction ? 1000 : 2000;
    const trailParams: VFXParams = {
      duration: trailDuration,
      color: '#44FF88',
      intensity: 0.7,
    };

    if (this.config.colorBlindMode) {
      trailParams.pattern = 'zigzag';
    }

    const trailInstance = this.pool.acquire('trail', trailParams);
    if (!trailInstance) {
      return { commands: [], vfxAcquired: null, dropped: true };
    }

    const displayName = sanitizeText(event.user.displayName, 64);
    const cmds = [
      this.makeCommand('SPAWN_VFX', event, {
        vfxType: 'trail',
        color: '#44FF88',
        duration: trailDuration,
      }),
      this.makeCommand('SUPPORTER_CALLOUT', event, {
        viewerName: displayName,
        tier: 'supporter',
      }),
    ];

    return { commands: cmds, vfxAcquired: trailInstance, dropped: false };
  }

  private handleGift(event: NormalizedLiveEvent): VFXCommandResult {
    const cmds: GameCommand[] = [];
    let primaryInstance: VFXInstance | null = null;

    // Hit flash
    const flashParams: VFXParams = {
      duration: 500,
      color: '#FF4444',
      intensity: 1.0,
    };
    if (this.config.colorBlindMode) {
      flashParams.pattern = 'crosshatch';
    }

    const flashInstance = this.pool.acquire('flash', flashParams);
    if (flashInstance) {
      primaryInstance = flashInstance;
      cmds.push(
        this.makeCommand('SPAWN_VFX', event, {
          vfxType: 'flash',
          color: '#FF4444',
          intensity: 1.0,
        }),
      );
    }

    // Camera impulse (disabled if motion reduction)
    if (!this.config.motionReduction) {
      cmds.push(
        this.makeCommand('CAMERA_IMPULSE', event, {
          intensity: 0.8,
          duration: 300,
        }),
      );
    }

    // If cinematic (gift with high value), add ability sequence
    const gift = event.gift;
    if (gift && gift.repeatCount >= 100) {
      const abilityCmds = this.emitAbilitySequence(event);
      cmds.push(...abilityCmds.commands);
    }

    return {
      commands: cmds,
      vfxAcquired: primaryInstance,
      dropped: !flashInstance,
    };
  }

  private handleSubscription(event: NormalizedLiveEvent): VFXCommandResult {
    const cmds: GameCommand[] = [];
    let primaryInstance: VFXInstance | null = null;

    // Faction overlay
    const overlayParams: VFXParams = {
      duration: 4000,
      color: '#AA44FF',
      intensity: 0.9,
    };
    if (this.config.colorBlindMode) {
      overlayParams.pattern = 'checkerboard';
    }

    const overlayInstance = this.pool.acquire('overlay', overlayParams);
    if (overlayInstance) {
      primaryInstance = overlayInstance;
      cmds.push(
        this.makeCommand('SPAWN_VFX', event, {
          vfxType: 'overlay',
          color: '#AA44FF',
          duration: 4000,
        }),
      );
    }

    const displayName = sanitizeText(event.user.displayName, 64);

    // Spotlight card
    cmds.push(
      this.makeCommand('SPOTLIGHT_CARD', event, {
        viewerName: displayName,
        message: sanitizeText('New subscriber!', 200),
      }),
    );

    // Trail effect
    const trailDuration = this.config.motionReduction ? 1500 : 3000;
    const trailInstance = this.pool.acquire('trail', {
      duration: trailDuration,
      color: '#AA44FF',
    });
    if (trailInstance) {
      cmds.push(
        this.makeCommand('SPAWN_VFX', event, {
          vfxType: 'trail',
          color: '#AA44FF',
          duration: trailDuration,
        }),
      );
    }

    return { commands: cmds, vfxAcquired: primaryInstance, dropped: !overlayInstance };
  }

  // -------------------------------------------------------------------------
  // Ability sequence
  // -------------------------------------------------------------------------

  private emitAbilitySequence(event: NormalizedLiveEvent): VFXCommandResult {
    const params: VFXParams = {
      duration: 5000,
      color: '#FFAA00',
      intensity: 1.0,
    };

    const instance = this.pool.acquire('particle', params);
    if (!instance) {
      return { commands: [], vfxAcquired: null, dropped: true };
    }

    const cmds = [
      this.makeCommand('SPAWN_VFX', event, {
        vfxType: 'particle',
        color: '#FFAA00',
        intensity: 1.0,
        duration: 5000,
        abilitySequence: true,
      }),
    ];

    return { commands: cmds, vfxAcquired: instance, dropped: false };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private makeCommand(
    type: GameCommandType,
    event: NormalizedLiveEvent,
    metadata: Record<string, string | number | boolean>,
  ): GameCommand {
    return {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      id: `vfx_cmd_${++this.cmdCounter}_${Date.now()}`,
      type,
      createdAt: new Date().toISOString(),
      viewerId: event.user.id,
      displayName: sanitizeText(event.user.displayName, 64),
      sourceEventIds: [event.id],
      metadata: this.sanitizeMetadata(metadata),
    };
  }

  private sanitizeMetadata(
    meta: Record<string, string | number | boolean>,
  ): Record<string, string | number | boolean> {
    const result: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(meta)) {
      const safeKey = sanitizeText(key, 128);
      if (typeof value === 'string') {
        result[safeKey] = sanitizeText(value, 500);
      } else {
        result[safeKey] = value;
      }
    }
    return result;
  }

  /** Quality multiplier for particle counts. */
  private getQualityMultiplier(): number {
    switch (this.config.quality) {
      case 'low':
        return 0.25;
      case 'medium':
        return 0.5;
      case 'high':
        return 1.0;
      case 'ultra':
        return 1.5;
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Release a VFX instance back to the pool. */
  releaseInstance(instance: VFXInstance): void {
    this.pool.release(instance);
  }

  /** Get pool statistics. */
  getStats(): VFXPoolStats {
    return this.pool.getStats();
  }

  /** Get current config. */
  getConfig(): VFXConfig {
    return this.config;
  }

  /** Hot-reload config. */
  reloadConfig(config: VFXConfig): void {
    this.config = config;
    this.pool.updateConfig(config);
  }

  /** Drain emitted commands. */
  drainCommands(): GameCommand[] {
    const cmds = [...this.commands];
    this.commands.length = 0;
    return cmds;
  }

  /** Whether quality has been downgraded due to frame-rate budget overrun. */
  isQualityDowngraded(): boolean {
    return this.qualityDowngraded;
  }

  /** Get current rolling average processing time in ms. */
  getRollingAvgMs(): number {
    return this.rollingAvgMs;
  }

  /** Seed the rolling average (test-only hook for deterministic budget tests). */
  seedRollingAvg(ms: number): void {
    this.rollingAvgMs = ms;
  }
}
