/**
 * Director orchestration — factory that wires MatchDirector + creator commands
 * + stats persistence (auto-save after each RESULTS transition).
 */

import type { FastifyInstance } from 'fastify';
import { MatchDirector, type MatchDirectorOptions, type Announcement } from './match_director.js';
import { registerCreatorRoutes } from './creator_commands.js';

// Re-export everything for external consumers
export { MatchDirector, SYNTHETIC_FACTIONS } from './match_director.js';
export type { MatchDirectorOptions, DirectorState, DirectorStateSnapshot, Announcement } from './match_director.js';
export { MockSimulation } from './mock_simulation.js';
export type { MockSnapshot, MockUnit, MockProjectile, BattleConfig, BattleStage } from './mock_simulation.js';
export { loadStats, saveStats, recordRound, defaultStats, SessionStatsSchema } from './session_stats.js';
export type { SessionStats } from './session_stats.js';
export { registerCreatorRoutes } from './creator_commands.js';

// Phase 7: Re-export viewer modules
export * from '../viewer/index.js';

// ---------------------------------------------------------------------------
// createDirector factory
// ---------------------------------------------------------------------------

export interface CreateDirectorOptions extends MatchDirectorOptions {
  /** Optional callback invoked on every announcement (for logging, WS broadcast, etc.) */
  onAnnouncement?: (announcement: Announcement) => void;
}

/**
 * Creates and returns a fully wired MatchDirector instance.
 * The director is NOT started — call director.start() to begin the first round.
 */
export function createDirector(opts: CreateDirectorOptions): MatchDirector {
  const director = new MatchDirector(opts);
  return director;
}

/**
 * Creates a MatchDirector and registers creator command routes on the given Fastify app.
 * Starts the director automatically.
 */
export function createAndRegisterDirector(
  app: FastifyInstance,
  opts: CreateDirectorOptions,
): MatchDirector {
  const director = createDirector(opts);
  registerCreatorRoutes(app, director);
  director.start();
  return director;
}
