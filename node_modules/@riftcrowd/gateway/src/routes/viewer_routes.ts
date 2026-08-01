/**
 * Phase 13 — Viewer moderation HTTP routes.
 *
 * Token-protected endpoints:
 *   POST /viewer/hide   — hide a viewer (moderation)
 *   POST /viewer/unhide — unhide a viewer
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import type { MatchDirector } from '../director/match_director.js';

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
      .send({ error: 'Viewer commands not configured (LOCAL_SESSION_TOKEN unset)' });
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

export interface RegisterViewerRoutesOptions {
  director: MatchDirector;
}

export function registerViewerRoutes(
  app: FastifyInstance,
  opts: RegisterViewerRoutesOptions,
): void {
  const { director } = opts;

  // -------------------------------------------------------------------------
  // POST /viewer/hide
  // -------------------------------------------------------------------------
  app.post('/viewer/hide', (request, reply) => {
    if (!validateToken(request, reply)) return;

    const body = request.body as { viewerId?: string } | null;
    const viewerId = body?.viewerId;
    if (!viewerId || typeof viewerId !== 'string') {
      reply.status(400).send({ error: 'Missing or invalid viewerId' });
      return;
    }

    director.hideViewer(viewerId);
    reply.send({ ok: true, viewerId, hidden: true });
  });

  // -------------------------------------------------------------------------
  // POST /viewer/unhide
  // -------------------------------------------------------------------------
  app.post('/viewer/unhide', (request, reply) => {
    if (!validateToken(request, reply)) return;

    const body = request.body as { viewerId?: string } | null;
    const viewerId = body?.viewerId;
    if (!viewerId || typeof viewerId !== 'string') {
      reply.status(400).send({ error: 'Missing or invalid viewerId' });
      return;
    }

    director.unhideViewer(viewerId);
    reply.send({ ok: true, viewerId, hidden: false });
  });
}
