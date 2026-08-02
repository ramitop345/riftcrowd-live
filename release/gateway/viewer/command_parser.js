/**
 * CommandParser — parses join, mode-vote, and strategy commands from
 * normalized chat events (NormalizedLiveEvent).
 *
 * Parsing rules:
 * - Comment text capped at 200 chars (matching Phase 4/5/6 conventions).
 * - Case-insensitive first-token rule.
 * - Discriminated union return type: ParsedCommand.
 */
import { matchJoinKeyword } from '@riftcrowd/shared';
// ---------------------------------------------------------------------------
// Mode vote keyword mapping (same as match_director.ts)
// ---------------------------------------------------------------------------
const MODE_VOTE_KEYWORDS = {
    '1': 'countries',
    countries: 'countries',
    '2': 'animals',
    animals: 'animals',
    '3': 'fan_crews_original',
    clubs: 'fan_crews_original',
    '4': 'cities',
    cities: 'cities',
};
export class CommandParser {
    maxLength;
    strategyKeywords;
    syntheticFactionIds;
    constructor(opts) {
        this.maxLength = opts.chatCommandMaxLength;
        this.strategyKeywords = new Set(opts.strategyKeywords.map((k) => k.toLowerCase()));
        // Build lowercase → original mapping for synthetic faction matching
        this.syntheticFactionIds = new Map((opts.syntheticFactionIds ?? []).map((id) => [id.toLowerCase(), id]));
    }
    /**
     * Parses a chat event into a typed ParsedCommand.
     *
     * @param event — a NormalizedLiveEvent of type 'chat'.
     * @param pack — the current content pack (used for faction keyword matching).
     *   May be null if no pack is loaded (e.g., synthetic factions in Phase 6 mode).
     * @returns ParsedCommand discriminated union.
     */
    parse(event, pack) {
        const viewerId = event.user.id;
        const eventId = event.id;
        // Only chat events carry comments
        const raw = event.comment ?? '';
        if (raw.length === 0) {
            return { kind: 'unrecognized', viewerId, eventId };
        }
        // Cap at maxLength
        const capped = raw.slice(0, this.maxLength);
        const token = capped.trim().split(/\s+/)[0]?.toLowerCase();
        if (!token) {
            return { kind: 'unrecognized', viewerId, eventId };
        }
        // 1. Check mode vote keywords
        const mode = MODE_VOTE_KEYWORDS[token];
        if (mode) {
            return { kind: 'mode_vote', modeId: mode, viewerId, eventId };
        }
        // 2. Check faction keywords (via pack's matchJoinKeyword)
        if (pack) {
            const factionId = matchJoinKeyword(pack, raw);
            if (factionId) {
                return { kind: 'join_faction', factionId, viewerId, eventId };
            }
        }
        // 2b. Check synthetic faction IDs (fallback when no pack is loaded)
        if (!pack && this.syntheticFactionIds.size > 0) {
            const matchedId = this.syntheticFactionIds.get(token);
            if (matchedId) {
                return { kind: 'join_faction', factionId: matchedId, viewerId, eventId };
            }
        }
        // 3. Check strategy keywords
        if (this.strategyKeywords.has(token)) {
            return { kind: 'strategy', strategy: token, viewerId, eventId };
        }
        // 4. Unrecognized
        return { kind: 'unrecognized', viewerId, eventId };
    }
}
