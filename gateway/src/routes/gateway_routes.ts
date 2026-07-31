/**
 * Phase 8 — Gateway Core HTTP routes.
 *
 * Public (no auth):
 *   GET /health — basic liveness probe
 *
 * Token-protected:
 *   GET  /status — pipeline stats + director state + viewer registry size
 *   GET  /config — sanitized current config (no secrets)
 *   POST /config — partial runtime config update
 *   POST /control/shutdown — graceful shutdown trigger
 *   POST /events — accept a batch of raw provider events
 *   GET  /events — drain the event bus (debug)
 *   GET  /commands — drain the command queue
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import type { Pipeline } from '../pipeline/pipeline.js';
import type { GatewayConfig } from '../config.js';
import { sanitizeConfig, validateRuntimeConfigUpdate } from '../config.js';
import type { MatchDirector } from '../director/match_director.js';
import { Logger, createLogger } from '../util/logger.js';

// ---------------------------------------------------------------------------
// Module-level logger (FIX 8: wire Logger into production paths)
// ---------------------------------------------------------------------------

const routesLogger = new Logger(createLogger('info'));

// ---------------------------------------------------------------------------
// Token validation helper (reused from creator_commands.ts pattern)
// ---------------------------------------------------------------------------

function getToken(): string | undefined {
  return process.env['LOCAL_SESSION_TOKEN'];
}

function validateToken(request: FastifyRequest, reply: FastifyReply): boolean {
  const token = getToken();
  if (!token) {
    reply.status(503).send({ error: 'Gateway commands not configured (LOCAL_SESSION_TOKEN unset)' });
    return false;
  }

  const authHeader = request.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Missing or malformed Authorization header' });
    return false;
  }

  const provided = authHeader.slice(7);
  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(token, 'utf8');
  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    reply.status(401).send({ error: 'Invalid token' });
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export interface RegisterRoutesOptions {
  pipeline: Pipeline;
  config: GatewayConfig;
  director?: MatchDirector | null;
  startTime: Date;
  onShutdown: () => void;
  /** Mutable log level reference for runtime updates. */
  setLogLevel?: (level: string) => void;
  /**
   * Mutable runtime config mirror. POST /config mutates this; GET /config reads from it.
   * FIX 4: ensures GET /config always returns the latest applied config.
   */
  runtimeConfigMirror?: Record<string, unknown>;
}

/**
 * Registers all Phase 8 gateway core routes on the Fastify instance.
 */
