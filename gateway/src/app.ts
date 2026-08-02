import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import {
  COMMAND_SCHEMA_VERSION,
  type GameCommand,
} from '@riftcrowd/shared';
import { config, sanitizeConfig } from './config.js';
import type { WindowConfig } from './window/window_config.js';
import { createAndRegisterDirector, type MatchDirector } from './director/index.js';
import { SYNTHETIC_FACTIONS } from './director/match_director.js';
import { ViewerRegistry } from './viewer/viewer_registry.js';
import { CommandParser } from './viewer/command_parser.js';
import { ContributionTracker } from './viewer/contribution_tracker.js';
import { Pipeline } from './pipeline/pipeline.js';
import { registerGatewayRoutes } from './routes/gateway_routes.js';
import { registerMockRoutes } from './routes/mock_routes.js';
import { registerGiftRoutes } from './routes/gift_routes.js';
import { registerEngagementRoutes } from './routes/engagement_routes.js';
import { registerViewerRoutes } from './routes/viewer_routes.js';
import { registerVFXRoutes } from './routes/vfx_routes.js';
import { registerAudioRoutes } from './routes/audio_routes.js';
import { registerReadabilityRoutes } from './routes/readability_routes.js';
import { registerWindowRoutes } from './routes/window_routes.js';
import { registerPreflightRoutes } from './routes/preflight_routes.js';
import { registerFallbackRoutes } from './routes/fallback_routes.js';
import { registerVersionRoute } from './routes/version_route.js';
import { registerDiagnosticsRoute } from './routes/diagnostics_route.js';
import { WsServer } from './ws/ws_server.js';
import { GiftEconomy } from './gifts/gift_economy.js';
import { FreeEngagement } from './engagement/free_engagement.js';
import { TikFinityAdapter } from './adapters/tikfinity_adapter.js';
import { VFXOrchestrator } from './vfx/vfx_orchestrator.js';
import { loadVFXConfig } from './vfx/vfx_config.js';
import { AudioOrchestrator } from './audio/audio_orchestrator.js';
import { loadAudioConfig } from './audio/audio_config.js';
import { ReadabilityOrchestrator } from './readability/readability_orchestrator.js';
import { loadReadabilityConfig } from './readability/readability_config.js';
import { loadWindowConfig } from './window/window_config.js';
import { PreflightOrchestrator, makeGatewayHealthCheck, makeDashboardReachableCheck, makeProviderCheck, makeConfigCheck, makeAudioCheck, makeVFXConfigCheck } from './preflight/preflight_orchestrator.js';
import { FallbackOrchestrator } from './fallback/fallback_orchestrator.js';
import { VFXConfigSchema } from './vfx/vfx_config.js';

export interface BuildAppOptions {
  /** Set to false in tests to silence request logging. Defaults to true. */
  logger?: boolean;
  /** Enable the Phase 6 Match Director with creator command routes. */
  enableDirector?: boolean;
  /**
   * Enable the Phase 8 pipeline and gateway routes (default: true).
   * Set to false only for backward-compat tests that don't expect the pipeline.
   */
  enablePipeline?: boolean;
  /** Enable Phase 9 mock adapter routes (/mock/*). Opt-in: defaults to false. */
  enableMockRoutes?: boolean;
  /** Enable Phase 10 WebSocket server. Opt-in: defaults to false. */
  enableWs?: boolean;
  /** Enable Phase 11 gift economy routes. Opt-in: defaults to false. */
  enableGiftEconomy?: boolean;
  /** Enable Phase 12 free engagement routes. Opt-in: defaults to false. */
  enableFreeEngagement?: boolean;
  /** Enable Phase 13 viewer moderation routes. Opt-in: defaults to false. */
  enableViewerRoutes?: boolean;
  /** Enable Phase 14 TikFinity adapter. Opt-in: defaults to false. */
  enableTikfinity?: boolean;
  /** Enable Phase 15 VFX/Audio/Readability routes. Opt-in: defaults to false. */
  enableVFX?: boolean;
  /** Enable Phase 16 Window/Preflight/Fallback routes. Opt-in: defaults to false. */
  enableRunbook?: boolean;
  /** Enable Phase 18 diagnostics routes. Opt-in: defaults to false. */
  enableDiagnostics?: boolean;
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

  // Phase 8: Create pipeline (always, unless explicitly disabled)
  const enablePipeline = options.enablePipeline !== false;
  let pipeline: Pipeline | null = null;

