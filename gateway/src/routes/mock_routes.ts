/**
 * Phase 9 — Mock adapter HTTP routes for dashboard integration.
 *
 * Token-protected endpoints:
 *   POST /mock/start     — start a scenario by name
 *   POST /mock/stop      — stop the running adapter
 *   POST /mock/advance   — advance TestClock manually
 *   GET  /mock/state     — adapter state and stats
 *   POST /mock/record    — run a scenario and save RecordedSession
 *   POST /mock/replay    — replay a saved session
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { Pipeline } from '../pipeline/pipeline.js';
import type { MatchDirector } from '../director/match_director.js';
import { MockLiveAdapter } from '../adapters/mock_live_adapter.js';
import { ReplayAdapter } from '../adapters/replay.js';
import { TestClock } from '../adapters/test_clock.js';
import { getScenario, listScenarios, type Scenario } from '../adapters/scenarios.js';
import { SessionBuilder, saveSession, loadSession } from '../adapters/recording.js';

// ---------------------------------------------------------------------------
// Token validation (mirrors gateway_routes.ts pattern)
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
// Route state
// ---------------------------------------------------------------------------

interface MockState {
  adapter: MockLiveAdapter | ReplayAdapter | null;
  clock: TestClock | null;
  scenario: Scenario | null;
  eventsEmitted: number;
  commandsProduced: number;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export interface RegisterMockRoutesOptions {
  pipeline: Pipeline;
  director?: MatchDirector | null;
}

export function registerMockRoutes(
  app: FastifyInstance,
  opts: RegisterMockRoutesOptions,
): void {
  const { pipeline, director } = opts;
  const state: MockState = {
    adapter: null,
    clock: null,
    scenario: null,
    eventsEmitted: 0,
    commandsProduced: 0,
  };

  // Data directory for recordings
  const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'recordings');

  // -------------------------------------------------------------------------
  // POST /mock/start
  // -------------------------------------------------------------------------
  app.post('/mock/start', async (request, reply) => {
    if (!validateToken(request, reply)) return;

    const body = request.body as { scenario?: string; speedMultiplier?: number } | null;
    const scenarioName = body?.scenario;
    if (!scenarioName || typeof scenarioName !== 'string') {
      reply.status(400).send({ error: 'Missing or invalid scenario name' });
      return;
    }

    // Stop any running adapter
    if (state.adapter) {
      await state.adapter.stop();
    }

    try {
      const scenario = getScenario(scenarioName);
      const clock = new TestClock(0);
      const adapter = new MockLiveAdapter({ scenario, clock, pipeline, director: director ?? undefined });

      // Track events
      adapter.onEvent(() => {
        state.eventsEmitted++;
      });

      await adapter.start();

      state.adapter = adapter;
      state.clock = clock;
      state.scenario = scenario;
      state.eventsEmitted = 0;
      state.commandsProduced = 0;

      reply.send({
        ok: true,
        scenario: scenario.name,
        durationMs: scenario.durationMs,
        eventCount: scenario.events.length,
      });
    } catch (err: unknown) {
      reply.status(400).send({ error: String(err) });
    }
  });

  // -------------------------------------------------------------------------
  // POST /mock/stop
  // -------------------------------------------------------------------------
  app.post('/mock/stop', async (request, reply) => {
    if (!validateToken(request, reply)) return;

    if (state.adapter) {
      await state.adapter.stop();
      state.adapter = null;
    }

    reply.send({ ok: true });
  });

  // -------------------------------------------------------------------------
  // POST /mock/advance
  // -------------------------------------------------------------------------
  app.post('/mock/advance', (request, reply) => {
    if (!validateToken(request, reply)) return;

    const body = request.body as { ms?: number } | null;
    const ms = body?.ms;
    if (typeof ms !== 'number' || ms < 0) {
      reply.status(400).send({ error: 'Missing or invalid ms value' });
      return;
    }

    if (!state.clock) {
      reply.status(409).send({ error: 'No adapter running' });
      return;
    }

    const prevEvents = state.adapter?.emittedEvents.length ?? 0;
    state.clock.advance(ms);
    const newEvents = (state.adapter?.emittedEvents.length ?? 0) - prevEvents;

    reply.send({
      ok: true,
      currentTimeMs: state.clock.now(),
      eventsEmitted: newEvents,
    });
  });

  // -------------------------------------------------------------------------
  // GET /mock/state
  // -------------------------------------------------------------------------
  app.get('/mock/state', (request, reply) => {
    if (!validateToken(request, reply)) return;

    const adapter = state.adapter;
    reply.send({
      running: adapter !== null && (adapter instanceof MockLiveAdapter ? adapter.isRunning : true),
      connected: adapter?.isConnected() ?? false,
      scenario: state.scenario?.name ?? null,
      availableScenarios: listScenarios(),
      clockTimeMs: state.clock?.now() ?? 0,
      eventsEmitted: adapter?.emittedEvents.length ?? 0,
      commandsProduced: adapter instanceof MockLiveAdapter ? adapter.commands.length : (adapter instanceof ReplayAdapter ? adapter.commands.length : 0),
      pendingEvents: adapter instanceof MockLiveAdapter ? adapter.pendingCount : (adapter instanceof ReplayAdapter ? adapter.pendingCount : 0),
      directorStates: adapter instanceof MockLiveAdapter ? adapter.directorStates : [],
    });
  });

  // -------------------------------------------------------------------------
  // POST /mock/record
  // -------------------------------------------------------------------------
  app.post('/mock/record', async (request, reply) => {
    if (!validateToken(request, reply)) return;

    const body = request.body as { scenario?: string } | null;
    const scenarioName = body?.scenario;
    if (!scenarioName || typeof scenarioName !== 'string') {
      reply.status(400).send({ error: 'Missing or invalid scenario name' });
      return;
    }

    try {
      const scenario = getScenario(scenarioName);
      const clock = new TestClock(0);
      const builder = new SessionBuilder();
      const adapter = new MockLiveAdapter({ scenario, clock, pipeline, director: director ?? undefined });

      adapter.onEvent((event) => {
        builder.addEvent(clock.now(), event);
      });

      await adapter.start();
      adapter.runToEnd(5000);
      await adapter.stop();

      // Add commands and director states to builder
      for (const cmd of adapter.commands) {
        builder.addCommand(cmd);
      }
      for (const ds of adapter.directorStates) {
        builder.addDirectorSnapshot({ state: ds });
      }

      const session = builder.build();
      const outputPath = join(dataDir, `${scenarioName}.json`);
      saveSession(session, outputPath);

      reply.send({
        ok: true,
        scenario: scenarioName,
        eventsRecorded: session.events.length,
        commandsRecorded: session.commands.length,
        path: outputPath,
      });
    } catch (err: unknown) {
      reply.status(500).send({ error: String(err) });
    }
  });

  // -------------------------------------------------------------------------
  // POST /mock/replay
  // -------------------------------------------------------------------------
  app.post('/mock/replay', async (request, reply) => {
    if (!validateToken(request, reply)) return;

    const body = request.body as { sessionPath?: string } | null;
    const sessionPath = body?.sessionPath;
    if (!sessionPath || typeof sessionPath !== 'string') {
      reply.status(400).send({ error: 'Missing or invalid sessionPath' });
      return;
    }

    // FIX 4: resolve sessionPath relative to recordings directory and validate bounds
    const resolved = resolve(dataDir, sessionPath);
    if (!resolved.startsWith(dataDir + sep)) {
      reply.status(400).send({ error: 'Invalid session path' });
      return;
    }

    if (!existsSync(resolved)) {
      reply.status(404).send({ error: 'Session file not found' });
      return;
    }

    try {
      const session = loadSession(resolved);
      const clock = new TestClock(0);

      // Stop any running adapter
      if (state.adapter) {
        await state.adapter.stop();
      }

      const adapter = new ReplayAdapter({ session, clock, pipeline, director: director ?? undefined });
      await adapter.start();
      adapter.runToEnd(5000);

      state.adapter = adapter;
      state.clock = clock;
      state.scenario = null;

      reply.send({
        ok: true,
        eventsReplayed: adapter.emittedEvents.length,
        commandsProduced: adapter.commands.length,
      });
    } catch (err: unknown) {
      reply.status(500).send({ error: String(err) });
    }
  });
}
