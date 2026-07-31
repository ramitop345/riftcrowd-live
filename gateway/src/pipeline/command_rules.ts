/**
 * CommandRules — rule engine that maps NormalizedLiveEvents to GameCommands.
 *
 * Rules are applied in order. Each rule may produce 0, 1, or many commands.
 * A single event may trigger multiple rules.
 *
 * Built-in rules:
 *   ModeVoteRule — chat event with mode keyword → null (director handles it)
 *   JoinFactionRule — chat event with faction keyword → JOIN_FACTION command
 *   EndRoundRule — creator command END_ROUND → END_ROUND command
 *   PauseRule — creator command PAUSE_EVENTS → PAUSE_EVENTS command
 *   KickRule — creator command KICK_PLAYER → null (director.hideViewer handles it)
 */

import {
  COMMAND_SCHEMA_VERSION,
  type GameCommand,
  type GameCommandType,
  type NormalizedLiveEvent,
} from '@riftcrowd/shared';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Rule interface
// ---------------------------------------------------------------------------

export interface RuleContext {
  /** Optional director for side-effects (not used by rules, but available). */
  [key: string]: unknown;
}

export interface Rule {
  name: string;
  applies(event: NormalizedLiveEvent): boolean;
  execute(event: NormalizedLiveEvent, context: RuleContext): GameCommand[] | null;
}

// ---------------------------------------------------------------------------
// Helper: create a GameCommand
// ---------------------------------------------------------------------------

function makeCommand(
  type: GameCommandType,
  event: NormalizedLiveEvent,
  extra?: Partial<Omit<GameCommand, 'schemaVersion' | 'id' | 'type' | 'createdAt' | 'sourceEventIds'>>,
): GameCommand {
  return {
    schemaVersion: COMMAND_SCHEMA_VERSION,
    id: `cmd_${randomUUID()}`,
    type,
    createdAt: new Date().toISOString(),
    sourceEventIds: [event.id],
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Mode vote keywords (same as match_director.ts)
// ---------------------------------------------------------------------------

const MODE_VOTE_KEYWORDS = new Set([
  '1', 'countries',
  '2', 'animals',
  '3', 'fan_crews_original', 'clubs',
  '4', 'cities',
]);

// ---------------------------------------------------------------------------
// Synthetic faction keywords
// ---------------------------------------------------------------------------

const SYNTHETIC_FACTION_KEYWORDS = new Map<string, string>([
  ['faction_alpha', 'faction_alpha'],
  ['faction_beta', 'faction_beta'],
]);

// ---------------------------------------------------------------------------
// Built-in rules
// ---------------------------------------------------------------------------

/**
 * ModeVoteRule: chat event with a mode keyword in the comment.
 * Returns null — the director handles mode votes via handleChatEvent.
 */
export const ModeVoteRule: Rule = {
  name: 'ModeVoteRule',
  applies(event) {
    if (event.type !== 'chat' || !event.comment) return false;
    const token = event.comment.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    return MODE_VOTE_KEYWORDS.has(token);
  },
  execute() {
    return null; // Director handles mode votes
  },
};

/**
 * JoinFactionRule: chat event with a faction keyword in the comment.
 * Returns a JOIN_FACTION command.
 */
export const JoinFactionRule: Rule = {
  name: 'JoinFactionRule',
  applies(event) {
    if (event.type !== 'chat' || !event.comment) return false;
    const token = event.comment.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    return SYNTHETIC_FACTION_KEYWORDS.has(token);
  },
  execute(event) {
    const token = event.comment!.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    const factionId = SYNTHETIC_FACTION_KEYWORDS.get(token);
    if (!factionId) return null;
    return [
      makeCommand('JOIN_FACTION', event, {
        factionId,
        viewerId: event.user.id,
        displayName: event.user.displayName,
      }),
    ];
  },
};

/**
 * EndRoundRule: chat or provider_status event with comment "!end_round" or "END_ROUND".
 * Returns an END_ROUND command.
 */
export const EndRoundRule: Rule = {
  name: 'EndRoundRule',
  applies(event) {
    const comment = event.comment?.trim().toLowerCase();
    return comment === '!end_round' || comment === 'end_round';
  },
  execute(event) {
    return [makeCommand('END_ROUND', event)];
  },
};

/**
 * PauseRule: chat or provider_status event with comment "!pause" or "PAUSE_EVENTS".
 * Returns a PAUSE_EVENTS command.
 */
export const PauseRule: Rule = {
  name: 'PauseRule',
  applies(event) {
    const comment = event.comment?.trim().toLowerCase();
    return comment === '!pause' || comment === 'pause_events';
  },
  execute(event) {
    return [makeCommand('PAUSE_EVENTS', event)];
  },
};

/**
 * KickRule: chat event with comment starting with "!kick ".
 * Returns null — the pipeline calls director.hideViewer() directly.
 */
export const KickRule: Rule = {
  name: 'KickRule',
  applies(event) {
    if (event.type !== 'chat' || !event.comment) return false;
    return event.comment.trim().toLowerCase().startsWith('!kick ');
  },
  execute() {
    return null; // Pipeline handles kick via director.hideViewer()
  },
};

// ---------------------------------------------------------------------------
// CommandRulesEngine
// ---------------------------------------------------------------------------

export class CommandRulesEngine {
  private rules: Rule[] = [];

  constructor() {
    // Register built-in rules by default
    this.rules = [ModeVoteRule, JoinFactionRule, EndRoundRule, PauseRule, KickRule];
  }

  /** Registers a custom rule. */
  registerRule(rule: Rule): void {
    this.rules.push(rule);
  }

  /** Clears all rules. */
  clearRules(): void {
    this.rules = [];
  }

  /** Returns all registered rules. */
  getRules(): readonly Rule[] {
    return this.rules;
  }

  /**
   * Evaluates all rules against an event and returns all produced commands.
   * Rules that don't apply or return null contribute nothing.
   */
  evaluate(event: NormalizedLiveEvent, context: RuleContext = {}): GameCommand[] {
    const commands: GameCommand[] = [];

    for (const rule of this.rules) {
      if (!rule.applies(event)) continue;

      try {
        const result = rule.execute(event, context);
        if (result) {
          commands.push(...result);
        }
      } catch {
        // Rule errors are swallowed — never crash the pipeline
      }
    }

    return commands;
  }

  /**
   * Extracts the target viewerId from a kick command comment.
   * Returns null if not a kick command.
   */
  static extractKickTarget(event: NormalizedLiveEvent): string | null {
    if (event.type !== 'chat' || !event.comment) return null;
    const trimmed = event.comment.trim();
    if (!trimmed.toLowerCase().startsWith('!kick ')) return null;
    const target = trimmed.slice(6).trim();
    return target.length > 0 ? target : null;
  }
}
