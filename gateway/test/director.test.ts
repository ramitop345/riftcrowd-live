/**
 * Phase 6 — Match Director acceptance tests.
 *
 * Covers: MockSimulation, SessionStats, MatchDirector state machine,
 * mode vote tie-breaking, faction join rules, creator commands, and
 * the 10-round acceptance test.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  MockSimulation,
  type BattleConfig,
} from '../src/director/mock_simulation.js';
import {
  defaultStats,
  loadStats,
  recordRound,
  saveStats,
  SessionStatsSchema,
} from '../src/director/session_stats.js';
import {
  MatchDirector,
  type Announcement,
  type MatchDirectorOptions,
} from '../src/director/match_director.js';
import { buildApp } from '../src/app.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHORT_BATTLE: BattleConfig = { opening: 4, crisis: 2, finalSurge: 2, suddenDeath: 2 };

function shortDirectorOpts(statsPath: string): MatchDirectorOptions {
  return {
    sessionStatsPath: statsPath,
    modeVoteDuration: 2,
    factionLobbyDuration: 2,
    battleConfig: SHORT_BATTLE,
    resultsDuration: 1,
  };
}

/** Drives the director through one full round (MODE_VOTE → RESULTS). */
function driveOneRound(
  director: MatchDirector,
  opts?: { mode?: string; faction?: string },
): void {
  const mode = opts?.mode ?? '1';
  const faction = opts?.faction ?? 'faction_alpha';

  // MODE_VOTE: vote + advance timer
  director.handleModeVote('voter1', mode);
  director.advanceTime(3);

  // FACTION_LOBBY: join + advance timer
  director.handleFactionJoin('viewer1', faction);
  director.advanceTime(3);

  // BATTLE stages: advance through all 4 sub-stages
  // Total battle time = opening + crisis + finalSurge + suddenDeath seconds
  const totalBattle = SHORT_BATTLE.opening + SHORT_BATTLE.crisis + SHORT_BATTLE.finalSurge + SHORT_BATTLE.suddenDeath;
  // Advance in small increments to let mock sim tick
  for (let t = 0; t < totalBattle + 2; t += 0.5) {
    if (director.state === 'RESULTS' || director.state === 'MODE_VOTE') break;
    director.advanceTime(0.5);
  }

  // RESULTS: advance timer
  if (director.state === 'RESULTS') {
    director.advanceTime(2);
  }
}

// ===========================================================================
// MockSimulation tests
// ===========================================================================

