/**
 * Phase 16 — Fallback Orchestrator.
 *
 * Monitors stream health and activates a "Technical Difficulties" fallback
 * overlay when critical failures are detected (gateway disconnect, provider
 * disconnect, VFX pool exhaustion, audio missing). Emits ACTIVATE_FALLBACK
 * and DEACTIVATE_FALLBACK commands.
 *
 * FIX 2: Tracks active reasons as a Set<FallbackReason> so concurrent
 * gateway + provider disconnects don't overwrite each other.
 * deactivateReason() removes a single reason; fallback only deactivates
 * when the set is empty.
 */
import { COMMAND_SCHEMA_VERSION, } from '@riftcrowd/shared';
// ---------------------------------------------------------------------------
// FallbackOrchestrator
// ---------------------------------------------------------------------------
export class FallbackOrchestrator {
    _active = false;
    _reason = null;
    _reasons = new Set();
    _activatedAt = null;
    _commands = [];
    _cmdCounter = 0;
    _listeners = [];
    /** Whether the fallback overlay is currently active. */
    get active() {
        return this._active;
    }
    /** Current reason for fallback activation (last added or remaining). */
    get reason() {
        return this._reason;
    }
    /** Get current status snapshot. */
    getStatus() {
        return {
            active: this._active,
            reason: this._reason,
            activatedAt: this._activatedAt,
            commandCount: this._commands.length,
        };
    }
    /**
     * Activate the fallback overlay with a given reason.
     * Adds the reason to the active set. If already active, just adds the reason.
     */
    activate(reason) {
        const alreadyActive = this._active;
        this._active = true;
        this._reasons.add(reason);
        this._reason = reason;
        if (!alreadyActive) {
            this._activatedAt = new Date().toISOString();
        }
        const cmd = this.makeCommand('ACTIVATE_FALLBACK', reason);
        this._commands.push(cmd);
        this.emit({ type: 'activate', reason, command: cmd });
        return cmd;
    }
    /**
     * Remove a specific reason from the active set.
     * Only deactivates fallback when the set is empty.
     * FIX 11: Returns null if not active and no reasons tracked (redundant deactivation guard).
     */
    deactivateReason(reason) {
        this._reasons.delete(reason);
        if (this._reasons.size > 0) {
            // Still active — update _reason to any remaining reason
            this._reason = this._reasons.values().next().value ?? null;
            return null;
        }
        // All reasons cleared — deactivate
        return this._performDeactivate(reason);
    }
    /**
     * Deactivate the fallback overlay, clearing all reasons.
     * FIX 11: Guard against redundant deactivation when already inactive with no reasons.
     */
    deactivate(reason = 'manual') {
        if (!this._active && this._reasons.size === 0)
            return null;
        this._reasons.clear();
        return this._performDeactivate(reason);
    }
    /**
     * Handle gateway disconnect: activate fallback.
     */
    onGatewayDisconnected() {
        return this.activate('gateway_disconnected');
    }
    /**
     * Handle gateway reconnect: remove gateway_disconnected reason.
     */
    onGatewayReconnected() {
        if (this._active && this._reasons.has('gateway_disconnected')) {
            return this.deactivateReason('gateway_disconnected');
        }
        return null;
    }
    /**
     * Handle provider disconnect: activate fallback.
     */
    onProviderDisconnected() {
        return this.activate('provider_disconnected');
    }
    /**
     * Handle provider reconnect: remove provider_disconnected reason.
     */
    onProviderReconnected() {
        if (this._active && this._reasons.has('provider_disconnected')) {
            return this.deactivateReason('provider_disconnected');
        }
        return null;
    }
    /**
     * Handle VFX pool exhaustion: degrade gracefully (log warning, no crash).
     * Does NOT activate fallback — just logs a warning and continues.
     */
    onVFXPoolExhausted() {
        // VFX pool exhaustion is graceful degradation — no fallback activation
        return { degraded: true, message: 'VFX pool exhausted, visual effects degraded' };
    }
    /**
     * Handle missing audio: silent, no crash.
     * Does NOT activate fallback — just logs a warning.
     */
    onAudioMissing() {
        return { silent: true, message: 'Audio asset missing, playing silently' };
    }
    /** Drain emitted commands. */
    drainCommands() {
        const cmds = [...this._commands];
        this._commands.length = 0;
        return cmds;
    }
    /** Subscribe to fallback events. */
    onEvent(listener) {
        this._listeners.push(listener);
        return () => {
            this._listeners = this._listeners.filter((l) => l !== listener);
        };
    }
    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------
    _performDeactivate(reason) {
        this._active = false;
        this._reason = null;
        this._activatedAt = null;
        const cmd = this.makeCommand('DEACTIVATE_FALLBACK', reason);
        this._commands.push(cmd);
        this.emit({ type: 'deactivate', reason, command: cmd });
        return cmd;
    }
    makeCommand(type, reason) {
        return {
            schemaVersion: COMMAND_SCHEMA_VERSION,
            id: `fallback_cmd_${++this._cmdCounter}_${Date.now()}`,
            type,
            createdAt: new Date().toISOString(),
            sourceEventIds: [],
            metadata: { reason },
        };
    }
    emit(event) {
        for (const listener of this._listeners) {
            try {
                listener(event);
            }
            catch {
                // Listener errors are swallowed to protect the orchestrator
            }
        }
    }
}
