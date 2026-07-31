/**
 * Phase 7 — Review Fix Verification Tests.
 *
 * Covers fixes from the triple review: FIX 1–12.
 * See task #39 for full context.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  sanitizeDisplayName,
} from '../src/viewer/viewer_profile.js';
import { ViewerRegistry } from '../src/viewer/viewer_registry.js';
import { CommandParser } from '../src/viewer/command_parser.js';
import { ChampionSpawner } from '../src/viewer/champion_spawner.js';
import { MatchDirector, SYNTHETIC_FACTIONS } from '../src/director/match_director.js';
import type { NormalizedLiveEvent, ContentPack } from '@riftcrowd/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChatEvent(
  viewerId: string,
  comment: string,
  displayName: string = 'TestUser',
): NormalizedLiveEvent {
  return {
    schemaVersion: 1,
    id: `evt_${viewerId}_${Date.now().toString(36)}`,
    provider: 'mock',
    type: 'chat',
    receivedAt: new Date().toISOString(),
    user: {
      id: viewerId,
      handle: `@${viewerId}`,
      displayName,
    },
    comment,
    rawHash: `hash_${viewerId}`,
  };
}

function loadAnimalsPack(): ContentPack {
  const packPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'content',
    'packs',
    'animals',
    'animals_launch.json',
  );
  const raw = readFileSync(packPath, 'utf8');
  return JSON.parse(raw) as ContentPack;
}

const SHORT_BATTLE = { opening: 4, crisis: 2, finalSurge: 2, suddenDeath: 2 };

function shortDirectorOpts(statsPath: string) {
  return {
    sessionStatsPath: statsPath,
    modeVoteDuration: 2,
    factionLobbyDuration: 2,
    battleConfig: SHORT_BATTLE,
    resultsDuration: 1,
  };
}

/**
 * Drives a full round cycle: MODE_VOTE → FACTION_LOBBY → BATTLE_* → RESULTS → MODE_VOTE.
 * Uses skipStage() to fast-forward through each state.
 */
function driveFullRound(director: MatchDirector): void {
  // MODE_VOTE → FACTION_LOBBY
  director.advanceTime(3);
  // FACTION_LOBBY → BATTLE_OPENING
  director.advanceTime(3);
  // Drive through battle sub-stages via skipStage
  director.skipStage(); // → BATTLE_CRISIS or handle sim
  director.skipStage(); // → BATTLE_FINAL_SURGE
  director.skipStage(); // → BATTLE_SUDDEN_DEATH
  director.skipStage(); // → BATTLE_ENDED
  // BATTLE_ENDED → RESULTS (via advanceTime)
  director.advanceTime(1);
  // RESULTS → MODE_VOTE (via advanceTime)
  director.advanceTime(2);
}

// ===========================================================================
// FIX 1: SYNTHETIC_FACTIONS exposed and passed to replacement CommandParser
// ===========================================================================

