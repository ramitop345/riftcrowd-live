/**
 * Phase 16 — Window Mode HTTP routes.
 *
 * Token-protected endpoints:
 *   GET  /window/config   — returns current window config
 *   POST /window/config   — updates window config (hot-reload)
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import {
  WindowConfigSchema,
  loadWindowConfig,
  reloadWindowConfig,
  type WindowConfig,
} from '../window/window_config.js';

// ---------------------------------------------------------------------------
// Token validation
// ---------------------------------------------------------------------------

function getToken(): string | undefined {
  return process.env['LOCAL_SESSION_TOKEN'];
}

function validateToken(request: FastifyRequest, reply: FastifyReply): boolean {
  const token = getToken();
  if (!token) {
    reply
      .status(503)
      .send({ error: 'Gateway commands not configured (LOCAL_SESSION_TOKEN unset)' });
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
  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    reply.status(401).send({ error: 'Invalid token' });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export interface RegisterWindowRoutesOptions {
  /** Mutable reference to the current window config. */
  config: WindowConfig;
  /** Callback invoked when config is updated via POST. */
  onConfigUpdate?: (config: WindowConfig) => void;
}

export function registerWindowRoutes(
  app: FastifyInstance,
  opts: RegisterWindowRoutesOptions,
): void {
  let currentConfig = opts.config;

  // -------------------------------------------------------------------------
  // GET /window/config
  // -------------------------------------------------------------------------
  app.get('/window/config', (request, reply) => {
    if (!validateToken(request, reply)) return;
    reply.send(currentConfig);
  });

  // -------------------------------------------------------------------------
  // POST /window/config — hot-reload
  // -------------------------------------------------------------------------
  app.post('/window/config', (request, reply) => {
    if (!validateToken(request, reply)) return;

    const parseResult = WindowConfigSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400).send({
        error: 'Invalid window config',
        details: parseResult.error.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`,
        ),
      });
      return;
    }

    currentConfig = parseResult.data;
    if (opts.onConfigUpdate) {
      opts.onConfigUpdate(currentConfig);
    }
    reply.send({ ok: true, message: 'Window config updated', config: currentConfig });
  });
}

// Re-export for convenience
export { loadWindowConfig, reloadWindowConfig };
