/**
 * Phase 15 — VFX Orchestrator.
 *
 * Facade wiring VFX pool + config + command emission.
 * Decides which VFX to trigger based on event type, respects quality level,
 * motion reduction, and color-blind mode. Sanitizes all text before emitting.
 */
import { COMMAND_SCHEMA_VERSION, } from '@riftcrowd/shared';
import { VFXPool } from './vfx_pool.js';
import { QUALITY_TIER_DEFAULTS } from './vfx_config.js';
// ---------------------------------------------------------------------------
// Quality tier ladder
// ---------------------------------------------------------------------------
const QUALITY_TIERS = ['low', 'medium', 'high', 'ultra'];
// ---------------------------------------------------------------------------
// Text sanitization
// ---------------------------------------------------------------------------
/** Strip HTML tags, control characters, and known XSS vectors. */
export function sanitizeText(input, maxLen = 128) {
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
    pool;
    config;
    commands = [];
    cmdCounter = 0;
    /** Rolling average processing time in ms (exponential moving average). */
    rollingAvgMs = 0;
    ALPHA = 0.1;
    /** Whether quality has been downgraded due to frame-rate budget overrun. */
    qualityDowngraded = false;
    // --- Tier 4: quality ladder state ---
    currentTier = 'high';
    frameReports = [];
    MAX_FRAME_REPORTS = 60;
    consecutiveOverSeconds = 0;
    consecutiveUnderSeconds = 0;
    lastTierChangeMs = 0;
    HYSTERESIS_MS = 5000;
    tierChangeCallbacks = [];
    constructor(config) {
        this.config = config;
        this.pool = new VFXPool(config);
        // Initialize tier from config quality
        this.currentTier = config.quality;
    }
    /** Main entry: decide which VFX to trigger based on event type. */
    triggerVFX(event) {
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
            }
            else {
                this.qualityDowngraded = false;
            }
        }
        let result;
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
    updateRollingAvg(elapsedMs) {
        this.rollingAvgMs = this.ALPHA * elapsedMs + (1 - this.ALPHA) * this.rollingAvgMs;
    }
    // -------------------------------------------------------------------------
    // Event handlers
    // -------------------------------------------------------------------------
    handleChat(event) {
        // Chat → no VFX unless it's an !ability command
        const comment = event.comment ?? '';
        if (comment.toLowerCase().startsWith('!ability')) {
            return this.emitAbilitySequence(event);
        }
        return { commands: [], vfxAcquired: null, dropped: false };
    }
    handleLike(event) {
        const qualityMultiplier = this.getQualityMultiplier();
        const particleCount = Math.max(1, Math.floor(10 * qualityMultiplier));
        const params = {
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
    handleFollow(event) {
        const overlayParams = {
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
    handleShare(event) {
        const trailDuration = this.config.motionReduction ? 1000 : 2000;
        const trailParams = {
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
    handleGift(event) {
        const cmds = [];
        let primaryInstance = null;
        // Hit flash
        const flashParams = {
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
            cmds.push(this.makeCommand('SPAWN_VFX', event, {
                vfxType: 'flash',
                color: '#FF4444',
                intensity: 1.0,
            }));
        }
        // Camera impulse (disabled if motion reduction)
        if (!this.config.motionReduction) {
            cmds.push(this.makeCommand('CAMERA_IMPULSE', event, {
                intensity: 0.8,
                duration: 300,
            }));
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
    handleSubscription(event) {
        const cmds = [];
        let primaryInstance = null;
        // Faction overlay
        const overlayParams = {
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
            cmds.push(this.makeCommand('SPAWN_VFX', event, {
                vfxType: 'overlay',
                color: '#AA44FF',
                duration: 4000,
            }));
        }
        const displayName = sanitizeText(event.user.displayName, 64);
        // Spotlight card
        cmds.push(this.makeCommand('SPOTLIGHT_CARD', event, {
            viewerName: displayName,
            message: sanitizeText('New subscriber!', 200),
        }));
        // Trail effect
        const trailDuration = this.config.motionReduction ? 1500 : 3000;
        const trailInstance = this.pool.acquire('trail', {
            duration: trailDuration,
            color: '#AA44FF',
        });
        if (trailInstance) {
            cmds.push(this.makeCommand('SPAWN_VFX', event, {
                vfxType: 'trail',
                color: '#AA44FF',
                duration: trailDuration,
            }));
        }
        return { commands: cmds, vfxAcquired: primaryInstance, dropped: !overlayInstance };
    }
    // -------------------------------------------------------------------------
    // Ability sequence
    // -------------------------------------------------------------------------
    emitAbilitySequence(event) {
        const params = {
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
    makeCommand(type, event, metadata) {
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
    sanitizeMetadata(meta) {
        const result = {};
        for (const [key, value] of Object.entries(meta)) {
            const safeKey = sanitizeText(key, 128);
            if (typeof value === 'string') {
                result[safeKey] = sanitizeText(value, 500);
            }
            else {
                result[safeKey] = value;
            }
        }
        return result;
    }
    /** Quality multiplier for particle counts. */
    getQualityMultiplier() {
        // Use per-tier config if available
        const tiers = this.config.qualityTiers ?? QUALITY_TIER_DEFAULTS;
        const tierConfig = tiers[this.currentTier];
        if (tierConfig) {
            return tierConfig.particleMultiplier;
        }
        // Fallback
        switch (this.currentTier) {
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
    releaseInstance(instance) {
        this.pool.release(instance);
    }
    /** Get pool statistics. */
    getStats() {
        return this.pool.getStats();
    }
    /** Get current config. */
    getConfig() {
        return this.config;
    }
    /** Hot-reload config. */
    reloadConfig(config) {
        this.config = config;
        this.pool.updateConfig(config);
    }
    /** Drain emitted commands. */
    drainCommands() {
        const cmds = [...this.commands];
        this.commands.length = 0;
        return cmds;
    }
    /** Whether quality has been downgraded due to frame-rate budget overrun. */
    isQualityDowngraded() {
        return this.qualityDowngraded;
    }
    /** Get current rolling average processing time in ms. */
    getRollingAvgMs() {
        return this.rollingAvgMs;
    }
    /** Seed the rolling average (test-only hook for deterministic budget tests). */
    seedRollingAvg(ms) {
        this.rollingAvgMs = ms;
    }
    // -------------------------------------------------------------------------
    // Tier 4 — Frame report handling & automatic tier stepping
    // -------------------------------------------------------------------------
    /**
     * Handle a frame performance report from Godot.
     * Tracks rolling window and auto-steps quality tier based on frame time.
     */
    handleFrameReport(report) {
        this.frameReports.push(report);
        if (this.frameReports.length > this.MAX_FRAME_REPORTS) {
            this.frameReports.shift();
        }
        const budgetMs = 1000 / this.config.frameRateBudget;
        // Check if average frame time exceeds budget
        if (report.avgFrameMs > budgetMs) {
            this.consecutiveOverSeconds++;
            this.consecutiveUnderSeconds = 0;
        }
        else {
            this.consecutiveUnderSeconds++;
            this.consecutiveOverSeconds = 0;
        }
        const now = Date.now();
        const canChange = now - this.lastTierChangeMs >= this.HYSTERESIS_MS;
        // Downgrade: 3 consecutive seconds over budget
        if (this.consecutiveOverSeconds >= 3 && canChange) {
            const idx = QUALITY_TIERS.indexOf(this.currentTier);
            if (idx > 0) {
                const from = this.currentTier;
                this.currentTier = QUALITY_TIERS[idx - 1];
                this.lastTierChangeMs = now;
                this.consecutiveOverSeconds = 0;
                this.emitTierChange(from, this.currentTier, 'frame time over budget for 3s');
            }
        }
        // Upgrade: 5 consecutive seconds under budget
        if (this.consecutiveUnderSeconds >= 5 && canChange) {
            const idx = QUALITY_TIERS.indexOf(this.currentTier);
            if (idx < QUALITY_TIERS.length - 1) {
                const from = this.currentTier;
                this.currentTier = QUALITY_TIERS[idx + 1];
                this.lastTierChangeMs = now;
                this.consecutiveUnderSeconds = 0;
                this.emitTierChange(from, this.currentTier, 'frame time under budget for 5s');
            }
        }
    }
    /** Get the current quality tier. */
    getQualityTier() {
        return this.currentTier;
    }
    /** Set quality tier directly (for testing or manual override). */
    setQualityTier(tier) {
        const from = this.currentTier;
        this.currentTier = tier;
        if (from !== tier) {
            this.emitTierChange(from, tier, 'manual override');
        }
    }
    /** Register a callback for tier change events. */
    onTierChange(cb) {
        this.tierChangeCallbacks.push(cb);
    }
    /** Get the count of stored frame reports. */
    getFrameReportCount() {
        return this.frameReports.length;
    }
    /** Get the rolling average frame time from stored reports. */
    getAvgFrameMs() {
        if (this.frameReports.length === 0)
            return 0;
        const sum = this.frameReports.reduce((acc, r) => acc + r.avgFrameMs, 0);
        return sum / this.frameReports.length;
    }
    emitTierChange(from, to, reason) {
        // Emit a SET_QUALITY_TIER command into the pipeline
        const cmd = {
            schemaVersion: COMMAND_SCHEMA_VERSION,
            id: `quality_tier_${++this.cmdCounter}_${Date.now()}`,
            type: 'SET_QUALITY_TIER',
            createdAt: new Date().toISOString(),
            sourceEventIds: [],
            metadata: {
                tier: to,
                reason,
                fromTier: from,
            },
        };
        this.commands.push(cmd);
        // Notify callbacks
        const evt = { from, to, reason };
        for (const cb of this.tierChangeCallbacks) {
            cb(evt);
        }
    }
}
