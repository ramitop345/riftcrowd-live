import { z } from 'zod';
/**
 * Version of the content-pack format. Bump this whenever a field is renamed, retyped, or removed.
 * Additive optional fields do not require a bump. The loader rejects unknown versions.
 */
export declare const CONTENT_PACK_SCHEMA_VERSION = 1;
/** Every launch mode a content pack may target. Adding a mode means adding a member here. */
export declare const ContentPackModeSchema: z.ZodEnum<["countries", "animals", "fan_crews_original", "cities"]>;
/**
 * One faction inside a pack. Pack data is authored, but it still crosses a trust boundary into the
 * game, so every string is bounded and shaped; anything else is rejected, not truncated.
 */
export declare const FactionSchema: z.ZodObject<{
    id: z.ZodString;
    displayName: z.ZodString;
    joinKeywords: z.ZodArray<z.ZodString, "many">;
    primaryColor: z.ZodString;
    secondaryColor: z.ZodString;
    pattern: z.ZodString;
    captainScene: z.ZodString;
    ultimateId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    id: string;
    displayName: string;
    joinKeywords: string[];
    primaryColor: string;
    secondaryColor: string;
    pattern: string;
    captainScene: string;
    ultimateId: string;
}, {
    id: string;
    displayName: string;
    joinKeywords: string[];
    primaryColor: string;
    secondaryColor: string;
    pattern: string;
    captainScene: string;
    ultimateId: string;
}>;
/**
 * One themed content pack. The format allows two to four factions (the MVP renders two); the four
 * launch packs each ship four. Cross-field rules enforced by `superRefine`:
 * - faction ids are unique within the pack;
 * - join keywords are unique case-insensitively across ALL factions in the pack, so a comment can
 *   never be ambiguous about which faction it joins.
 */
export declare const ContentPackSchema: z.ZodEffects<z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    id: z.ZodString;
    displayName: z.ZodString;
    mode: z.ZodEnum<["countries", "animals", "fan_crews_original", "cities"]>;
    factions: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        joinKeywords: z.ZodArray<z.ZodString, "many">;
        primaryColor: z.ZodString;
        secondaryColor: z.ZodString;
        pattern: z.ZodString;
        captainScene: z.ZodString;
        ultimateId: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        id: string;
        displayName: string;
        joinKeywords: string[];
        primaryColor: string;
        secondaryColor: string;
        pattern: string;
        captainScene: string;
        ultimateId: string;
    }, {
        id: string;
        displayName: string;
        joinKeywords: string[];
        primaryColor: string;
        secondaryColor: string;
        pattern: string;
        captainScene: string;
        ultimateId: string;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    schemaVersion: 1;
    id: string;
    displayName: string;
    mode: "countries" | "animals" | "fan_crews_original" | "cities";
    factions: {
        id: string;
        displayName: string;
        joinKeywords: string[];
        primaryColor: string;
        secondaryColor: string;
        pattern: string;
        captainScene: string;
        ultimateId: string;
    }[];
}, {
    schemaVersion: 1;
    id: string;
    displayName: string;
    mode: "countries" | "animals" | "fan_crews_original" | "cities";
    factions: {
        id: string;
        displayName: string;
        joinKeywords: string[];
        primaryColor: string;
        secondaryColor: string;
        pattern: string;
        captainScene: string;
        ultimateId: string;
    }[];
}>, {
    schemaVersion: 1;
    id: string;
    displayName: string;
    mode: "countries" | "animals" | "fan_crews_original" | "cities";
    factions: {
        id: string;
        displayName: string;
        joinKeywords: string[];
        primaryColor: string;
        secondaryColor: string;
        pattern: string;
        captainScene: string;
        ultimateId: string;
    }[];
}, {
    schemaVersion: 1;
    id: string;
    displayName: string;
    mode: "countries" | "animals" | "fan_crews_original" | "cities";
    factions: {
        id: string;
        displayName: string;
        joinKeywords: string[];
        primaryColor: string;
        secondaryColor: string;
        pattern: string;
        captainScene: string;
        ultimateId: string;
    }[];
}>;
export type ContentPackMode = z.infer<typeof ContentPackModeSchema>;
export type Faction = z.infer<typeof FactionSchema>;
export type ContentPack = z.infer<typeof ContentPackSchema>;
/** All pack modes as a plain array, useful for exhaustive tests and directory validation. */
export declare const CONTENT_PACK_MODES: readonly ContentPackMode[];
/**
 * Comment text is untrusted provider input; only this many leading characters are ever inspected
 * by {@link matchJoinKeyword}. Longer input is not an error — the tail is simply ignored.
 */
export declare const MAX_JOIN_TEXT_INSPECT_LENGTH = 200;
/**
 * Builds the lookup used to resolve a viewer comment to a faction: lowercased join keyword ->
 * faction id.
 *
 * Throws if two factions claim the same keyword case-insensitively. For a pack that passed
 * {@link ContentPackSchema} this is unreachable (the schema rejects such packs); the throw exists
 * so an unvalidated or hand-built pack fails loudly instead of silently favouring one faction.
 */
export declare function buildKeywordIndex(pack: ContentPack): Map<string, string>;
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
export declare function matchJoinKeyword(pack: ContentPack, rawText: string): string | null;
