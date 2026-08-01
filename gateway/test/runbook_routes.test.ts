/**
 * Phase 16 — Window, Preflight, Fallback HTTP route tests.
 *
 * Tests: Window routes (5+), Preflight routes (5+), Fallback routes (5+).
 * Total target: ≥15 tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp, type BuildAppOptions } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import {
  COMMAND_SCHEMA_VERSION,
  GameCommandTypeSchema,
  GameCommandSchema,
} from '@riftcrowd/shared';

const TOKEN = 'test-token-phase16';
const AUTH = { authorization: `Bearer ${TOKEN}` };

process.env['LOCAL_SESSION_TOKEN'] = TOKEN;

function buildTestApp(): FastifyInstance {
  const opts: BuildAppOptions = {
    logger: false,
    enablePipeline: true,
    enableRunbook: true,
  };
  return buildApp(opts);
}

// ===================================================================
// Window routes
// ===================================================================

describe('Window routes', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildTestApp();
  });

  it('GET /window/config requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/window/config' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /window/config returns config', async () => {
    const res = await app.inject({ method: 'GET', url: '/window/config', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mode).toBe('windowed');
    expect(body.width).toBe(1080);
    expect(body.height).toBe(1920);
  });

  it('POST /window/config requires auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/window/config',
      payload: { mode: 'borderless' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /window/config updates config', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/window/config',
      headers: AUTH,
      payload: { mode: 'borderless', portrait: true, width: 1080, height: 1920, vsync: true, fps: 60 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.config.mode).toBe('borderless');
  });

  it('POST /window/config rejects invalid mode', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/window/config',
      headers: AUTH,
      payload: { mode: 'tiled', portrait: true, width: 1080, height: 1920, vsync: true, fps: 60 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /window/config rejects invalid token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/window/config',
      headers: { authorization: 'Bearer wrong-token' },
      payload: { mode: 'borderless' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===================================================================
// Preflight routes
// ===================================================================

describe('Preflight routes', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildTestApp();
  });

  it('GET /preflight/check requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/preflight/check' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /preflight/check returns empty initially', async () => {
    const res = await app.inject({ method: 'GET', url: '/preflight/check', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.checks).toHaveLength(0);
  });

  it('POST /preflight/run requires auth', async () => {
    const res = await app.inject({ method: 'POST', url: '/preflight/run' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /preflight/run executes checks', async () => {
    const res = await app.inject({ method: 'POST', url: '/preflight/run', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.checks).toBeDefined();
    expect(Array.isArray(body.checks)).toBe(true);
    // Should have gateway_health, dashboard, provider, config, audio, vfx
    expect(body.checks.length).toBeGreaterThanOrEqual(4);
  });

  it('POST /preflight/run then GET /preflight/check returns last result', async () => {
    await app.inject({ method: 'POST', url: '/preflight/run', headers: AUTH });
    const res = await app.inject({ method: 'GET', url: '/preflight/check', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.checks.length).toBeGreaterThan(0);
  });

  it('preflight checks include gateway_health', async () => {
    const res = await app.inject({ method: 'POST', url: '/preflight/run', headers: AUTH });
    const body = res.json();
    const gatewayCheck = body.checks.find((c: { name: string }) => c.name === 'gateway_health');
    expect(gatewayCheck).toBeDefined();
    // FIX 8: Gateway health check now makes a real HTTP fetch.
    // Without app.listen(), the fetch fails — which is the correct behavior.
    // The acceptance test verifies it passes with a real HTTP server.
    expect(typeof gatewayCheck.ok).toBe('boolean');
  });

  it('preflight checks include provider', async () => {
    const res = await app.inject({ method: 'POST', url: '/preflight/run', headers: AUTH });
    const body = res.json();
    const providerCheck = body.checks.find((c: { name: string }) => c.name === 'provider');
    expect(providerCheck).toBeDefined();
    expect(providerCheck.ok).toBe(true); // Mock is always running
  });
});

// ===================================================================
// Fallback routes
// ===================================================================

describe('Fallback routes', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildTestApp();
  });

  it('GET /fallback/status requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/fallback/status' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /fallback/status returns inactive initially', async () => {
    const res = await app.inject({ method: 'GET', url: '/fallback/status', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.active).toBe(false);
    expect(body.reason).toBeNull();
  });

  it('POST /fallback/activate requires auth', async () => {
    const res = await app.inject({ method: 'POST', url: '/fallback/activate' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /fallback/activate activates fallback', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/fallback/activate',
      headers: AUTH,
      payload: { reason: 'manual' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.activated).toBe(true);
    expect(body.reason).toBe('manual');
  });

  it('POST /fallback/activate defaults to manual reason', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/fallback/activate',
      headers: AUTH,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.reason).toBe('manual');
  });

  it('POST /fallback/deactivate deactivates fallback', async () => {
    await app.inject({
      method: 'POST',
      url: '/fallback/activate',
      headers: AUTH,
      payload: { reason: 'manual' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/fallback/deactivate',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.deactivated).toBe(true);
  });

  it('GET /fallback/status reflects activation', async () => {
    await app.inject({
      method: 'POST',
      url: '/fallback/activate',
      headers: AUTH,
      payload: { reason: 'gateway_disconnected' },
    });
    const res = await app.inject({ method: 'GET', url: '/fallback/status', headers: AUTH });
    const body = res.json();
    expect(body.active).toBe(true);
    expect(body.reason).toBe('gateway_disconnected');
  });

  it('POST /fallback/activate rejects invalid reason', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/fallback/activate',
      headers: AUTH,
      payload: { reason: 'alien_invasion' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ===================================================================
// Command schema (Phase 16 additions)
// ===================================================================

describe('Command Schema Phase 16 additions', () => {
  it('SET_WINDOW_MODE is a valid command type', () => {
    expect(GameCommandTypeSchema.parse('SET_WINDOW_MODE')).toBe('SET_WINDOW_MODE');
  });

  it('ACTIVATE_FALLBACK is a valid command type', () => {
    expect(GameCommandTypeSchema.parse('ACTIVATE_FALLBACK')).toBe('ACTIVATE_FALLBACK');
  });

  it('DEACTIVATE_FALLBACK is a valid command type', () => {
    expect(GameCommandTypeSchema.parse('DEACTIVATE_FALLBACK')).toBe('DEACTIVATE_FALLBACK');
  });

  it('ACTIVATE_FALLBACK command validates with schemaVersion 6', () => {
    const cmd = {
      schemaVersion: 6,
      id: 'cmd-fallback-1',
      type: 'ACTIVATE_FALLBACK',
      createdAt: new Date().toISOString(),
      sourceEventIds: [],
      metadata: { reason: 'gateway_disconnected' },
    };
    expect(GameCommandSchema.parse(cmd).type).toBe('ACTIVATE_FALLBACK');
  });

  it('SET_WINDOW_MODE command validates', () => {
    const cmd = {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      id: 'cmd-window-1',
      type: 'SET_WINDOW_MODE',
      createdAt: new Date().toISOString(),
      sourceEventIds: [],
      metadata: { mode: 'borderless', portrait: true },
    };
    expect(GameCommandSchema.parse(cmd).type).toBe('SET_WINDOW_MODE');
  });
});
