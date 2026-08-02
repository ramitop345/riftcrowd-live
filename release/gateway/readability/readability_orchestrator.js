/**
 * Phase 15 — Readability Orchestrator.
 *
 * Facade wiring readability config + command modification.
 * Modifies commands before emission based on accessibility settings.
 */
// ---------------------------------------------------------------------------
// ReadabilityOrchestrator
// ---------------------------------------------------------------------------
export class ReadabilityOrchestrator {
    config;
    constructor(config) {
        this.config = config;
    }
    /**
     * Apply readability modifications to a command before emission.
     * Returns a modified copy of the command (does not mutate original).
     */
    applyReadability(command) {
        let modified = { ...command };
        // Clone metadata to avoid mutating the original
        const meta = modified.metadata ? { ...modified.metadata } : {};
        switch (command.type) {
            case 'SPAWN_VFX':
                modified = this.applyVFXReadability(modified, meta);
                break;
            case 'SPOTLIGHT_CARD':
                modified = this.applySpotlightReadability(modified, meta);
                break;
            case 'SUPPORTER_CALLOUT':
                modified = this.applyCalloutReadability(modified, meta);
                break;
            case 'CAMERA_IMPULSE':
                modified = this.applyCameraReadability(modified, meta);
                break;
            default:
                // No modifications for other command types, but apply font size if text-related
                if (this.config.fontSize !== 'medium') {
                    meta['fontSize'] = this.config.fontSize;
                    modified = { ...modified, metadata: meta };
                }
                break;
        }
        return modified;
    }
    /** Apply batch readability to an array of commands. */
    applyReadabilityBatch(commands) {
        return commands.map((cmd) => this.applyReadability(cmd));
    }
    // -------------------------------------------------------------------------
    // Per-command-type modifications
    // -------------------------------------------------------------------------
    applyVFXReadability(command, meta) {
        // Color-blind mode → add pattern hints
        if (this.config.colorBlindMode) {
            const existingPattern = meta['pattern'];
            if (!existingPattern) {
                meta['pattern'] = this.getDefaultPattern(meta['vfxType']);
            }
        }
        // Motion reduction → shorten trail duration
        if (this.config.motionReduction) {
            const duration = meta['duration'];
            if (typeof duration === 'number' && duration > 0) {
                meta['duration'] = Math.floor(duration * 0.5);
            }
        }
        // Font size hint
        if (this.config.fontSize !== 'medium') {
            meta['fontSize'] = this.config.fontSize;
        }
        // Contrast boost
        if (this.config.contrastBoost) {
            meta['contrastBoost'] = true;
        }
        return { ...command, metadata: meta };
    }
    applySpotlightReadability(command, meta) {
        // Safe zone bounds
        meta['safeZoneTop'] = this.config.safeZone.topPx;
        meta['safeZoneBottom'] = this.config.safeZone.bottomPx;
        meta['safeZoneLeft'] = this.config.safeZone.leftPx;
        meta['safeZoneRight'] = this.config.safeZone.rightPx;
        // Font size
        meta['fontSize'] = this.config.fontSize;
        // Contrast boost
        if (this.config.contrastBoost) {
            meta['contrastBoost'] = true;
        }
        return { ...command, metadata: meta };
    }
    applyCalloutReadability(command, meta) {
        // Safe zone bounds
        meta['safeZoneTop'] = this.config.safeZone.topPx;
        meta['safeZoneBottom'] = this.config.safeZone.bottomPx;
        meta['safeZoneLeft'] = this.config.safeZone.leftPx;
        meta['safeZoneRight'] = this.config.safeZone.rightPx;
        // Font size
        meta['fontSize'] = this.config.fontSize;
        // Contrast boost
        if (this.config.contrastBoost) {
            meta['contrastBoost'] = true;
        }
        return { ...command, metadata: meta };
    }
    applyCameraReadability(command, meta) {
        // Motion reduction → reduce intensity by 50%
        if (this.config.motionReduction) {
            const intensity = meta['intensity'];
            if (typeof intensity === 'number') {
                meta['intensity'] = Math.round(intensity * 0.5 * 1000) / 1000;
            }
        }
        return { ...command, metadata: meta };
    }
    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    /** Default pattern for color-blind mode based on VFX type. */
    getDefaultPattern(vfxType) {
        switch (vfxType) {
            case 'particle':
                return 'dots';
            case 'flash':
                return 'crosshatch';
            case 'trail':
                return 'zigzag';
            case 'overlay':
                return 'stripes';
            default:
                return 'stripes';
        }
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
}
