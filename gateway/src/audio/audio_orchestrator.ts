/**
 * Phase 15 — Audio Orchestrator.
 *
 * Facade wiring audio config + command emission.
 * Decides which audio to trigger based on event type.
 * Respects volume groups (master × group volume).
 */

import type { NormalizedLiveEvent } from '@riftcrowd/shared';
import {
  COMMAND_SCHEMA_VERSION,
  type GameCommand,
  type GameCommandType,
} from '@riftcrowd/shared';
import type { AudioConfig } from './audio_config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AudioCommandResult {
  commands: GameCommand[];
}

export interface AudioStats {
  eventsProcessed: number;
  commandsEmitted: number;
}

// ---------------------------------------------------------------------------
// AudioOrchestrator
// ---------------------------------------------------------------------------

export class AudioOrchestrator {
  private config: AudioConfig;
  private stats: AudioStats = { eventsProcessed: 0, commandsEmitted: 0 };
  private cmdCounter = 0;

  constructor(config: AudioConfig) {
    this.config = config;
  }

  /** Main entry: decide which audio to trigger based on event type. */
  triggerAudio(event: NormalizedLiveEvent): AudioCommandResult {
    this.stats.eventsProcessed++;

    switch (event.type) {
      case 'chat':
        return this.handleChat(event);
      case 'like':
        return this.handleLike(event);
      case 'follow':
        return this.handleFollow(event);
      case 'share':
        return this.handleShare(event);
      case 'gift':
        return this.handleGift(event);
      case 'subscribe':
        return this.handleSubscription(event);
      default:
        return { commands: [] };
    }
  }

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  private handleChat(_event: NormalizedLiveEvent): AudioCommandResult {
    // Chat → no audio
    return { commands: [] };
  }

  private handleLike(event: NormalizedLiveEvent): AudioCommandResult {
    const cmds: GameCommand[] = [];

    // sfx.hit
    cmds.push(this.makeAudioCommand(event, this.config.sfx.hit, 'sfx'));

    // If milestone (likeCount >= 100), also sfx.spotlight
    if (event.likeCount !== undefined && event.likeCount >= 100) {
      cmds.push(this.makeAudioCommand(event, this.config.sfx.spotlight, 'sfx'));
    }

    this.stats.commandsEmitted += cmds.length;
    return { commands: cmds };
  }

  private handleFollow(event: NormalizedLiveEvent): AudioCommandResult {
    const cmds = [this.makeAudioCommand(event, this.config.sfx.follow, 'sfx')];
    this.stats.commandsEmitted += cmds.length;
    return { commands: cmds };
  }

  private handleShare(event: NormalizedLiveEvent): AudioCommandResult {
    const cmds = [this.makeAudioCommand(event, this.config.sfx.share, 'sfx')];
    this.stats.commandsEmitted += cmds.length;
    return { commands: cmds };
  }

  private handleGift(event: NormalizedLiveEvent): AudioCommandResult {
    const cmds: GameCommand[] = [];

    // sfx.gift
    cmds.push(this.makeAudioCommand(event, this.config.sfx.gift, 'sfx'));

    // If cinematic (high repeat count), also sfx.ability
    const gift = event.gift;
    if (gift && gift.repeatCount >= 100) {
      cmds.push(this.makeAudioCommand(event, this.config.sfx.ability, 'sfx'));
    }

    this.stats.commandsEmitted += cmds.length;
    return { commands: cmds };
  }

  private handleSubscription(event: NormalizedLiveEvent): AudioCommandResult {
    const cmds = [
      this.makeAudioCommand(event, this.config.sfx.follow, 'sfx'),
      this.makeAudioCommand(event, this.config.sfx.spotlight, 'sfx'),
    ];
    this.stats.commandsEmitted += cmds.length;
    return { commands: cmds };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Compute effective volume: master × group / 10000 (both 0-100 scale).
   * Returns 0-1 range for Godot AudioStreamPlayer.
   */
  computeVolume(volumeGroup: 'master' | 'music' | 'sfx' | 'ui'): number {
    const master = this.config.volumeGroups.master;
    const group = this.config.volumeGroups[volumeGroup];
    return (master * group) / 10000;
  }

  private makeAudioCommand(
    event: NormalizedLiveEvent,
    track: string,
    volumeGroup: 'master' | 'music' | 'sfx' | 'ui',
  ): GameCommand {
    const volume = this.computeVolume(volumeGroup);
    return {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      id: `audio_cmd_${++this.cmdCounter}_${Date.now()}`,
      type: 'PLAY_AUDIO' as GameCommandType,
      createdAt: new Date().toISOString(),
      viewerId: event.user.id,
      sourceEventIds: [event.id],
      metadata: {
        track,
        volumeGroup,
        volume: Math.round(volume * 1000) / 1000,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Get current config. */
  getConfig(): AudioConfig {
    return this.config;
  }

  /** Hot-reload config. */
  reloadConfig(config: AudioConfig): void {
    this.config = config;
  }

  /** Get stats. */
  getStats(): AudioStats {
    return { ...this.stats };
  }

  /** Reset stats. */
  reset(): void {
    this.stats = { eventsProcessed: 0, commandsEmitted: 0 };
  }
}
