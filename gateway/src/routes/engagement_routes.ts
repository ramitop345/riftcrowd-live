/**
 * Phase 12 — Free Engagement HTTP routes.
 *
 * Token-protected endpoints:
 *   GET  /engagement/config   — returns current free engagement config
 *   POST /engagement/config   — updates config (hot-reload)
 *   GET  /engagement/stats    — returns orchestrator stats
 *   GET  /engagement/top      — top contributors list
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { FreeEngagementConfigSchema } from '../engagement/free_engagement_config.js';
import type { FreeEngagement } from '../engagement/free_engagement.js';

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

export interface RegisterEngagementRoutesOptions {
  freeEngagement: FreeEngagement;
}

export function registerEngagementRoutes(
  app: FastifyInstance,
  opts: RegisterEngagementRoutesOptions,
): void {
  const { freeEngagement } = opts;

  // -------------------------------------------------------------------------
  // GET /engagement/config
  // -------------------------------------------------------------------------
  app.get('/engagement/config', (request, reply) => {
    if (!validateToken(request, reply)) return;
    reply.send(freeEngagement.getConfig());
  });

  // -------------------------------------------------------------------------
  // POST /engagement/config — hot-reload
  // -------------------------------------------------------------------------
  app.post('/engagement/config', (request, reply) => {
    if (!validateToken(request, reply)) return;

    const parseResult = FreeEngagementConfigSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400).send({
        error: 'Invalid free engagement config',
        details: parseResult.error.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`,
        ),
      });
      return;
    }

    freeEngagement.reloadConfig(parseResult.data);
    reply.send({ ok: true, message: 'Free engagement config hot-reloaded' });
  });

  // -------------------------------------------------------------------------
  // GET /engagement/stats
  // -------------------------------------------------------------------------
  app.get('/engagement/stats', (request, reply) => {
    if (!validateToken(request, reply)) return;
    reply.send(freeEngagement.getStats());
  });

  // -------------------------------------------------------------------------
  // GET /engagement/top
  // -------------------------------------------------------------------------
  app.get('/engagement/top', (request, reply) => {
    if (!validateToken(request, reply)) return;
    reply.send({ contributors: freeEngagement.getTopContributors() });
  });
}
