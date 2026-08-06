/**
 * Phase 11 — Gift Economy HTTP endpoint tests.
 *
 * Tests each endpoint with/without token, POST hot-reload, preview shape.
 * Target: ≥5 tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import {
  GiftEconomyConfigSchema,
  type GiftEconomyConfig,
} from '../src/gifts/gift_config.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN = 'test-token-phase11';

function loadTestConfig(): GiftEconomyConfig {
  const configDir = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'config',
  );
  const raw = readFileSync(join(configDir, 'gifts.json'), 'utf8');
  return GiftEconomyConfigSchema.parse(JSON.parse(raw));
}

describe('Gift Economy HTTP endpoints', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env['LOCAL_SESSION_TOKEN'] = TOKEN;
    app = buildApp({
      logger: false,
      enablePipeline: true,
      enableGiftEconomy: true,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    delete process.env['LOCAL_SESSION_TOKEN'];
  });

  it('GET /gifts/config returns config with valid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/gifts/config',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.tiers).toHaveLength(4);
    expect(body.mappings).toHaveLength(24);
  });

  it('GET /gifts/config rejects without token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/gifts/config',
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /gifts/config rejects with invalid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/gifts/config',
      headers: { authorization: 'Bearer wrong-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /gifts/preview returns mapping preview', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/gifts/preview',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.mappings).toHaveLength(24);
    expect(body.mappings[0]).toHaveProperty('giftId');
    expect(body.mappings[0]).toHaveProperty('tierId');
    expect(body.mappings[0]).toHaveProperty('impactType');
  });

  it('GET /gifts/stats returns orchestrator stats', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/gifts/stats',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('eventsProcessed');
    expect(body).toHaveProperty('commandsProduced');
    expect(body).toHaveProperty('cooldownHits');
    expect(body).toHaveProperty('overflowConversions');
  });

  it('POST /gifts/config hot-reloads with valid config', async () => {
    const newConfig = loadTestConfig();
    // Modify a value to prove hot-reload works
    newConfig.cooldowns.perUserMs = 5000;

    const res = await app.inject({
      method: 'POST',
      url: '/gifts/config',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: newConfig,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);

    // Verify the config was updated
    const configRes = await app.inject({
      method: 'GET',
      url: '/gifts/config',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    const updatedConfig = JSON.parse(configRes.payload);
    expect(updatedConfig.cooldowns.perUserMs).toBe(5000);
  });

  it('POST /gifts/config rejects invalid config', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/gifts/config',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { tiers: [], mappings: [] },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toContain('Invalid gift economy config');
  });

  it('GET /gifts/stats without token returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/gifts/stats',
    });
    expect(res.statusCode).toBe(401);
  });
});
