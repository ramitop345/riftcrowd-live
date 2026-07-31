import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { config } from './config.js';
import { createAndRegisterDirector, type MatchDirector } from './director/index.js';

export interface BuildAppOptions {
  /** Set to false in tests to silence request logging. Defaults to true. */
  logger?: boolean;
  /** Enable the Phase 6 Match Director with creator command routes. */
  enableDirector?: boolean;
}

/**
 * Creates the Fastify instance with all routes and plugins registered. Does not listen;
 * the caller (server.ts or a test via app.inject) decides how requests arrive.
 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger === false ? false : { level: config.logLevel },
  });

  // Dev-only permissive CORS; everything binds to localhost so exposure is limited.
  void app.register(cors, { origin: true });

  app.get('/health', () => ({
    status: 'ok',
    provider: config.liveProvider,
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  }));

  // Phase 6: Match Director (optional)
  let director: MatchDirector | null = null;
  if (options.enableDirector) {
    // Inline defaults
    const defaults = {
      modeVoteDuration: 20,
      factionLobbyDuration: 35,
      battleConfig: { opening: 120, crisis: 60, finalSurge: 60, suddenDeath: 45 },
      resultsDuration: 20,
      sessionStatsPath: 'gateway/data/session-stats.json',
    };

    // Zod schema for director.json (rejects malformed config with a clear error)
    const DirectorJsonSchema = z.object({
      modeVoteDuration: z.number().int().min(0).optional(),
      factionLobbyDuration: z.number().int().min(0).optional(),
      battleConfig: z
        .object({
          opening: z.number().int().min(0).optional(),
          crisis: z.number().int().min(0).optional(),
          finalSurge: z.number().int().min(0).optional(),
          suddenDeath: z.number().int().min(0).optional(),
        })
        .strict()
        .optional(),
      resultsDuration: z.number().int().min(0).optional(),
      sessionStatsPath: z.string().optional(),
    }).strict();

    // Deep-merge: JSON values override defaults; missing keys fall back to defaults
    let merged = { ...defaults };
    try {
      const configDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'config');
      const configPath = join(configDir, 'director.json');
      const raw = readFileSync(configPath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      const fileConfig = DirectorJsonSchema.parse(parsed);

      merged = {
        modeVoteDuration: fileConfig.modeVoteDuration ?? defaults.modeVoteDuration,
        factionLobbyDuration: fileConfig.factionLobbyDuration ?? defaults.factionLobbyDuration,
        battleConfig: {
          opening: fileConfig.battleConfig?.opening ?? defaults.battleConfig.opening,
          crisis: fileConfig.battleConfig?.crisis ?? defaults.battleConfig.crisis,
          finalSurge: fileConfig.battleConfig?.finalSurge ?? defaults.battleConfig.finalSurge,
          suddenDeath: fileConfig.battleConfig?.suddenDeath ?? defaults.battleConfig.suddenDeath,
        },
        resultsDuration: fileConfig.resultsDuration ?? defaults.resultsDuration,
        sessionStatsPath: fileConfig.sessionStatsPath ?? defaults.sessionStatsPath,
      };
    } catch (err: unknown) {
      // File missing or parse failure: log warning and use defaults (don't crash)
      app.log.warn(`[Director] Failed to load director.json, using defaults: ${String(err)}`);
    }

    director = createAndRegisterDirector(app, merged);
    app.decorate('director', director);
  }

  return app;
}

// Augment FastifyInstance with optional director
declare module 'fastify' {
  interface FastifyInstance {
    director?: MatchDirector;
  }
}