  if (enablePipeline) {
    pipeline = new Pipeline({
      eventBusCapacity: config.pipeline.eventBusCapacity,
      dedupeCapacity: config.pipeline.dedupeCapacity,
      rateLimitPerViewer: config.pipeline.rateLimitPerViewer,
      rateLimitBurst: config.pipeline.rateLimitBurst,
      rateLimitGlobal: config.pipeline.rateLimitGlobal,
      commandQueueCapacity: config.pipeline.commandQueueCapacity,
      onWarn: (msg, fields) => app.log.warn({ ...fields }, msg),
    });
    app.decorate('pipeline', pipeline);
  }

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

  // Phase 8: Register gateway routes (includes /health, /status, /config, etc.)
  if (enablePipeline && pipeline) {
    const startTime = new Date();

    // Mutable runtime config mirror: POST /config mutates this; GET /config reads from it.
    // FIX 4: ensures GET /config returns the latest config after POST /config updates.
    const runtimeConfigMirror: Record<string, unknown> = sanitizeConfig(config);

    registerGatewayRoutes(app, {
      pipeline,
      config,
      director,
      startTime,
      runtimeConfigMirror,
      onShutdown: () => {
        // FIX 3: flush pipeline (command queue + event bus) before closing.
        // This mirrors what server.ts gracefulShutdown does for signal-based shutdown.
        if (pipeline) {
          const queueDropped = pipeline.commandQueue.clear();
          pipeline.eventBus.clear();
          if (queueDropped > 0) {
            app.log.warn({ dropped: queueDropped }, `Command queue flushed: ${queueDropped} commands dropped`);
          }
        }
        void app.close();
      },
      setLogLevel: (level: string) => {
        app.log.level = level;
      },
    });

    // Phase 9: Register mock adapter routes (opt-in via enableMockRoutes: true)
    if (options.enableMockRoutes === true) {
      registerMockRoutes(app, {
        pipeline,
        director,
      });
    }

    // Phase 11: Gift economy (opt-in via enableGiftEconomy: true)
    if (options.enableGiftEconomy === true) {
      try {
        const giftConfig = GiftEconomy.loadDefaultConfig();
        // Inject ViewerRegistry faction lookup (FIX 4)
        const getFaction = (viewerId: string): string | null => {
          const profile = director?.viewerRegistry?.get(viewerId);
          return profile?.factionId ?? null;
        };
        const giftEconomy = new GiftEconomy(
          giftConfig,
          undefined,
          (msg) => app.log.info(msg),
          getFaction,
        );
        app.decorate('giftEconomy', giftEconomy);

        // Register a proxy rule that always delegates to the current giftEconomy.getRule().
        // This ensures hot-reload (POST /gifts/config) doesn't leave the pipeline with a
        // stale GiftRule reference.
        pipeline.rulesEngine.registerRule({
          name: 'GiftRule',
          applies: (e) => giftEconomy.getRule().applies(e),
          execute: (e, ctx) => giftEconomy.getRule().execute(e, ctx),
        });

        registerGiftRoutes(app, { giftEconomy });
        app.log.info('[GiftEconomy] Registered with pipeline and HTTP routes');
      } catch (err: unknown) {
        app.log.warn(`[GiftEconomy] Failed to initialize: ${String(err)}`);
      }
    }

    // Phase 12: Free Engagement (opt-in via enableFreeEngagement: true)
    if (options.enableFreeEngagement === true) {
      try {
        const freeEngagementConfig = FreeEngagement.loadDefaultConfig();
        const getFaction = (viewerId: string): string | null => {
          const profile = director?.viewerRegistry?.get(viewerId);
          return profile?.factionId ?? null;
        };
        const freeEngagement = new FreeEngagement(
          freeEngagementConfig,
          (msg) => app.log.info(msg),
          getFaction,
        );
        app.decorate('freeEngagement', freeEngagement);

        // Register a proxy rule that always delegates to the current freeEngagement.getRule().
        pipeline.rulesEngine.registerRule({
          name: 'FreeEngagementRule',
          applies: (e) => freeEngagement.getRule().applies(e),
          execute: (e, ctx) => freeEngagement.getRule().execute(e, ctx),
        });

        registerEngagementRoutes(app, { freeEngagement });
        app.log.info('[FreeEngagement] Registered with pipeline and HTTP routes');
      } catch (err: unknown) {
        app.log.warn(`[FreeEngagement] Failed to initialize: ${String(err)}`);
      }
    }

    // Phase 13: Viewer moderation routes (opt-in via enableViewerRoutes: true)
    if (options.enableViewerRoutes === true && director) {
      registerViewerRoutes(app, { director });
    }

    // Phase 14: TikFinity adapter (opt-in via enableTikfinity: true)
    if (options.enableTikfinity === true && pipeline) {
      const tikfinityAdapter = new TikFinityAdapter({
        config: config.tikfinity,
        onWarn: (msg, fields) => app.log.warn({ ...fields }, msg),
        onInfo: (msg, fields) => app.log.info({ ...fields }, msg),
      });

      // Wire events from adapter into the pipeline
      tikfinityAdapter.onEvent((event) => {
        pipeline.process(event);
      });

      app.decorate('tikfinityAdapter', tikfinityAdapter);

      // Start adapter when server is ready, stop on close
      app.addHook('onReady', async () => {
        await tikfinityAdapter.start();
        app.log.info('[TikFinity] Adapter started');
      });

      app.addHook('onClose', async () => {
        await tikfinityAdapter.stop();
        app.log.info('[TikFinity] Adapter stopped');
      });
    }

    // Phase 15: VFX, Audio, Readability (opt-in via enableVFX: true)
    if (options.enableVFX === true) {
      try {
        const vfxConfig = loadVFXConfig();
        const vfxOrchestrator = new VFXOrchestrator(vfxConfig);
        app.decorate('vfxOrchestrator', vfxOrchestrator);
        registerVFXRoutes(app, { orchestrator: vfxOrchestrator });

        const audioConfig = loadAudioConfig();
        const audioOrchestrator = new AudioOrchestrator(audioConfig);
        app.decorate('audioOrchestrator', audioOrchestrator);
        registerAudioRoutes(app, { orchestrator: audioOrchestrator });

        const readabilityConfig = loadReadabilityConfig();
        const readabilityOrchestrator = new ReadabilityOrchestrator(readabilityConfig);
        app.decorate('readabilityOrchestrator', readabilityOrchestrator);
        registerReadabilityRoutes(app, { orchestrator: readabilityOrchestrator });

        app.log.info('[Phase15] VFX, Audio, Readability orchestrators registered');

        // Phase 16 (OBS Runbook): VFX/audio pipeline rules wired behind opt-in flag.
        // Event-type guard prevents unnecessary calls for join/provider_status events
        // which both orchestrators' switch statements would no-op anyway.
        const VFX_AUDIO_EVENT_TYPES = new Set(['gift', 'follow', 'like', 'chat', 'share', 'subscribe']);

        if (pipeline) {
          pipeline.rulesEngine.registerRule({
            name: 'VFXRule',
            applies: (e) => VFX_AUDIO_EVENT_TYPES.has(e.type),
            execute: (e, _ctx) => vfxOrchestrator.triggerVFX(e).commands,
          });
          pipeline.rulesEngine.registerRule({
            name: 'AudioRule',
            applies: (e) => VFX_AUDIO_EVENT_TYPES.has(e.type),
            execute: (e, _ctx) => audioOrchestrator.triggerAudio(e).commands,
          });
        }
      } catch (err: unknown) {
        app.log.warn(`[Phase15] Failed to initialize: ${String(err)}`);
      }
    }

    // Phase 16: Window/Preflight/Fallback (opt-in via enableRunbook: true)
    if (options.enableRunbook === true) {
      try {
        // Window config
        const windowConfig = loadWindowConfig();
        registerWindowRoutes(app, {
          config: windowConfig,
          // FIX 5: Emit SET_WINDOW_MODE command when config is updated via POST.
          // Wired to command queue; Godot-side handler stub in command_dispatcher.gd.
          onConfigUpdate: (cfg: WindowConfig) => {
            if (pipeline) {
              const cmd: GameCommand = {
                schemaVersion: COMMAND_SCHEMA_VERSION,
                id: `window_mode_${Date.now()}`,
                type: 'SET_WINDOW_MODE',
                createdAt: new Date().toISOString(),
                sourceEventIds: [],
                metadata: { mode: cfg.mode, portrait: String(cfg.portrait) },
              };
              pipeline.eventBus.publish('command', cmd);
            }
          },
        });

        // Preflight orchestrator
        const preflight = new PreflightOrchestrator();

        // FIX 8: Gateway health check — actually fetches /health via HTTP
        // instead of always-passing in-process lambda.
        preflight.addCheck(makeGatewayHealthCheck(async () => {
          const response = await fetch(`http://127.0.0.1:${config.gatewayPort}/health`);
          return response.json() as Promise<{ status: string }>;
        }));

        // Dashboard reachable check
        preflight.addCheck(makeDashboardReachableCheck(async () => {
          try {
            const response = await fetch('http://127.0.0.1:5173');
            return response.ok;
          } catch {
            return false;
          }
        }));

        // Provider check
        preflight.addCheck(makeProviderCheck(
          config.liveProvider,
          () => true, // Mock adapter is always running if provider=mock
          async () => {
            // TikFinity check: query adapter status
            const adapter = app.tikfinityAdapter;
            return adapter?.isConnected() === true;
          },
        ));

        // Config check
        preflight.addCheck(makeConfigCheck(() => ({
          ok: true,
          errors: [],
        })));

        // Audio check (placeholder)
        preflight.addCheck(makeAudioCheck(() => ({
          ok: true,
          message: 'Audio assets placeholder check passed',
        })));

        // VFX config check
        preflight.addCheck(makeVFXConfigCheck(() => {
          try {
            const vfxCfg = app.vfxOrchestrator?.getConfig();
            if (vfxCfg) {
              const result = VFXConfigSchema.safeParse(vfxCfg);
              if (result.success) return { ok: true, errors: [] };
              return { ok: false, errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
            }
            return { ok: true, errors: [] };
          } catch (err: unknown) {
            return { ok: false, errors: [String(err)] };
          }
        }));

        app.decorate('preflightOrchestrator', preflight);
        registerPreflightRoutes(app, { orchestrator: preflight });

        // Fallback orchestrator
        const fallback = new FallbackOrchestrator();
        app.decorate('fallbackOrchestrator', fallback);
        registerFallbackRoutes(app, { orchestrator: fallback });

        app.log.info('[Phase16] Window, Preflight, Fallback routes registered');
      } catch (err: unknown) {
        app.log.warn(`[Phase16] Failed to initialize: ${String(err)}`);
      }
    }

    // Phase 18: Version endpoint (always registered, public)
    registerVersionRoute(app);

    // Phase 18: Diagnostics export (opt-in via enableDiagnostics: true)
    if (options.enableDiagnostics === true) {
      registerDiagnosticsRoute(app, { config });
      app.log.info('[Phase18] Diagnostics routes registered');
    }

    // Phase 10: WebSocket server (opt-in via enableWs: true)
    if (options.enableWs === true) {
      const wsServer = new WsServer({
        heartbeatIntervalMs: config.ws.heartbeatIntervalMs,
        heartbeatTimeoutMs: config.ws.heartbeatTimeoutMs,
        retryBufferCapacity: config.ws.retryBufferCapacity,
        maxReconnectBackoffMs: config.ws.maxReconnectBackoffMs,
        idempotencyWindowSize: config.ws.idempotencyWindowSize,
        sessionToken: config.localSessionToken,
      });
      app.decorate('wsServer', wsServer);

      // FIX 4: Periodic drain interval for fallback orchestrator commands.
      let fallbackDrainInterval: ReturnType<typeof setInterval> | null = null;

      // Attach WS server once the Fastify HTTP server is ready
      app.addHook('onReady', async () => {
        const httpServer = app.server;
        if (httpServer && pipeline) {
          wsServer.attach(httpServer, pipeline.eventBus);
          app.log.info('[WS] WebSocket server attached to /ws/game');
        }

        // FIX 4: Wire fallback orchestrator command drain into WS pipeline.
        // Drains fallback commands every 1s and broadcasts to connected clients.
        const fallbackOrch = app.fallbackOrchestrator;
        if (fallbackOrch) {
          fallbackDrainInterval = setInterval(() => {
            const cmds = fallbackOrch.drainCommands();
            for (const cmd of cmds) {
              wsServer.broadcastCommand(cmd);
            }
          }, 1000);
        }
      });

      // Clean up on close
      app.addHook('onClose', async () => {
        if (fallbackDrainInterval) {
          clearInterval(fallbackDrainInterval);
          fallbackDrainInterval = null;
        }
        await wsServer.close();
        app.log.info('[WS] WebSocket server closed');
      });
    }
  } else if (!enablePipeline) {
    // Legacy /health endpoint for tests that disable the pipeline
    app.get('/health', () => ({
      status: 'ok',
      provider: config.liveProvider,
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    }));
  }

  return app;
}

// Augment FastifyInstance with optional director, pipeline, wsServer, giftEconomy,
// freeEngagement, and tikfinityAdapter
declare module 'fastify' {
  interface FastifyInstance {
    director?: MatchDirector;
    pipeline?: Pipeline;
    wsServer?: WsServer;
    giftEconomy?: GiftEconomy;
    freeEngagement?: FreeEngagement;
    tikfinityAdapter?: TikFinityAdapter;
    vfxOrchestrator?: VFXOrchestrator;
    audioOrchestrator?: AudioOrchestrator;
    readabilityOrchestrator?: ReadabilityOrchestrator;
    preflightOrchestrator?: PreflightOrchestrator;
    fallbackOrchestrator?: FallbackOrchestrator;
  }
}
