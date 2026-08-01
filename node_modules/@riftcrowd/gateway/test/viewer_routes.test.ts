/**
 * Phase 13 — Viewer moderation route tests.
 *
 * Tests POST /viewer/hide and POST /viewer/unhide with/without token,
 * missing viewerId, and valid operations.
 * Target: 7 tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

const TOKEN = 'test-token-phase13-viewer';

describe('Viewer moderation HTTP endpoints', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env['LOCAL_SESSION_TOKEN'] = TOKEN;
    app = buildApp({
      logger: false,
      enablePipeline: true,
      enableDirector: true,
      enableViewerRoutes: true,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    delete process.env['LOCAL_SESSION_TOKEN'];
  });

  it('POST /viewer/hide succeeds with valid token and viewerId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/viewer/hide',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { viewerId: 'trouble_viewer_42' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.viewerId).toBe('trouble_viewer_42');
    expect(body.hidden).toBe(true);
  });

  it('POST /viewer/hide rejects without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/viewer/hide',
      payload: { viewerId: 'v1' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /viewer/hide rejects with invalid token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/viewer/hide',
      headers: { authorization: 'Bearer wrong-token' },
      payload: { viewerId: 'v1' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /viewer/hide rejects missing viewerId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/viewer/hide',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /viewer/unhide succeeds with valid token and viewerId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/viewer/unhide',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { viewerId: 'trouble_viewer_42' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.viewerId).toBe('trouble_viewer_42');
    expect(body.hidden).toBe(false);
  });

  it('POST /viewer/unhide rejects without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/viewer/unhide',
      payload: { viewerId: 'v1' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /viewer/unhide rejects missing viewerId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/viewer/unhide',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { viewerId: '' },
    });
    expect(res.statusCode).toBe(400);
  });
});
