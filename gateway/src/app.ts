import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { config } from './config.js';
import { createAndRegisterDirector, type MatchDirector } from './director/index.js';
import { SYNTHETIC_FACTIONS } from './director/match_director.js';
import { ViewerRegistry } from './viewer/viewer_registry.js';
import { CommandParser } from './viewer/command_parser.js';
import { ContributionTracker } from './viewer/contribution_tracker.js';

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

    // Phase 7: Load viewer.json config and apply to director
    const ViewerJsonSchema = z.object({
      displayNameMaxLength: z.number().int().min(1).max(256).optional(),
      chatCommandMaxLength: z.number().int().min(1).max(500).optional(),
      contributionCategoryCap: z.number().int().min(1).optional(),
      strategyKeywords: z.array(z.string().min(1).max(32)).max(20).optional(),
    }).strict();

    try {
      const configDir2 = join(dirname(fileURLToPath(import.meta.url)), '..', 'config');
      const viewerConfigPath = join(configDir2, 'viewer.json');
      const viewerRaw = readFileSync(viewerConfigPath, 'utf8');
      const viewerParsed: unknown = JSON.parse(viewerRaw);
      const viewerFileConfig = ViewerJsonSchema.parse(viewerParsed);

      // Apply viewer config to director's viewer services
      if (viewerFileConfig.displayNameMaxLength !== undefined) {
        director.viewerRegistry = new ViewerRegistry(viewerFileConfig.displayNameMaxLength);
      }
      if (viewerFileConfig.chatCommandMaxLength !== undefined || viewerFileConfig.strategyKeywords !== undefined) {
        director.commandParser = new CommandParser({
          chatCommandMaxLength: viewerFileConfig.chatCommandMaxLength ?? 200,
          strategyKeywords: viewerFileConfig.strategyKeywords ?? ['focus', 'defend', 'push', 'retreat'],
          syntheticFactionIds: SYNTHETIC_FACTIONS,
        });
      }
      if (viewerFileConfig.contributionCategoryCap !== undefined) {
        director.contributionTracker = new ContributionTracker(viewerFileConfig.contributionCategoryCap);
      }
    } catch (err: unknown) {
      app.log.warn(`[Viewer] Failed to load viewer.json, using defaults: ${String(err)}`);
    }
  }

  return app;
}

// Augment FastifyInstance with optional director
declare module 'fastify' {
  interface FastifyInstance {
    director?: MatchDirector;
  }
}
