/**
 * ViewerRegistry — session-scoped registry of viewer profiles.
 *
 * Deduplication: same viewerId always returns the existing profile object
 * (object identity preserved). Updates lastSeenAt on re-encounter and
 * re-sanitizes displayName if it changed.
 */
import { createViewerProfile, sanitizeDisplayName, } from './viewer_profile.js';
/**
 * Sanitizes a provider handle for safe display.
 * Strips ASCII control characters but does NOT apply the 64-char display name cap
 * (provider handles are provider-assigned and may be longer).
 *
 * @param raw — the raw provider handle string.
 * @returns sanitized handle safe for display.
 */
function sanitizeProviderHandle(raw) {
    // Strip ASCII control chars (0x00–0x1F, 0x7F)
    // eslint-disable-next-line no-control-regex
    let s = raw.replace(/[\x00-\x1F\x7F]/g, '');
    // Strip zero-width Unicode chars
    s = s.replace(/(?:\u200B|\u200C|\u200D|\uFEFF)/g, '');
    return s.trim();
}
// ---------------------------------------------------------------------------
// ViewerRegistry class
// ---------------------------------------------------------------------------
export class ViewerRegistry {
    profiles = new Map();
    displayNameMaxLength;
    constructor(displayNameMaxLength = 64) {
        this.displayNameMaxLength = displayNameMaxLength;
    }
    /**
     * Returns the existing profile for `viewerId`, or creates a new one.
     * On re-encounter: updates `lastSeenAt` and re-sanitizes `displayName`
     * if the raw value differs from the currently stored (sanitized) name.
     *
     * Object identity is preserved — calling this twice with the same viewerId
     * returns the exact same object reference.
     *
     * Note: `providerHandle` is sanitized for display (control chars stripped).
     * Use the raw form only for provider-specific lookups.
     */
    getOrCreate(viewerId, providerHandle, rawDisplayName) {
        const existing = this.profiles.get(viewerId);
        if (existing) {
            // Update lastSeenAt
            existing.lastSeenAt = new Date().toISOString();
            // Re-sanitize displayName if raw value changed
            const sanitized = sanitizeDisplayName(rawDisplayName, this.displayNameMaxLength);
            if (sanitized !== existing.displayName) {
                existing.displayName = sanitized;
            }
            return existing;
        }
        // Create new profile with sanitized provider handle
        const profile = createViewerProfile(viewerId, sanitizeProviderHandle(providerHandle), rawDisplayName, this.displayNameMaxLength);
        this.profiles.set(viewerId, profile);
        return profile;
    }
    /** Returns the profile for `viewerId`, or undefined if not registered. */
    get(viewerId) {
        return this.profiles.get(viewerId);
    }
    /**
     * Marks a viewer as hidden (moderation). Hidden viewers cannot join factions.
     * No-op if the viewer is not registered.
     */
    hide(viewerId) {
        const profile = this.profiles.get(viewerId);
        if (profile) {
            profile.isHidden = true;
        }
    }
    /**
     * Unhides a previously hidden viewer. No-op if not registered or not hidden.
     */
    unhide(viewerId) {
        const profile = this.profiles.get(viewerId);
        if (profile) {
            profile.isHidden = false;
        }
    }
    /**
     * Clears per-round state (factionId, switchCount) for all viewers while
     * preserving cross-round persistent data (roundsParticipated, contributions).
     * Call this at round boundaries (RESULTS → MODE_VOTE).
     */
    resetRoundState() {
        for (const profile of this.profiles.values()) {
            profile.factionId = undefined;
            profile.switchCount = 0;
        }
    }
    /**
     * Clears ALL registered profiles. Destroys cross-round persistent state
     * (roundsParticipated, contribution totals). Use with caution.
     *
     * **WARNING**: This should only be called at session start or full session reset,
     * NOT at round boundaries. Use `resetRoundState()` for per-round cleanup.
     */
    resetAll() {
        this.profiles.clear();
    }
    /**
     * @deprecated Use `resetAll()` instead. Clears all registered profiles.
     */
    resetSession() {
        this.resetAll();
    }
    /** Returns all registered profiles as a readonly array. */
    list() {
        return [...this.profiles.values()];
    }
    /** Number of registered viewers. */
    get size() {
        return this.profiles.size;
    }
}
