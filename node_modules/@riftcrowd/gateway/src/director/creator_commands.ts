/**
 * Creator commands — HTTP REST endpoints for controlling the Match Director.
 *
 * All endpoints require Authorization: Bearer <LOCAL_SESSION_TOKEN>.
 * If LOCAL_SESSION_TOKEN is unset, all endpoints return 503.
 * Invalid token → 401. Invalid state for command → 409.
 *
 * POST /director/skip    — jump to next stage
 * POST /director/pause   — freeze timers + mock sim
 * POST /director/resume  — unfreeze
 * POST /director/end     — force RESULTS with current winner
 * POST /director/restart — force MODE_VOTE with fresh seed
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import type { MatchDirector } from './match_director.js';

// ---------------------------------------------------------------------------
// Token validation helper
// ---------------------------------------------------------------------------

function getToken(): string | undefined {
  return process.env['LOCAL_SESSION_TOKEN'];
}

function validateToken(request: FastifyRequest, reply: FastifyReply): boolean {
  const token = getToken();
  if (!token) {
    reply.status(503).send({ error: 'Director commands not configured (LOCAL_SESSION_TOKEN unset)' });
    return false;
  }

  const authHeader = request.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Missing or malformed Authorization header' });
    return false;
  }

  const provided = authHeader.slice(7);

  // timing-safe token comparison per security best practice
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

/**
 * Registers creator command routes on the given Fastify instance.
 * The `director` must be attached to the app (via decorator or closure).
 */
export function registerCreatorRoutes(app: FastifyInstance, director: MatchDirector): void {
  app.post('/director/skip', (request, reply) => {
    if (!validateToken(request, reply)) return;

    if (director.state === 'IDLE') {
      reply.status(409).send({ error: 'Cannot skip: director is IDLE' });
      return;
    }

    director.skipStage();
    reply.send({ ok: true, state: director.state });
  });

  app.post('/director/pause', (request, reply) => {
    if (!validateToken(request, reply)) return;

    if (director.state === 'IDLE') {
      reply.status(409).send({ error: 'Cannot pause: director is IDLE' });
      return;
    }

    director.pause();
    reply.send({ ok: true, paused: true });
  });

  app.post('/director/resume', (request, reply) => {
    if (!validateToken(request, reply)) return;

    if (director.state === 'IDLE') {
      reply.status(409).send({ error: 'Cannot resume: director is IDLE' });
      return;
    }

    director.resume();
    reply.send({ ok: true, paused: false });
  });

  app.post('/director/end', (request, reply) => {
    if (!validateToken(request, reply)) return;

    if (director.state === 'IDLE' || director.state === 'RESULTS') {
      reply.status(409).send({ error: `Cannot end: director is ${director.state}` });
      return;
    }

    director.forceEnd();
    reply.send({ ok: true, state: director.state });
  });

  app.post('/director/restart', (request, reply) => {
    if (!validateToken(request, reply)) return;

    director.restart();
    reply.send({ ok: true, state: director.state });
  });

  // GET /director/state — read current director state (also requires token)
  app.get('/director/state', (request, reply) => {
    if (!validateToken(request, reply)) return;

    const snap = director.get_state();
    reply.send({
      state: snap.state,
      timerSeconds: snap.timerSeconds,
      currentMode: snap.currentMode,
      currentModeId: snap.currentModeId,
      selectedFactions: Object.fromEntries(snap.selectedFactions),
      stats: snap.stats,
      paused: director.paused,
    });
  });
}
