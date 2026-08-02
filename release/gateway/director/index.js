/**
 * Director orchestration — factory that wires MatchDirector + creator commands
 * + stats persistence (auto-save after each RESULTS transition).
 */
import { MatchDirector } from './match_director.js';
import { registerCreatorRoutes } from './creator_commands.js';
// Re-export everything for external consumers
export { MatchDirector, SYNTHETIC_FACTIONS } from './match_director.js';
export { MockSimulation } from './mock_simulation.js';
export { loadStats, saveStats, recordRound, defaultStats, SessionStatsSchema } from './session_stats.js';
export { registerCreatorRoutes } from './creator_commands.js';
// Phase 7: Re-export viewer modules
export * from '../viewer/index.js';
/**
 * Creates and returns a fully wired MatchDirector instance.
 * The director is NOT started — call director.start() to begin the first round.
 */
export function createDirector(opts) {
    const director = new MatchDirector(opts);
    return director;
}
/**
 * Creates a MatchDirector and registers creator command routes on the given Fastify app.
 * Starts the director automatically.
 */
export function createAndRegisterDirector(app, opts) {
    const director = createDirector(opts);
    registerCreatorRoutes(app, director);
    director.start();
    return director;
}
