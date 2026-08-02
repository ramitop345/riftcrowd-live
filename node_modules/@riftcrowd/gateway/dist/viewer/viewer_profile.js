/**
 * ViewerProfile — session-scoped viewer identity for RiftCrowd LIVE Phase 7.
 *
 * Stores sanitized display name, faction membership, contribution counters,
 * and moderation state. Provider handles are kept raw but stored separately;
 * only the sanitized display name is shown in UI labels.
 */
import { z } from 'zod';
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Default maximum length for sanitized display names. */
export const DEFAULT_DISPLAY_NAME_MAX_LENGTH = 64;
/**
 * Regex matching ASCII control characters (0x00–0x1F) and DEL (0x7F).
 * These are stripped from untrusted display text before it reaches any label.
 */
// eslint-disable-next-line no-control-regex
const ASCII_CONTROL_RE = /[\x00-\x1F\x7F]/g;
/**
 * Regex matching zero-width Unicode characters that can cause rendering
 * glitches or be used to bypass moderation filters.
 * - U+200B ZERO WIDTH SPACE
 * - U+200C ZERO WIDTH NON-JOINER
 * - U+200D ZERO WIDTH JOINER
 * - U+FEFF ZERO WIDTH NO-BREAK SPACE (BOM)
 */
const ZERO_WIDTH_RE = /(?:\u200B|\u200C|\u200D|\uFEFF)/g;
// ---------------------------------------------------------------------------
// sanitizeDisplayName
// ---------------------------------------------------------------------------
/**
 * Sanitizes an untrusted display name for safe UI rendering.
 *
 * Rules (applied in order):
 * 1. Coerce non-string input (null, undefined, number, object, Buffer) to "".
 * 2. Strip ASCII control characters (0x00–0x1F, 0x7F).
 * 3. Strip zero-width Unicode characters (U+200B, U+200C, U+200D, U+FEFF).
 * 4. Trim leading/trailing whitespace.
 * 5. Cap at `maxLength` characters (default 64).
 *
 * **Never throws** on any input — all errors are caught and coerced to "".
 *
 * @param raw — untrusted input from a provider adapter.
 * @param maxLength — maximum allowed length (default 64).
 * @returns sanitized display name safe for UI labels.
 */
export function sanitizeDisplayName(raw, maxLength = DEFAULT_DISPLAY_NAME_MAX_LENGTH) {
    try {
        // Coerce non-string to ""
        if (typeof raw !== 'string') {
            if (raw === null || raw === undefined)
                return '';
            // Attempt toString for numbers/objects, but catch any failure
            try {
                raw = String(raw);
            }
            catch {
                return '';
            }
        }
        let s = raw;
        // Strip ASCII control chars (0x00–0x1F, 0x7F)
        s = s.replace(ASCII_CONTROL_RE, '');
        // Strip zero-width Unicode chars
        s = s.replace(ZERO_WIDTH_RE, '');
        // Trim
        s = s.trim();
        // Cap at maxLength
        if (s.length > maxLength) {
            s = s.slice(0, maxLength);
        }
        return s;
    }
    catch {
        // Absolute safety net — never throw
        return '';
    }
}
// ---------------------------------------------------------------------------
// ViewerProfile Zod schema (strict, schemaVersion 1)
// ---------------------------------------------------------------------------
export const ContributionCategoriesSchema = z
    .object({
    combat: z.number().int().min(0),
    defense: z.number().int().min(0),
    engagement: z.number().int().min(0),
    gifts: z.number().int().min(0),
})
    .strict();
export const ViewerProfileSchema = z
    .object({
    schemaVersion: z.literal(1),
    viewerId: z.string().min(1).max(128),
    providerHandle: z.string().max(128),
    displayName: z.string().max(64),
    firstSeenAt: z.string().datetime(),
    lastSeenAt: z.string().datetime(),
    factionId: z.string().max(128).optional(),
    switchCount: z.number().int().min(0),
    isHidden: z.boolean(),
    contributionCategories: ContributionCategoriesSchema,
    roundsParticipated: z.number().int().min(0),
})
    .strict();
// ---------------------------------------------------------------------------
// Factory: create a fresh profile
// ---------------------------------------------------------------------------
/**
 * Creates a fresh ViewerProfile with zeroed contribution counters and no faction.
 * Sanitizes the displayName; keeps providerHandle raw.
 */
export function createViewerProfile(viewerId, providerHandle, rawDisplayName, displayNameMaxLength = DEFAULT_DISPLAY_NAME_MAX_LENGTH) {
    const now = new Date().toISOString();
    return {
        schemaVersion: 1,
        viewerId,
        providerHandle,
        displayName: sanitizeDisplayName(rawDisplayName, displayNameMaxLength),
        firstSeenAt: now,
        lastSeenAt: now,
        switchCount: 0,
        isHidden: false,
        contributionCategories: { combat: 0, defense: 0, engagement: 0, gifts: 0 },
        roundsParticipated: 0,
    };
}
