/**
 * Phase 15 — VFX, Audio, Readability HTTP route tests.
 *
 * Tests: VFX routes (7+), Audio routes (5+), Readability routes (4+),
 * Command schema (5+).
 * Total target: ≥21 tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp, type BuildAppOptions } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import { VFX_DEFAULTS } from '../src/vfx/vfx_config.js';
import { AUDIO_DEFAULTS } from '../src/audio/audio_config.js';
import { READABILITY_DEFAULTS } from '../src/readability/readability_config.js';
import {
  COMMAND_SCHEMA_VERSION,
  GameCommandTypeSchema,
  GameCommandSchema,
} from '@riftcrowd/shared';

const TOKEN = 'test-token-phase15';
const AUTH = { authorization: `Bearer ${TOKEN}` };

// Set token before tests
process.env['LOCAL_SESSION_TOKEN'] = TOKEN;

// ---------------------------------------------------------------------------
// App setup helper
// ---------------------------------------------------------------------------

function buildTestApp(): FastifyInstance {
  const opts: BuildAppOptions = {
    logger: false,
    enablePipeline: true,
    enableVFX: true,
  };
  return buildApp(opts);
}

// ===================================================================
// Command Schema
// ===================================================================

describe('Command Schema v5', () => {
  it('COMMAND_SCHEMA_VERSION is 5', () => {
    expect(COMMAND_SCHEMA_VERSION).toBe(5);
  });

  it('SPAWN_VFX is a valid command type', () => {
    expect(GameCommandTypeSchema.parse('SPAWN_VFX')).toBe('SPAWN_VFX');
  });

  it('SPOTLIGHT_CARD is a valid command type', () => {
    expect(GameCommandTypeSchema.parse('SPOTLIGHT_CARD')).toBe('SPOTLIGHT_CARD');
  });

  it('SUPPORTER_CALLOUT is a valid command type', () => {
    expect(GameCommandTypeSchema.parse('SUPPORTER_CALLOUT')).toBe('SUPPORTER_CALLOUT');
  });

  it('CAMERA_IMPULSE is a valid command type', () => {
    expect(GameCommandTypeSchema.parse('CAMERA_IMPULSE')).toBe('CAMERA_IMPULSE');
  });

  it('PLAY_AUDIO is a valid command type', () => {
    expect(GameCommandTypeSchema.parse('PLAY_AUDIO')).toBe('PLAY_AUDIO');
  });

  it('full command validates with schemaVersion 5', () => {
    const cmd = {
      schemaVersion: 5,
      id: 'cmd-test',
      type: 'SPAWN_VFX',
      createdAt: new Date().toISOString(),
      sourceEventIds: ['evt-1'],
    };
    expect(GameCommandSchema.parse(cmd).schemaVersion).toBe(5);
  });

  it('old schemaVersion 4 is rejected', () => {
    const cmd = {
      schemaVersion: 4,
      id: 'cmd-test',
      type: 'SPAWN_VFX',
      createdAt: new Date().toISOString(),
      sourceEventIds: ['evt-1'],
    };
    expect(() => GameCommandSchema.parse(cmd)).toThrow();
  });
});

// ===================================================================
// VFX Routes
// ===================================================================

describe('VFX Routes', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /vfx/config requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/vfx/config' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /vfx/config returns config', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/vfx/config',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.quality).toBe('high');
    expect(body.pool.maxParticles).toBe(100);
  });

  it('POST /vfx/config hot-reloads', async () => {
    const newConfig = { ...VFX_DEFAULTS, quality: 'low' as const };
    const res = await app.inject({
      method: 'POST',
      url: '/vfx/config',
      headers: AUTH,
      payload: newConfig,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);

    // Verify updated
    const getRes = await app.inject({
      method: 'GET',
      url: '/vfx/config',
      headers: AUTH,
    });
    const config = JSON.parse(getRes.payload);
    expect(config.quality).toBe('low');
  });

  it('POST /vfx/config rejects invalid config', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/vfx/config',
      headers: AUTH,
      payload: { quality: 'extreme' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /vfx/stats returns pool stats', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/vfx/stats',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(typeof body.active).toBe('number');
    expect(typeof body.idle).toBe('number');
    expect(typeof body.dropped).toBe('number');
  });

  it('POST /vfx/trigger fires a VFX event', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/vfx/trigger',
      headers: AUTH,
      payload: { eventType: 'like', viewerId: 'test-v' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.commandsEmitted).toBeGreaterThan(0);
  });

  it('POST /vfx/trigger with invalid token rejected', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/vfx/trigger',
      headers: { authorization: 'Bearer wrong-token' },
      payload: { eventType: 'like' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===================================================================
// Audio Routes
// ===================================================================

describe('Audio Routes', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /audio/config requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/audio/config' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /audio/config returns config', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/audio/config',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.volumeGroups.master).toBe(80);
    expect(body.sfx.hit).toBe('audio/sfx/hit.ogg');
  });

  it('POST /audio/config hot-reloads', async () => {
    const newConfig = {
      ...AUDIO_DEFAULTS,
      volumeGroups: { ...AUDIO_DEFAULTS.volumeGroups, master: 50 },
    };
    const res = await app.inject({
      method: 'POST',
      url: '/audio/config',
      headers: AUTH,
      payload: newConfig,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
  });

  it('POST /audio/config rejects invalid config', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/audio/config',
      headers: AUTH,
      payload: { volumeGroups: { master: 200 } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /audio/trigger fires an audio event', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/audio/trigger',
      headers: AUTH,
      payload: { eventType: 'follow', viewerId: 'test-v' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.commandsEmitted).toBeGreaterThan(0);
  });
});

// ===================================================================
// Readability Routes
// ===================================================================

describe('Readability Routes', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /readability/config requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/readability/config' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /readability/config returns config', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/readability/config',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.fontSize).toBe('medium');
    expect(body.colorBlindMode).toBe(false);
  });

  it('POST /readability/config hot-reloads', async () => {
    const newConfig = {
      ...READABILITY_DEFAULTS,
      fontSize: 'large' as const,
    };
    const res = await app.inject({
      method: 'POST',
      url: '/readability/config',
      headers: AUTH,
      payload: newConfig,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
  });

  it('POST /readability/config rejects invalid config', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/readability/config',
      headers: AUTH,
      payload: { fontSize: 'giant' },
    });
    expect(res.statusCode).toBe(400);
  });
});
