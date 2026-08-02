import { z } from 'zod';
/**
 * Version of the content-pack format. Bump this whenever a field is renamed, retyped, or removed.
 * Additive optional fields do not require a bump. The loader rejects unknown versions.
 */
export const CONTENT_PACK_SCHEMA_VERSION = 1;
/** Every launch mode a content pack may target. Adding a mode means adding a member here. */
export const ContentPackModeSchema = z.enum([
    'countries',
    'animals',
    'fan_crews_original',
    'cities',
]);
/** Stable machine identifiers: lowercase snake_case, never renamed within a schema version. */
const SNAKE_CASE_ID = /^[a-z][a-z0-9_]*$/;
/** Flat `#RRGGBB` hex color. No alpha, no shorthand, no named colors. */
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
/**
 * One faction inside a pack. Pack data is authored, but it still crosses a trust boundary into the
 * game, so every string is bounded and shaped; anything else is rejected, not truncated.
 */
export const FactionSchema = z
    .object({
    id: z.string().max(64).regex(SNAKE_CASE_ID),
    displayName: z.string().min(1).max(64),
    joinKeywords: z.array(z.string().min(1).max(32)).min(1).max(8),
    primaryColor: z.string().regex(HEX_COLOR),
    secondaryColor: z.string().regex(HEX_COLOR),
    pattern: z.string().max(64).regex(SNAKE_CASE_ID),
    captainScene: z.string().max(256).startsWith('res://').endsWith('.tscn'),
    ultimateId: z.string().max(64).regex(SNAKE_CASE_ID),
})
    .strict();
/**
 * One themed content pack. The format allows two to four factions (the MVP renders two); the four
 * launch packs each ship four. Cross-field rules enforced by `superRefine`:
 * - faction ids are unique within the pack;
 * - join keywords are unique case-insensitively across ALL factions in the pack, so a comment can
 *   never be ambiguous about which faction it joins.
 */
export const ContentPackSchema = z
    .object({
    schemaVersion: z.literal(CONTENT_PACK_SCHEMA_VERSION),
    id: z.string().max(64).regex(SNAKE_CASE_ID),
    displayName: z.string().min(1).max(64),
    mode: ContentPackModeSchema,
    factions: z.array(FactionSchema).min(2).max(4),
})
    .strict()
    .superRefine((pack, ctx) => {
    const seenFactionIds = new Set();
    for (const [i, faction] of pack.factions.entries()) {
        if (seenFactionIds.has(faction.id)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Duplicate faction id "${faction.id}" within pack.`,
                path: ['factions', i, 'id'],
            });
        }
        seenFactionIds.add(faction.id);
    }
    // Keyword collisions are checked case-insensitively across every faction in the pack, and the
    // issue is attached to the LATER (colliding) duplicate so the fix location is unambiguous.
    const seenKeywords = new Map();
    for (const [i, faction] of pack.factions.entries()) {
        for (const [j, keyword] of faction.joinKeywords.entries()) {
            const lowered = keyword.toLowerCase();
            const owner = seenKeywords.get(lowered);
            if (owner !== undefined) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Join keyword "${keyword}" collides case-insensitively with a keyword of faction "${owner}".`,
                    path: ['factions', i, 'joinKeywords', j],
                });
            }
            else {
                seenKeywords.set(lowered, faction.id);
            }
        }
    }
});
/** All pack modes as a plain array, useful for exhaustive tests and directory validation. */
export const CONTENT_PACK_MODES = ContentPackModeSchema.options;
/**
 * Comment text is untrusted provider input; only this many leading characters are ever inspected
 * by {@link matchJoinKeyword}. Longer input is not an error — the tail is simply ignored.
 */
export const MAX_JOIN_TEXT_INSPECT_LENGTH = 200;
/**
 * Builds the lookup used to resolve a viewer comment to a faction: lowercased join keyword ->
 * faction id.
 *
 * Throws if two factions claim the same keyword case-insensitively. For a pack that passed
 * {@link ContentPackSchema} this is unreachable (the schema rejects such packs); the throw exists
 * so an unvalidated or hand-built pack fails loudly instead of silently favouring one faction.
 */
export function buildKeywordIndex(pack) {
    const index = new Map();
    for (const faction of pack.factions) {
        for (const keyword of faction.joinKeywords) {
            const lowered = keyword.toLowerCase();
            const owner = index.get(lowered);
            if (owner !== undefined && owner !== faction.id) {
                throw new Error(`Join keyword collision in pack "${pack.id}": "${lowered}" claimed by both "${owner}" and "${faction.id}".`);
            }
            index.set(lowered, faction.id);
        }
    }
    return index;
}
/**
 * Per-pack cache for {@link matchJoinKeyword}: the index for a given pack object is built once
 * and reused for every subsequent comment. Keyed weakly on the pack object itself, so a reloaded
 * (new) pack object gets a fresh index and a dropped pack does not leak its cache entry. The
 * cache is private on purpose — {@link buildKeywordIndex} stays pure and always builds anew.
 */
const keywordIndexCache = new WeakMap();
function getKeywordIndex(pack) {
    let index = keywordIndexCache.get(pack);
    if (index === undefined) {
        index = buildKeywordIndex(pack);
        keywordIndexCache.set(pack, index);
    }
    return index;
}
/**
 * Resolves untrusted comment text to a faction id, or `null` when the comment is not a join.
 *
 * Matching rule: the text is capped at {@link MAX_JOIN_TEXT_INSPECT_LENGTH} characters, trimmed,
 * lowercased, and split on whitespace; only the FIRST token is compared against the keyword index.
 * So `"lions forever"` joins the lions, but `"go lions"` does not — a join must lead with its
 * keyword. This keeps ordinary chatter that merely mentions a faction from being read as a join.
 *
 * Never throws on weird input: empty, whitespace-only, and multi-kilobyte strings all return null
 * (or a match found within the inspected prefix).
 */
export function matchJoinKeyword(pack, rawText) {
    if (typeof rawText !== 'string') {
        return null;
    }
    const inspected = rawText.slice(0, MAX_JOIN_TEXT_INSPECT_LENGTH);
    const firstToken = inspected.trim().toLowerCase().split(/\s+/, 1)[0];
    if (firstToken === undefined || firstToken.length === 0) {
        return null;
    }
    return getKeywordIndex(pack).get(firstToken) ?? null;
}
