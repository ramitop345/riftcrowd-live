/**
 * Phase 16 — Preflight HTTP routes.
 *
 * Token-protected endpoints:
 *   GET  /preflight/check  — returns last preflight result (or empty)
 *   POST /preflight/run    — runs all preflight checks and returns results
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import type { PreflightOrchestrator, PreflightResult } from '../preflight/preflight_orchestrator.js';

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

export interface RegisterPreflightRoutesOptions {
  orchestrator: PreflightOrchestrator;
}

export function registerPreflightRoutes(
  app: FastifyInstance,
  opts: RegisterPreflightRoutesOptions,
): void {
  const { orchestrator } = opts;
  let lastResult: PreflightResult | null = null;

  // -------------------------------------------------------------------------
  // GET /preflight/check — returns last preflight result
  // -------------------------------------------------------------------------
  app.get('/preflight/check', (request, reply) => {
    if (!validateToken(request, reply)) return;

    if (lastResult) {
      reply.send(lastResult);
    } else {
      reply.send({ ok: false, checks: [], message: 'No preflight checks have been run yet' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /preflight/run — runs all checks
  // -------------------------------------------------------------------------
  app.post('/preflight/run', async (request, reply) => {
    if (!validateToken(request, reply)) return;

    lastResult = await orchestrator.run();
    reply.send(lastResult);
  });
}