describe('MockSimulation', () => {
  it('determinism: same seed produces identical snapshots over 400 ticks', () => {
    const sim1 = new MockSimulation(42, SHORT_BATTLE);
    const sim2 = new MockSimulation(42, SHORT_BATTLE);
    for (let i = 0; i < 400; i++) {
      const s1 = sim1.tick();
      const s2 = sim2.tick();
      expect(JSON.stringify(s1)).toBe(JSON.stringify(s2));
    }
  });

  it('different seeds diverge', () => {
    const sim1 = new MockSimulation(1, SHORT_BATTLE);
    const sim2 = new MockSimulation(2, SHORT_BATTLE);
    let diverged = false;
    for (let i = 0; i < 100; i++) {
      const s1 = sim1.tick();
      const s2 = sim2.tick();
      if (JSON.stringify(s1) !== JSON.stringify(s2)) {
        diverged = true;
        break;
      }
    }
    expect(diverged).toBe(true);
  });

  it('stage progression: opening → crisis → final_surge → sudden_death → ended', () => {
    const sim = new MockSimulation(99, SHORT_BATTLE);
    const stages: string[] = [];
    let prevStage = '';
    for (let i = 0; i < 10_000; i++) {
      const snap = sim.tick();
      if (snap.stage !== prevStage) {
        stages.push(snap.stage);
        prevStage = snap.stage;
      }
      if (sim.is_round_over()) break;
    }
    expect(stages).toEqual(['opening', 'crisis', 'final_surge', 'sudden_death', 'ended']);
  });

  it('emits boss_spawned event at crisis start', () => {
    const sim = new MockSimulation(7, SHORT_BATTLE);
    let found = false;
    for (let i = 0; i < 10_000; i++) {
      const snap = sim.tick();
      if (snap.events.includes('boss_spawned')) {
        found = true;
        expect(snap.stage).toBe('crisis');
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('emits victory event at ended stage', () => {
    const sim = new MockSimulation(7, SHORT_BATTLE);
    let found = false;
    for (let i = 0; i < 10_000; i++) {
      const snap = sim.tick();
      if (snap.events.some((e) => e.startsWith('victory:'))) {
        found = true;
        expect(snap.stage).toBe('ended');
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('is_round_over returns true when stage is ended', () => {
    const sim = new MockSimulation(1, { opening: 1, crisis: 1, finalSurge: 1, suddenDeath: 1 });
    for (let i = 0; i < 10_000; i++) {
      sim.tick();
      if (sim.is_round_over()) break;
    }
    expect(sim.is_round_over()).toBe(true);
  });

  it('snapshot shape has all required fields', () => {
    const sim = new MockSimulation(1, SHORT_BATTLE);
    const snap = sim.tick();
    expect(snap).toHaveProperty('tick');
    expect(snap).toHaveProperty('elapsed');
    expect(snap).toHaveProperty('stage');
    expect(snap).toHaveProperty('stage_time_left');
    expect(snap).toHaveProperty('dominion');
    expect(snap).toHaveProperty('fortress_health');
    expect(snap).toHaveProperty('capture_pressure');
    expect(snap).toHaveProperty('winner');
    expect(snap).toHaveProperty('victory_type');
    expect(snap).toHaveProperty('units');
    expect(snap).toHaveProperty('projectiles');
    expect(snap).toHaveProperty('events');
    expect(snap).toHaveProperty('pool_stats');
  });

  it('units array has placeholder entries', () => {
    const sim = new MockSimulation(1, SHORT_BATTLE);
    const snap = sim.tick();
    expect(snap.units.length).toBeGreaterThanOrEqual(1);
    expect(snap.units[0]).toHaveProperty('id');
    expect(snap.units[0]).toHaveProperty('kind');
    expect(snap.units[0]).toHaveProperty('faction');
  });

  it('tick count increments correctly', () => {
    const sim = new MockSimulation(1, SHORT_BATTLE);
    expect(sim.get_tick()).toBe(0);
    sim.tick();
    expect(sim.get_tick()).toBe(1);
    sim.tick();
    expect(sim.get_tick()).toBe(2);
  });

  it('opening duration at 20Hz: 120s = 2400 ticks', () => {
    const config: BattleConfig = { opening: 120, crisis: 60, finalSurge: 60, suddenDeath: 45 };
    const sim = new MockSimulation(1, config);
    for (let i = 0; i < 2399; i++) {
      const snap = sim.tick();
      expect(snap.stage).toBe('opening');
    }
    const snap = sim.tick(); // tick 2400 → should transition to crisis
    expect(snap.stage).toBe('crisis');
  });

  it('forceStage: forces simulation to a specific stage', () => {
    const sim = new MockSimulation(1, SHORT_BATTLE);
    sim.tick(); // tick 1, still opening
    expect(sim.stage).toBe('opening');
    sim.forceStage('crisis');
    expect(sim.stage).toBe('crisis');
    sim.forceStage('ended');
    expect(sim.stage).toBe('ended');
    expect(sim.is_round_over()).toBe(true);
  });
});

// ===========================================================================
// SessionStats tests
// ===========================================================================

describe('SessionStats', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rd6-stats-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('load: missing file returns default', () => {
    const stats = loadStats(join(tmpDir, 'nonexistent.json'));
    expect(stats.roundsPlayed).toBe(0);
    expect(stats.modeCounts).toEqual({});
  });

  it('save + load round-trip preserves data', () => {
    const path = join(tmpDir, 'stats.json');
    const stats = recordRound(defaultStats(), 'countries', 'faction_alpha');
    saveStats(path, stats);
    const loaded = loadStats(path);
    expect(loaded.roundsPlayed).toBe(1);
    expect(loaded.modeCounts['countries']).toBe(1);
    expect(loaded.factionWinCounts['faction_alpha']).toBe(1);
  });

  it('corrupt JSON returns default + warning', () => {
    const path = join(tmpDir, 'stats.json');
    writeFileSync(path, '{ not valid json }', 'utf8');
    const stats = loadStats(path);
    expect(stats.roundsPlayed).toBe(0);
  });

  it('schema validation failure returns default', () => {
    const path = join(tmpDir, 'stats.json');
    writeFileSync(path, JSON.stringify({ schemaVersion: 99, roundsPlayed: -1 }), 'utf8');
    const stats = loadStats(path);
    expect(stats.roundsPlayed).toBe(0);
  });

  it('atomic write creates .tmp file then renames', () => {
    const path = join(tmpDir, 'stats.json');
    saveStats(path, defaultStats());
    expect(existsSync(path)).toBe(true);
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it('recordRound: roundsPlayed increments', () => {
    let stats = defaultStats();
    stats = recordRound(stats, 'countries', 'faction_alpha');
    expect(stats.roundsPlayed).toBe(1);
    stats = recordRound(stats, 'animals', 'faction_beta');
    expect(stats.roundsPlayed).toBe(2);
  });

  it('recordRound: modeCounts correct', () => {
    let stats = defaultStats();
    stats = recordRound(stats, 'countries', 'faction_alpha');
    stats = recordRound(stats, 'countries', 'faction_alpha');
    stats = recordRound(stats, 'animals', 'faction_beta');
    expect(stats.modeCounts['countries']).toBe(2);
    expect(stats.modeCounts['animals']).toBe(1);
  });

  it('recordRound: factionWinCounts correct', () => {
    let stats = defaultStats();
    stats = recordRound(stats, 'countries', 'faction_alpha');
    stats = recordRound(stats, 'animals', 'faction_alpha');
    expect(stats.factionWinCounts['faction_alpha']).toBe(2);
  });

  it('recordRound: recentModes capped at 10 with newest first', () => {
    let stats = defaultStats();
    for (let i = 0; i < 15; i++) {
      stats = recordRound(stats, `mode_${i}`, 'faction_alpha');
    }
    expect(stats.recentModes.length).toBe(10);
    expect(stats.recentModes[0]).toBe('mode_14');
    expect(stats.recentModes[9]).toBe('mode_5');
  });

  it('recordRound: does not mutate input', () => {
    const original = defaultStats();
    const updated = recordRound(original, 'countries', 'faction_alpha');
    expect(original.roundsPlayed).toBe(0);
    expect(updated.roundsPlayed).toBe(1);
  });

  it('strict schema: rejects unknown keys', () => {
    const statsWithExtra = {
      ...defaultStats(),
      unknownField: 'should be rejected',
    };
    const result = SessionStatsSchema.safeParse(statsWithExtra);
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// MatchDirector tests
// ===========================================================================

describe('MatchDirector', () => {
  let tmpDir: string;
  let statsPath: string;
  let announcements: Announcement[];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rd6-dir-'));
    statsPath = join(tmpDir, 'stats.json');
    announcements = [];
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeDirector(opts?: Partial<MatchDirectorOptions>): MatchDirector {
    return new MatchDirector({
      ...shortDirectorOpts(statsPath),
      ...opts,
      onAnnouncement: (a) => announcements.push(a),
    });
  }

  it('start transitions to MODE_VOTE', () => {
    const d = makeDirector();
    d.start();
    expect(d.state).toBe('MODE_VOTE');
    expect(d.timerSeconds).toBe(2);
  });

  it('state transitions: MODE_VOTE → FACTION_LOBBY → BATTLE_OPENING', () => {
    const d = makeDirector();
    d.start();
    d.handleModeVote('v1', '1');
    d.advanceTime(3);
    expect(d.state).toBe('FACTION_LOBBY');
    d.handleFactionJoin('v1', 'faction_alpha');
    d.advanceTime(3);
    expect(d.state).toBe('BATTLE_OPENING');
  });

  it('full round: MODE_VOTE through RESULTS and back to MODE_VOTE', () => {
    const d = makeDirector();
    d.start();
    driveOneRound(d);
    expect(d.state).toBe('MODE_VOTE');
    expect(d.stats.roundsPlayed).toBe(1);
  });

  it('announcements fire for each transition', () => {
    const d = makeDirector();
    d.start();
    driveOneRound(d);
    const kinds = announcements.map((a) => a.kind);
    expect(kinds).toContain('stage_changed');
    expect(kinds).toContain('mode_selected');
    expect(kinds).toContain('round_ended');
  });

  it('mode_selected announcement has correct shape', () => {
    const d = makeDirector();
    d.start();
    d.handleModeVote('v1', '1');
    d.advanceTime(3);
    const modeAnn = announcements.find((a) => a.kind === 'mode_selected');
    expect(modeAnn).toBeDefined();
    if (modeAnn?.kind === 'mode_selected') {
      expect(modeAnn.data.modeId).toBe('countries');
      expect(modeAnn.data.voteCounts['countries']).toBe(1);
    }
  });

  it('mode vote: duplicate viewer votes ignored (first vote wins)', () => {
    const d = makeDirector();
    d.start();
    d.handleModeVote('v1', '1');
    d.handleModeVote('v1', '2'); // should be ignored
    d.advanceTime(3);
    const modeAnn = announcements.find((a) => a.kind === 'mode_selected');
    if (modeAnn?.kind === 'mode_selected') {
      expect(modeAnn.data.modeId).toBe('countries');
    }
  });

  it('mode vote: case-insensitive keyword match', () => {
    const d = makeDirector();
    d.start();
    d.handleModeVote('v1', 'COUNTRIES');
    d.advanceTime(3);
    const modeAnn = announcements.find((a) => a.kind === 'mode_selected');
    if (modeAnn?.kind === 'mode_selected') {
      expect(modeAnn.data.modeId).toBe('countries');
    }
  });

  it('mode vote: clubs maps to fan_crews_original', () => {
    const d = makeDirector();
    d.start();
    d.handleModeVote('v1', 'clubs');
    d.advanceTime(3);
    const modeAnn = announcements.find((a) => a.kind === 'mode_selected');
    if (modeAnn?.kind === 'mode_selected') {
      expect(modeAnn.data.modeId).toBe('fan_crews_original');
    }
  });

  it('handleModeVote: 5000-char comment does not throw and matches correctly', () => {
    const d = makeDirector();
    d.start();
    const longComment = 'countries ' + 'x'.repeat(4990); // 5000 chars total with space separator
    expect(() => d.handleModeVote('v1', longComment)).not.toThrow();
    d.advanceTime(3);
    const modeAnn = announcements.find((a) => a.kind === 'mode_selected');
    if (modeAnn?.kind === 'mode_selected') {
      expect(modeAnn.data.modeId).toBe('countries');
    }
  });

  it('handleFactionJoin: 5000-char comment does not throw and matches correctly', () => {
    const d = makeDirector();
    d.start();
    d.handleModeVote('v1', '1');
    d.advanceTime(3); // → FACTION_LOBBY
    const longComment = 'faction_alpha ' + 'x'.repeat(4986); // 5000 chars total with space separator
    expect(() => d.handleFactionJoin('v1', longComment)).not.toThrow();
    expect(d.selectedFactions.get('v1')).toBe('faction_alpha');
  });
});

// ===========================================================================
// Mode vote tie-breaking
// ===========================================================================

describe('Mode vote tie-breaking', () => {
  let tmpDir: string;
  let statsPath: string;
  let announcements: Announcement[];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rd6-tie-'));
    statsPath = join(tmpDir, 'stats.json');
    announcements = [];
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeDirector(opts?: Partial<MatchDirectorOptions>): MatchDirector {
    return new MatchDirector({
      ...shortDirectorOpts(statsPath),
      ...opts,
      onAnnouncement: (a) => announcements.push(a),
    });
  }

  it('equal votes → LRU winner', () => {
    // Seed stats so 'animals' was played more recently than 'countries'
    let stats = defaultStats();
    stats = recordRound(stats, 'animals', 'faction_alpha');
    saveStats(statsPath, stats);

    const d = makeDirector();
    d.start();
    d.handleModeVote('v1', '1'); // countries
    d.handleModeVote('v2', '2'); // animals
    d.advanceTime(3);

    const modeAnn = announcements.find((a) => a.kind === 'mode_selected');
    if (modeAnn?.kind === 'mode_selected') {
      // countries is LRU (not in recentModes), animals was just played
      expect(modeAnn.data.modeId).toBe('countries');
    }
  });

  it('no votes → LRU fallback', () => {
    let stats = defaultStats();
    stats = recordRound(stats, 'countries', 'faction_alpha');
    saveStats(statsPath, stats);

    const d = makeDirector();
    d.start();
    d.advanceTime(3); // no votes cast

    const modeAnn = announcements.find((a) => a.kind === 'mode_selected');
    if (modeAnn?.kind === 'mode_selected') {
      // countries was just played, so LRU should pick something else
      expect(modeAnn.data.modeId).not.toBe('countries');
    }
  });

  it('first round with no history → alphabetical fallback', () => {
    const d = makeDirector();
    d.start();
    d.advanceTime(3); // no votes, no history

    const modeAnn = announcements.find((a) => a.kind === 'mode_selected');
    if (modeAnn?.kind === 'mode_selected') {
      // alphabetical first among voteable modes: animals, cities, countries, fan_crews_original
      expect(modeAnn.data.modeId).toBe('animals');
    }
  });
});

// ===========================================================================
// Faction join tests
// ===========================================================================

describe('Faction join', () => {
  let tmpDir: string;
  let statsPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rd6-faction-'));
    statsPath = join(tmpDir, 'stats.json');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeDirector(): MatchDirector {
    const d = new MatchDirector(shortDirectorOpts(statsPath));
    d.start();
    d.handleModeVote('v1', '1');
    d.advanceTime(3); // → FACTION_LOBBY
    return d;
  }

  it('first join records faction', () => {
    const d = makeDirector();
    d.handleFactionJoin('viewer1', 'faction_alpha');
    expect(d.selectedFactions.get('viewer1')).toBe('faction_alpha');
  });

  it('one switch allowed', () => {
    const d = makeDirector();
    d.handleFactionJoin('viewer1', 'faction_alpha');
    d.handleFactionJoin('viewer1', 'faction_beta');
    expect(d.selectedFactions.get('viewer1')).toBe('faction_beta');
  });

  it('subsequent joins after switch ignored', () => {
    const d = makeDirector();
    d.handleFactionJoin('viewer1', 'faction_alpha');
    d.handleFactionJoin('viewer1', 'faction_beta'); // switch
    d.handleFactionJoin('viewer1', 'faction_alpha'); // ignored
    expect(d.selectedFactions.get('viewer1')).toBe('faction_beta');
  });

  it('case-insensitive keyword match', () => {
    const d = makeDirector();
    d.handleFactionJoin('viewer1', 'FACTION_ALPHA');
    expect(d.selectedFactions.get('viewer1')).toBe('faction_alpha');
  });

  it('unknown faction keyword ignored', () => {
    const d = makeDirector();
    d.handleFactionJoin('viewer1', 'unknown_faction');
    expect(d.selectedFactions.has('viewer1')).toBe(false);
  });
});

// ===========================================================================
// skipStage battle sub-state tests (FIX 1, 3, 4)
// ===========================================================================

describe('skipStage battle behavior', () => {
  let tmpDir: string;
  let statsPath: string;
  let announcements: Announcement[];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rd6-skip-'));
    statsPath = join(tmpDir, 'stats.json');
    announcements = [];
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeBattleDirector(): MatchDirector {
    const LONG_BATTLE: BattleConfig = {
      opening: 10000,
      crisis: 10000,
      finalSurge: 10000,
      suddenDeath: 10000,
    };
    const d = new MatchDirector({
      ...shortDirectorOpts(statsPath),
      battleConfig: LONG_BATTLE,
      onAnnouncement: (a) => announcements.push(a),
    });
    d.start();
    // Drive to BATTLE_OPENING
    d.handleModeVote('v1', '1');
    d.advanceTime(3); // → FACTION_LOBBY
    d.handleFactionJoin('v1', 'faction_alpha');
    d.advanceTime(3); // → BATTLE_OPENING
    expect(d.state).toBe('BATTLE_OPENING');
    return d;
  }

  it('skipStage during BATTLE_OPENING advances to BATTLE_CRISIS within one call', () => {
    const d = makeBattleDirector();
    expect(d.state).toBe('BATTLE_OPENING');
    d.skipStage();
    expect(d.state).toBe('BATTLE_CRISIS');
    // Timer should be set for crisis stage (10000s)
    expect(d.timerSeconds).toBe(10000);
    // Mock sim should be synced to crisis stage
    expect(d.mockSimulation?.stage).toBe('crisis');
  });

  it('skipStage during BATTLE_CRISIS advances to BATTLE_FINAL_SURGE', () => {
    const d = makeBattleDirector();
    d.skipStage(); // BATTLE_OPENING → BATTLE_CRISIS
    d.skipStage(); // BATTLE_CRISIS → BATTLE_FINAL_SURGE
    expect(d.state).toBe('BATTLE_FINAL_SURGE');
    expect(d.mockSimulation?.stage).toBe('final_surge');
  });

  it('skipStage during BATTLE_FINAL_SURGE advances to BATTLE_SUDDEN_DEATH', () => {
    const d = makeBattleDirector();
    d.skipStage(); // → BATTLE_CRISIS
    d.skipStage(); // → BATTLE_FINAL_SURGE
    d.skipStage(); // → BATTLE_SUDDEN_DEATH
    expect(d.state).toBe('BATTLE_SUDDEN_DEATH');
    expect(d.mockSimulation?.stage).toBe('sudden_death');
  });

  it('skipStage during BATTLE_SUDDEN_DEATH advances to BATTLE_ENDED', () => {
    const d = makeBattleDirector();
    d.skipStage(); // → BATTLE_CRISIS
    d.skipStage(); // → BATTLE_FINAL_SURGE
    d.skipStage(); // → BATTLE_SUDDEN_DEATH
    d.skipStage(); // → BATTLE_ENDED
    expect(d.state).toBe('BATTLE_ENDED');
    // Timer should be 0 for BATTLE_ENDED
    expect(d.timerSeconds).toBe(0);
  });

  it('skipStage in BATTLE_ENDED is a no-op (no state change, no stats recording)', () => {
    const d = makeBattleDirector();
    d.skipStage(); // → BATTLE_CRISIS
    d.skipStage(); // → BATTLE_FINAL_SURGE
    d.skipStage(); // → BATTLE_SUDDEN_DEATH
    d.skipStage(); // → BATTLE_ENDED
    expect(d.state).toBe('BATTLE_ENDED');

    const roundsBefore = d.stats.roundsPlayed;
    d.skipStage(); // should be no-op
    expect(d.state).toBe('BATTLE_ENDED');
    expect(d.stats.roundsPlayed).toBe(roundsBefore);
  });

  it('timerSeconds is 0 after BATTLE_ENDED transition (not resultsDuration)', () => {
    const d = makeBattleDirector();
    d.skipStage(); // → BATTLE_CRISIS
    d.skipStage(); // → BATTLE_FINAL_SURGE
    d.skipStage(); // → BATTLE_SUDDEN_DEATH
    d.skipStage(); // → BATTLE_ENDED
    expect(d.state).toBe('BATTLE_ENDED');
    expect(d.timerSeconds).toBe(0);
    // Advance time to trigger RESULTS transition
    d.advanceTime(0.1);
    expect(d.state).toBe('RESULTS');
    expect(d.timerSeconds).toBe(1); // resultsDuration from shortDirectorOpts
  });
});

// ===========================================================================
// Creator commands tests
// ===========================================================================

describe('Creator commands', () => {
  let tmpDir: string;
  let statsPath: string;
  const TOKEN = 'test-token-123';

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rd6-cmd-'));
    statsPath = join(tmpDir, 'stats.json');
    process.env['LOCAL_SESSION_TOKEN'] = TOKEN;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env['LOCAL_SESSION_TOKEN'];
  });

  function makeDirector() {
    const d = new MatchDirector({
      ...shortDirectorOpts(statsPath),
      sessionStatsPath: statsPath,
    });
    d.start();
    return d;
  }

  it('skip advances to next stage', () => {
    const d = makeDirector();
    expect(d.state).toBe('MODE_VOTE');
    d.skipStage();
    expect(d.state).toBe('FACTION_LOBBY');
  });

  it('pause freezes timers', () => {
    const d = makeDirector();
    d.pause();
    const timerBefore = d.timerSeconds;
    d.advanceTime(10);
    expect(d.timerSeconds).toBe(timerBefore);
  });

  it('resume unfreezes', () => {
    const d = makeDirector();
    d.pause();
    d.resume();
    d.advanceTime(1);
    expect(d.timerSeconds).toBeLessThan(2);
  });

  it('end forces RESULTS', () => {
    const d = makeDirector();
    d.handleModeVote('v1', '1');
    d.advanceTime(3); // → FACTION_LOBBY
    d.forceEnd();
    // After forceEnd: BATTLE_ENDED → then advanceTime → RESULTS
    expect(['BATTLE_ENDED', 'RESULTS']).toContain(d.state);
  });

  it('restart forces MODE_VOTE with fresh seed', () => {
    const d = makeDirector();
    const seedBefore = d.roundSeed;
    d.handleModeVote('v1', '1');
    d.advanceTime(3);
    d.restart();
    expect(d.state).toBe('MODE_VOTE');
    expect(d.roundSeed).not.toBe(seedBefore);
  });

  it('HTTP: missing token returns 503 when env unset', async () => {
    delete process.env['LOCAL_SESSION_TOKEN'];
    const app = buildApp({ logger: false, enableDirector: true });
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/director/skip' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('HTTP: invalid token returns 401', async () => {
    const app = buildApp({ logger: false, enableDirector: true });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/director/skip',
      headers: { authorization: 'Bearer wrong-token' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('HTTP: valid token skip returns 200', async () => {
    const app = buildApp({ logger: false, enableDirector: true });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/director/skip',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    await app.close();
  });

  it('HTTP: pause returns 200', async () => {
    const app = buildApp({ logger: false, enableDirector: true });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/director/pause',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('HTTP: resume returns 200', async () => {
    const app = buildApp({ logger: false, enableDirector: true });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/director/resume',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('HTTP: GET /director/state returns state', async () => {
    const app = buildApp({ logger: false, enableDirector: true });
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/director/state',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.state).toBe('MODE_VOTE');
    await app.close();
  });
});

// ===========================================================================
// 10-round acceptance test
// ===========================================================================

describe('10-round acceptance test', () => {
  let tmpDir: string;
  let statsPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rd6-accept-'));
    statsPath = join(tmpDir, 'stats.json');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('completes 10 rounds with correct stats and no memory growth', () => {
    const announcements: Announcement[] = [];
    const d = new MatchDirector({
      ...shortDirectorOpts(statsPath),
      onAnnouncement: (a) => announcements.push(a),
    });
    d.start();

    const heapAfterRound: number[] = [];
    let modeVoteCount = 0;

    for (let round = 0; round < 10; round++) {
      // Drive one round
      driveOneRound(d, { mode: String((round % 4) + 1), faction: 'faction_alpha' });

      // Count MODE_VOTE transitions
      if (d.state === 'MODE_VOTE') {
        modeVoteCount++;
      }

      // Record heap after each round
      heapAfterRound.push(process.memoryUsage().heapUsed);

      // Verify round over was clean
      expect(d.stats.roundsPlayed).toBe(round + 1);
    }

    // (a) director returns to MODE_VOTE 10 times
    expect(modeVoteCount).toBe(10);

    // (b) stats.roundsPlayed == 10
    expect(d.stats.roundsPlayed).toBe(10);

    // (c) stats.recentModes has 10 entries (cap 10)
    expect(d.stats.recentModes.length).toBe(10);

    // (d) no memory growth: heap after round 10 within 2x of round 1
    const heapRound1 = heapAfterRound[0]!;
    const heapRound10 = heapAfterRound[9]!;
    expect(heapRound10).toBeLessThan(heapRound1 * 2);

    // (e) announcements include expected kinds across 10 rounds
    const modeSelectedCount = announcements.filter((a) => a.kind === 'mode_selected').length;
    const stageChangedCount = announcements.filter((a) => a.kind === 'stage_changed').length;
    const roundEndedCount = announcements.filter((a) => a.kind === 'round_ended').length;
    expect(modeSelectedCount).toBeGreaterThanOrEqual(1);
    expect(stageChangedCount).toBeGreaterThanOrEqual(1);
    expect(roundEndedCount).toBe(10); // one round_ended per round

    // (f) stats file contains all 10 recorded rounds after save
    const savedStats = loadStats(statsPath);
    expect(savedStats.roundsPlayed).toBe(10);
  });
});

// ===========================================================================
// Director.json runtime config integration (FIX 6)
// ===========================================================================

describe('Director.json runtime config', () => {
  const configPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'config',
    'director.json',
  );

  it('loads director.json and merges over defaults', async () => {
    // Save original director.json
    const original = readFileSync(configPath, 'utf8');

    try {
      // Write test config with modeVoteDuration: 99
      writeFileSync(
        configPath,
        JSON.stringify({
          modeVoteDuration: 99,
          factionLobbyDuration: 35,
          battleConfig: { opening: 120, crisis: 60, finalSurge: 60, suddenDeath: 45 },
          resultsDuration: 20,
          sessionStatsPath: 'gateway/data/session-stats.json',
        }),
        'utf8',
      );

      process.env['LOCAL_SESSION_TOKEN'] = 'test-token';
      const app = buildApp({ logger: false, enableDirector: true });
      await app.ready();

      // The director should have loaded with modeVoteDuration: 99
      const director = app.director;
      expect(director).toBeDefined();
      expect(director!.timerSeconds).toBe(99); // MODE_VOTE timer = modeVoteDuration

      await app.close();
      delete process.env['LOCAL_SESSION_TOKEN'];
    } finally {
      // Restore original director.json
      writeFileSync(configPath, original, 'utf8');
    }
  });

  it('falls back to defaults when director.json is malformed', async () => {
    const original = readFileSync(configPath, 'utf8');

    try {
      // Write malformed JSON
      writeFileSync(configPath, '{ this is not valid json }', 'utf8');

      process.env['LOCAL_SESSION_TOKEN'] = 'test-token';
      const app = buildApp({ logger: false, enableDirector: true });
      await app.ready();

      // Should fall back to defaults (modeVoteDuration: 20)
      const director = app.director;
      expect(director).toBeDefined();
      expect(director!.timerSeconds).toBe(20); // default modeVoteDuration

      await app.close();
      delete process.env['LOCAL_SESSION_TOKEN'];
    } finally {
      writeFileSync(configPath, original, 'utf8');
    }
  });

  it('falls back to defaults when director.json has unknown keys (strict Zod)', async () => {
    const original = readFileSync(configPath, 'utf8');

    try {
      // Write JSON with unknown key (should fail strict Zod validation)
      writeFileSync(
        configPath,
        JSON.stringify({
          modeVoteDuration: 99,
          unknownKey: 'bad',
        }),
        'utf8',
      );

      process.env['LOCAL_SESSION_TOKEN'] = 'test-token';
      const app = buildApp({ logger: false, enableDirector: true });
      await app.ready();

      // Should fall back to defaults due to Zod strict rejection
      const director = app.director;
      expect(director).toBeDefined();
      expect(director!.timerSeconds).toBe(20); // default modeVoteDuration

      await app.close();
      delete process.env['LOCAL_SESSION_TOKEN'];
    } finally {
      writeFileSync(configPath, original, 'utf8');
    }
  });
});