export function registerGatewayRoutes(
  app: FastifyInstance,
  opts: RegisterRoutesOptions,
): void {
  const { pipeline, config: cfg, director, startTime, onShutdown, setLogLevel, runtimeConfigMirror } = opts;

  // -------------------------------------------------------------------------
  // GET /health — no auth required
  // -------------------------------------------------------------------------
  app.get('/health', () => {
    routesLogger.debug('routes', 'GET /health');
    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - startTime.getTime()) / 1000),
      version: '0.1.0',
      provider: cfg.liveProvider,
      timestamp: new Date().toISOString(),
    };
  });

  // -------------------------------------------------------------------------
  // GET /status — token required
  // -------------------------------------------------------------------------
  app.get('/status', (request, reply) => {
    if (!validateToken(request, reply)) return;

    routesLogger.debug('routes', 'GET /status');
    const pipelineStats = pipeline.getStats();
    reply.send({
      pipeline: pipelineStats,
      director: director
        ? {
            state: director.state,
            timerSeconds: director.timerSeconds,
            currentMode: director.currentMode,
            paused: director.paused,
          }
        : null,
      viewerRegistrySize: director?.viewerRegistry.size ?? 0,
      uptime: Math.floor((Date.now() - startTime.getTime()) / 1000),
    });
  });

  // -------------------------------------------------------------------------
  // GET /config — token required (sanitized, no secrets)
  // FIX 4: reads from runtimeConfigMirror so POST /config updates are reflected.
  // -------------------------------------------------------------------------
  app.get('/config', (request, reply) => {
    if (!validateToken(request, reply)) return;

    routesLogger.debug('routes', 'GET /config');
    // If a runtime mirror exists, return it (includes POST /config updates).
    // Otherwise fall back to the static sanitized config.
    reply.send(runtimeConfigMirror ?? sanitizeConfig(cfg));
  });

  // -------------------------------------------------------------------------
  // POST /config — token required (runtime config update)
  // FIX 4: also mutates runtimeConfigMirror so GET /config reflects changes.
  // -------------------------------------------------------------------------
  app.post('/config', (request, reply) => {
    if (!validateToken(request, reply)) return;

    const validation = validateRuntimeConfigUpdate(request.body);
    if (!validation.ok) {
      reply.status(400).send({ error: 'Invalid config update', details: validation.errors });
      return;
    }

    const update = validation.value;
    pipeline.applyRuntimeConfig(update);

    if (update.logLevel && setLogLevel) {
      setLogLevel(update.logLevel);
    }

    // FIX 4: update the runtime config mirror so GET /config returns fresh values
    if (runtimeConfigMirror) {
      const pipelineSection = (runtimeConfigMirror['pipeline'] ?? {}) as Record<string, unknown>;
      if (update.rateLimitPerViewer !== undefined) pipelineSection['rateLimitPerViewer'] = update.rateLimitPerViewer;
      if (update.rateLimitBurst !== undefined) pipelineSection['rateLimitBurst'] = update.rateLimitBurst;
      if (update.rateLimitGlobal !== undefined) pipelineSection['rateLimitGlobal'] = update.rateLimitGlobal;
      if (update.dedupeCapacity !== undefined) pipelineSection['dedupeCapacity'] = update.dedupeCapacity;
      if (update.commandQueueCapacity !== undefined) pipelineSection['commandQueueCapacity'] = update.commandQueueCapacity;
      if (update.eventBusCapacity !== undefined) pipelineSection['eventBusCapacity'] = update.eventBusCapacity;
      runtimeConfigMirror['pipeline'] = pipelineSection;
      if (update.logLevel !== undefined) runtimeConfigMirror['logLevel'] = update.logLevel;
    }

    routesLogger.info('routes', 'POST /config applied', { applied: Object.keys(update) });
    reply.send({ ok: true, applied: Object.keys(update) });
  });

  // -------------------------------------------------------------------------
  // POST /control/shutdown — token required
  // FIX 3: onShutdown now flushes pipeline before closing (see app.ts).
  // -------------------------------------------------------------------------
  app.post('/control/shutdown', (request, reply) => {
    if (!validateToken(request, reply)) return;

    routesLogger.info('routes', 'POST /control/shutdown — initiating graceful shutdown');
    reply.send({ ok: true, message: 'Shutdown initiated' });
    // Trigger shutdown after response is sent
    setTimeout(() => onShutdown(), 100);
  });

  // -------------------------------------------------------------------------
  // POST /events — token required (accept batch of raw events)
  // -------------------------------------------------------------------------
  app.post('/events', (request, reply) => {
    if (!validateToken(request, reply)) return;

    const body = request.body;
    const events: unknown[] = Array.isArray(body) ? body : Array.isArray((body as { events?: unknown[] })?.events) ? (body as { events: unknown[] }).events : [body];

    const results = pipeline.processBatch(events);
    const commands = results.flatMap((r) => r.commands);
    const dropped = results.filter((r) => r.dropped).length;

    routesLogger.debug('routes', `POST /events: ${events.length} events processed`, {
      processed: results.length,
      commands: commands.length,
      dropped,
    });

    reply.send({
      processed: results.length,
      commands: commands.length,
      dropped,
      results: results.map((r) => ({
        dropped: r.dropped,
        reason: r.reason,
        commandCount: r.commands.length,
      })),
    });
  });

  // -------------------------------------------------------------------------
  // GET /events — token required (drain event bus for debugging)
  // -------------------------------------------------------------------------
  app.get('/events', (request, reply) => {
    if (!validateToken(request, reply)) return;

    const rawEvents = pipeline.eventBus.drain('raw_event');
    const normalizedEvents = pipeline.eventBus.drain('normalized_event');
    const errors = pipeline.eventBus.drain('error');

    reply.send({
      raw_events: rawEvents,
      normalized_events: normalizedEvents,
      errors,
    });
  });

  // -------------------------------------------------------------------------
  // GET /commands — token required (drain command queue)
  // -------------------------------------------------------------------------
  app.get('/commands', (request, reply) => {
    if (!validateToken(request, reply)) return;

    const commands = pipeline.commandQueue.drain();
    reply.send({ commands, count: commands.length });
  });
}
