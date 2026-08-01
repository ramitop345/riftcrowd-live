/**
 * CommandParser — parses join, mode-vote, and strategy commands from
 * normalized chat events (NormalizedLiveEvent).
 *
 * Parsing rules:
 * - Comment text capped at 200 chars (matching Phase 4/5/6 conventions).
 * - Case-insensitive first-token rule.
 * - Discriminated union return type: ParsedCommand.
 */

import type { NormalizedLiveEvent, ContentPack } from '@riftcrowd/shared';
import { matchJoinKeyword, type ContentPackMode } from '@riftcrowd/shared';

// ---------------------------------------------------------------------------
// Mode vote keyword mapping (same as match_director.ts)
// ---------------------------------------------------------------------------

const MODE_VOTE_KEYWORDS: Record<string, ContentPackMode> = {
  '1': 'countries',
  countries: 'countries',
  '2': 'animals',
  animals: 'animals',
  '3': 'fan_crews_original',
  clubs: 'fan_crews_original',
  '4': 'cities',
  cities: 'cities',
};

// ---------------------------------------------------------------------------
// Parsed command discriminated union
// ---------------------------------------------------------------------------

export interface ModeVoteCommand {
  kind: 'mode_vote';
  modeId: ContentPackMode;
  viewerId: string;
  eventId: string;
}

export interface JoinFactionCommand {
  kind: 'join_faction';
  factionId: string;
  viewerId: string;
  eventId: string;
}

export interface StrategyCommand {
  kind: 'strategy';
  strategy: string;
  viewerId: string;
  eventId: string;
}

export interface UnrecognizedCommand {
  kind: 'unrecognized';
  viewerId: string;
  eventId: string;
}

export type ParsedCommand =
  | ModeVoteCommand
  | JoinFactionCommand
  | StrategyCommand
  | UnrecognizedCommand;

// ---------------------------------------------------------------------------
// CommandParser class
// ---------------------------------------------------------------------------

export interface CommandParserOptions {
  /** Maximum chat text length to inspect (default 200). */
  chatCommandMaxLength: number;
  /** Strategy keywords recognized in addition to mode/faction keywords. */
  strategyKeywords: readonly string[];
  /** Synthetic faction IDs to match when no ContentPack is set (e.g., Phase 6 mode). */
  syntheticFactionIds?: readonly string[];
}

export class CommandParser {
  private readonly maxLength: number;
  private readonly strategyKeywords: Set<string>;
  private readonly syntheticFactionIds: Map<string, string>;

  constructor(opts: CommandParserOptions) {
    this.maxLength = opts.chatCommandMaxLength;
    this.strategyKeywords = new Set(opts.strategyKeywords.map((k) => k.toLowerCase()));
    // Build lowercase → original mapping for synthetic faction matching
    this.syntheticFactionIds = new Map(
      (opts.syntheticFactionIds ?? []).map((id) => [id.toLowerCase(), id]),
    );
  }

  /**
   * Parses a chat event into a typed ParsedCommand.
   *
   * @param event — a NormalizedLiveEvent of type 'chat'.
   * @param pack — the current content pack (used for faction keyword matching).
   *   May be null if no pack is loaded (e.g., synthetic factions in Phase 6 mode).
   * @returns ParsedCommand discriminated union.
   */
  parse(event: NormalizedLiveEvent, pack: ContentPack | null): ParsedCommand {
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
