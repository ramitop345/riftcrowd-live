/**
 * Phase 15 — Audio Orchestrator.
 *
 * Facade wiring audio config + command emission.
 * Decides which audio to trigger based on event type.
 * Respects volume groups (master × group volume).
 */
import { COMMAND_SCHEMA_VERSION, } from '@riftcrowd/shared';
// ---------------------------------------------------------------------------
// AudioOrchestrator
// ---------------------------------------------------------------------------
export class AudioOrchestrator {
    config;
    stats = { eventsProcessed: 0, commandsEmitted: 0 };
    cmdCounter = 0;
    constructor(config) {
        this.config = config;
    }
    /** Main entry: decide which audio to trigger based on event type. */
    triggerAudio(event) {
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
    handleChat(_event) {
        // Chat → no audio
        return { commands: [] };
    }
    handleLike(event) {
        const cmds = [];
        // sfx.hit
        cmds.push(this.makeAudioCommand(event, this.config.sfx.hit, 'sfx'));
        // If milestone (likeCount >= 100), also sfx.spotlight
        if (event.likeCount !== undefined && event.likeCount >= 100) {
            cmds.push(this.makeAudioCommand(event, this.config.sfx.spotlight, 'sfx'));
        }
        this.stats.commandsEmitted += cmds.length;
        return { commands: cmds };
    }
    handleFollow(event) {
        const cmds = [this.makeAudioCommand(event, this.config.sfx.follow, 'sfx')];
        this.stats.commandsEmitted += cmds.length;
        return { commands: cmds };
    }
    handleShare(event) {
        const cmds = [this.makeAudioCommand(event, this.config.sfx.share, 'sfx')];
        this.stats.commandsEmitted += cmds.length;
        return { commands: cmds };
    }
    handleGift(event) {
        const cmds = [];
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
    handleSubscription(event) {
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
    computeVolume(volumeGroup) {
        const master = this.config.volumeGroups.master;
        const group = this.config.volumeGroups[volumeGroup];
        return (master * group) / 10000;
    }
    makeAudioCommand(event, track, volumeGroup) {
        const volume = this.computeVolume(volumeGroup);
        return {
            schemaVersion: COMMAND_SCHEMA_VERSION,
            id: `audio_cmd_${++this.cmdCounter}_${Date.now()}`,
            type: 'PLAY_AUDIO',
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
    getConfig() {
        return this.config;
    }
    /** Hot-reload config. */
    reloadConfig(config) {
        this.config = config;
    }
    /** Get stats. */
    getStats() {
        return { ...this.stats };
    }
    /** Reset stats. */
    reset() {
        this.stats = { eventsProcessed: 0, commandsEmitted: 0 };
    }
}