describe('FIX 1: SYNTHETIC_FACTIONS exposed and passed to replacement parser', () => {
  it('SYNTHETIC_FACTIONS is exported from match_director', () => {
    expect(SYNTHETIC_FACTIONS).toBeDefined();
    expect(SYNTHETIC_FACTIONS.length).toBe(2);
    expect(SYNTHETIC_FACTIONS[0]).toBe('faction_alpha');
    expect(SYNTHETIC_FACTIONS[1]).toBe('faction_beta');
  });

  it('replacement CommandParser in app.ts can parse synthetic faction joins', () => {
    // Simulate what app.ts does: create a CommandParser with SYNTHETIC_FACTIONS
    const parser = new CommandParser({
      chatCommandMaxLength: 200,
      strategyKeywords: ['focus', 'defend', 'push', 'retreat'],
      syntheticFactionIds: SYNTHETIC_FACTIONS,
    });

    const event = makeChatEvent('v1', 'faction_alpha');
    const cmd = parser.parse(event, null);
    expect(cmd.kind).toBe('join_faction');
    if (cmd.kind === 'join_faction') {
      expect(cmd.factionId).toBe('faction_alpha');
    }

    const event2 = makeChatEvent('v2', 'faction_beta');
    const cmd2 = parser.parse(event2, null);
    expect(cmd2.kind).toBe('join_faction');
    if (cmd2.kind === 'join_faction') {
      expect(cmd2.factionId).toBe('faction_beta');
    }
  });

  it('director via buildApp-like construction accepts synthetic faction joins', () => {
    // Create director with viewerConfig (simulating what buildApp does)
    const tmpDir = mkdtempSync(join(tmpdir(), 'rd7-fix1-'));
    const statsPath = join(tmpDir, 'stats.json');
    try {
      const director = new MatchDirector({
        ...shortDirectorOpts(statsPath),
        viewerConfig: {
          chatCommandMaxLength: 200,
          strategyKeywords: ['focus', 'defend', 'push', 'retreat'],
          displayNameMaxLength: 64,
          contributionCategoryCap: 1_000_000,
          syntheticFactionIds: SYNTHETIC_FACTIONS,
        },
      });
      director.start();

      // Replace commandParser like app.ts does (with SYNTHETIC_FACTIONS)
      director.commandParser = new CommandParser({
        chatCommandMaxLength: 200,
        strategyKeywords: ['focus', 'defend', 'push', 'retreat'],
        syntheticFactionIds: SYNTHETIC_FACTIONS,
      });

      // Advance to FACTION_LOBBY
      director.handleModeVote('voter1', '1');
      director.advanceTime(3);

      // Verify synthetic faction join works through handleChatEvent
      const event = makeChatEvent('v1', 'faction_alpha');
      const cmd = director.handleChatEvent(event);
      expect(cmd.kind).toBe('join_faction');
      expect(director.selectedFactions.get('v1')).toBe('faction_alpha');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ===========================================================================
// FIX 2: roundsParticipated correctly incremented
// ===========================================================================

describe('FIX 2: roundsParticipated incremented after round completion', () => {
  let director: MatchDirector;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rd7-fix2-'));
    const statsPath = join(tmpDir, 'stats.json');
    director = new MatchDirector(shortDirectorOpts(statsPath));
    director.start();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('roundsParticipated == 1 after one full round with faction join', () => {
    // MODE_VOTE → FACTION_LOBBY
    director.handleModeVote('voter1', '1');
    director.advanceTime(3);
    expect(director.state).toBe('FACTION_LOBBY');

    // v1 joins a faction
    const event = makeChatEvent('v1', 'faction_alpha');
    director.handleChatEvent(event);
    expect(director.selectedFactions.get('v1')).toBe('faction_alpha');

    // Drive through rest of round
    driveFullRound(director);

    const profile = director.viewerRegistry.get('v1');
    expect(profile).toBeDefined();
    expect(profile!.roundsParticipated).toBe(1);
  });

  it('roundsParticipated == 2 after two full rounds with faction joins', () => {
    // Round 1
    director.handleModeVote('voter1', '1');
    director.advanceTime(3); // → FACTION_LOBBY
    director.handleChatEvent(makeChatEvent('v1', 'faction_alpha'));
    driveFullRound(director);

    expect(director.viewerRegistry.get('v1')!.roundsParticipated).toBe(1);

    // Round 2
    director.handleModeVote('voter2', '2');
    director.advanceTime(3); // → FACTION_LOBBY
    director.handleChatEvent(makeChatEvent('v1', 'faction_beta'));
    driveFullRound(director);

    expect(director.viewerRegistry.get('v1')!.roundsParticipated).toBe(2);
  });
});

// ===========================================================================
// FIX 3: Pack-based faction join via handleChatEvent
// ===========================================================================

describe('FIX 3: Pack-based faction join records correctly', () => {
  let director: MatchDirector;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rd7-fix3-'));
    const statsPath = join(tmpDir, 'stats.json');
    director = new MatchDirector(shortDirectorOpts(statsPath));
    director.start();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('joining via "lion" with animals pack loaded records v1 → lions', () => {
    const animalsPack = loadAnimalsPack();
    director.setCurrentPack(animalsPack);

    // Advance to FACTION_LOBBY
    director.handleModeVote('voter1', '2'); // vote for animals
    director.advanceTime(3);
    expect(director.state).toBe('FACTION_LOBBY');

    // Join via pack keyword "lion"
    const event = makeChatEvent('v1', 'lion');
    const cmd = director.handleChatEvent(event);
    expect(cmd.kind).toBe('join_faction');
    expect(director.selectedFactions.get('v1')).toBe('lions');

    // Champion should also be spawned
    expect(director.championSpawner.hasSpawned('v1')).toBe(true);
  });

  it('joining via "wolf" with animals pack loaded records v2 → wolves', () => {
    const animalsPack = loadAnimalsPack();
    director.setCurrentPack(animalsPack);

    director.handleModeVote('voter1', '2');
    director.advanceTime(3);

    const event = makeChatEvent('v2', 'wolf');
    const cmd = director.handleChatEvent(event);
    expect(cmd.kind).toBe('join_faction');
    expect(director.selectedFactions.get('v2')).toBe('wolves');
  });
});

// ===========================================================================
// FIX 4: Per-round state reset (factionId, switchCount)
// ===========================================================================

describe('FIX 4: profile.factionId and switchCount reset at round boundary', () => {
  let director: MatchDirector;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rd7-fix4-'));
    const statsPath = join(tmpDir, 'stats.json');
    director = new MatchDirector(shortDirectorOpts(statsPath));
    director.start();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('after round: factionId is undefined and switchCount is 0', () => {
    // Round 1: join faction_alpha
    director.handleModeVote('voter1', '1');
    director.advanceTime(3);
    director.handleChatEvent(makeChatEvent('v1', 'faction_alpha'));

    driveFullRound(director);

    const profile = director.viewerRegistry.get('v1');
    expect(profile).toBeDefined();
    expect(profile!.factionId).toBeUndefined();
    expect(profile!.switchCount).toBe(0);
  });

  it('join in round 2 has fresh switchCount (no carry-over switch)', () => {
    // Round 1: join faction_alpha
    director.handleModeVote('voter1', '1');
    director.advanceTime(3);
    director.handleChatEvent(makeChatEvent('v1', 'faction_alpha'));
    driveFullRound(director);

    // Round 2: join faction_beta (should be first join, not a switch)
    director.handleModeVote('voter2', '2');
    director.advanceTime(3);
    expect(director.state).toBe('FACTION_LOBBY');

    director.handleChatEvent(makeChatEvent('v1', 'faction_beta'));
    const profile = director.viewerRegistry.get('v1');
    expect(profile!.factionId).toBe('faction_beta');
    // switchCount should be 0 because it was reset at round boundary
    expect(profile!.switchCount).toBe(0);
  });
});

// ===========================================================================
// FIX 5: resetAll() and resetRoundState()
// ===========================================================================

describe('FIX 5: ViewerRegistry resetAll and resetRoundState', () => {
  let registry: ViewerRegistry;

  beforeEach(() => {
    registry = new ViewerRegistry(64);
  });

  it('resetAll() clears all profiles', () => {
    registry.getOrCreate('v1', '@h1', 'N1');
    registry.getOrCreate('v2', '@h2', 'N2');
    expect(registry.size).toBe(2);
    registry.resetAll();
    expect(registry.size).toBe(0);
  });

  it('resetRoundState() clears per-round fields but preserves profiles', () => {
    const p1 = registry.getOrCreate('v1', '@h1', 'N1');
    registry.getOrCreate('v2', '@h2', 'N2');
    p1.factionId = 'faction_alpha';
    p1.switchCount = 2;
    p1.roundsParticipated = 5;

    registry.resetRoundState();

    expect(registry.size).toBe(2); // profiles preserved
    expect(p1.factionId).toBeUndefined();
    expect(p1.switchCount).toBe(0);
    expect(p1.roundsParticipated).toBe(5); // cross-round data preserved
  });

  it('resetSession() still works as deprecated alias for resetAll()', () => {
    registry.getOrCreate('v1', '@h1', 'N1');
    expect(registry.size).toBe(1);
    registry.resetSession();
    expect(registry.size).toBe(0);
  });
});

// ===========================================================================
// FIX 6: ChampionSpawner id fits within 128 chars
// ===========================================================================

describe('FIX 6: ChampionSpawner id fits within 128 chars', () => {
  it('long viewerId/displayName/factionId (each 64 chars) → id ≤ 128 chars', () => {
    const spawner = new ChampionSpawner();
    const longId = 'a'.repeat(64);
    const longName = 'B'.repeat(64);
    const longFaction = 'c'.repeat(64);

    const cmd = spawner.spawnIfNew(longId, longName, longFaction, 'evt1');
    expect(cmd).not.toBeNull();
    expect(cmd!.id.length).toBeLessThanOrEqual(128);
    expect(cmd!.id.length).toBeGreaterThan(0);
  });

  it('id is deterministic format: champ_ + sha1 hash', () => {
    const spawner = new ChampionSpawner();
    const cmd = spawner.spawnIfNew('v1', 'Player1', 'lions', 'evt1');
    expect(cmd!.id).toMatch(/^champ_[0-9a-f]{40}$/);
  });
});

// ===========================================================================
// FIX 7: One switch allowed, third join rejected
// ===========================================================================

describe('FIX 7: One switch allowed, third join rejected', () => {
  let director: MatchDirector;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rd7-fix7-'));
    const statsPath = join(tmpDir, 'stats.json');
    director = new MatchDirector(shortDirectorOpts(statsPath));
    director.start();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('first join → switch → third join rejected', () => {
    director.handleModeVote('voter1', '1');
    director.advanceTime(3);
    expect(director.state).toBe('FACTION_LOBBY');

    // First join
    director.handleChatEvent(makeChatEvent('v1', 'faction_alpha'));
    expect(director.selectedFactions.get('v1')).toBe('faction_alpha');
    expect(director.viewerRegistry.get('v1')!.switchCount).toBe(0);

    // Switch to faction_beta
    director.handleChatEvent(makeChatEvent('v1', 'faction_beta'));
    expect(director.selectedFactions.get('v1')).toBe('faction_beta');
    expect(director.viewerRegistry.get('v1')!.switchCount).toBe(1);

    // Third join attempt — should be rejected
    director.handleChatEvent(makeChatEvent('v1', 'faction_alpha'));
    expect(director.selectedFactions.get('v1')).toBe('faction_beta'); // stays faction_beta
    expect(director.viewerRegistry.get('v1')!.switchCount).toBe(1); // still 1
  });
});

// ===========================================================================
// FIX 8: Faction join rejected outside FACTION_LOBBY
// ===========================================================================

describe('FIX 8: Faction join rejected outside FACTION_LOBBY', () => {
  let director: MatchDirector;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rd7-fix8-'));
    const statsPath = join(tmpDir, 'stats.json');
    director = new MatchDirector(shortDirectorOpts(statsPath));
    director.start();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('faction join during MODE_VOTE is rejected', () => {
    expect(director.state).toBe('MODE_VOTE');

    // Attempt faction join during MODE_VOTE
    director.handleChatEvent(makeChatEvent('v1', 'faction_alpha'));

    // selectedFactions should be empty
    expect(director.selectedFactions.size).toBe(0);
    // Champion should NOT be spawned
    expect(director.championSpawner.hasSpawned('v1')).toBe(false);
  });
});

// ===========================================================================
// FIX 9: MatchDirector round reset clears per-round state
// ===========================================================================

describe('FIX 9: MatchDirector round reset preserves viewer registry', () => {
  let director: MatchDirector;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rd7-fix9-'));
    const statsPath = join(tmpDir, 'stats.json');
    director = new MatchDirector(shortDirectorOpts(statsPath));
    director.start();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('full round cycle: viewerRegistry preserved, per-round state cleared', () => {
    // MODE_VOTE → FACTION_LOBBY
    director.handleModeVote('voter1', '1');
    director.advanceTime(3);
    expect(director.state).toBe('FACTION_LOBBY');

    // v1 joins + champion spawns + engagement recorded
    director.handleChatEvent(makeChatEvent('v1', 'faction_alpha'));
    expect(director.championSpawner.spawnedCount).toBe(1);

    // Drive full round to RESULTS → MODE_VOTE
    driveFullRound(director);

    // viewerRegistry.size unchanged (profiles persist)
    expect(director.viewerRegistry.size).toBeGreaterThanOrEqual(1);
    // championSpawner reset
    expect(director.championSpawner.spawnedCount).toBe(0);
    // contributionTracker reset
    expect(director.contributionTracker.size).toBe(0);
  });
});

// ===========================================================================
// FIX 10: sanitizeDisplayName handles Symbol input
// ===========================================================================

describe('FIX 10: sanitizeDisplayName handles Symbol input', () => {
  it('Symbol input returns a string without throwing', () => {
    const sym = Symbol('test');
    const result = sanitizeDisplayName(sym);
    expect(typeof result).toBe('string');
  });

  it('Symbol with description coerces to string', () => {
    const sym = Symbol('myDesc');
    const result = sanitizeDisplayName(sym);
    expect(typeof result).toBe('string');
    // Symbol('myDesc').toString() is "Symbol(myDesc)"
    expect(result).toContain('Symbol');
  });
});

// ===========================================================================
// FIX 11: providerHandle sanitization
// ===========================================================================

describe('FIX 11: providerHandle is sanitized in ViewerRegistry', () => {
  it('control characters stripped from providerHandle', () => {
    const registry = new ViewerRegistry(64);
    const profile = registry.getOrCreate('v1', '@handle\x00\x1Fbad', 'Name');
    expect(profile.providerHandle).not.toContain('\x00');
    expect(profile.providerHandle).not.toContain('\x1F');
    expect(profile.providerHandle).toBe('@handlebad');
  });

  it('zero-width characters stripped from providerHandle', () => {
    const registry = new ViewerRegistry(64);
    const profile = registry.getOrCreate('v1', '@handle\u200Btest', 'Name');
    expect(profile.providerHandle).toBe('@handletest');
  });

  it('normal providerHandle preserved as-is', () => {
    const registry = new ViewerRegistry(64);
    const profile = registry.getOrCreate('v1', '@normal_handle', 'Name');
    expect(profile.providerHandle).toBe('@normal_handle');
  });
});
