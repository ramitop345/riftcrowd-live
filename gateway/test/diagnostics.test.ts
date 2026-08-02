/**
 * Phase 18 — Diagnostics route tests.
 *
 * Tests GET /version, POST /diagnostics/export (ZIP creation), and config redaction.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerVersionRoute, getVersionInfo } from '../src/routes/version_route.js';
import { registerDiagnosticsRoute } from '../src/routes/diagnostics_route.js';
import { config, sanitizeConfig } from '../src/config.js';
import { COMMAND_SCHEMA_VERSION } from '@riftcrowd/shared';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Phase 18 — Version Endpoint', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    registerVersionRoute(app);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /version returns version info', async () => {
    const response = await app.inject({ method: 'GET', url: '/version' });
    expect(response.statusCode).toBe(200);

    const body = response.json() as Record<string, unknown>;
    expect(body['version']).toBe('1.0.0');
    expect(body['schemaVersion']).toBe(COMMAND_SCHEMA_VERSION);
    expect(body['nodeVersion']).toBe(process.version);
    expect(body['buildTime']).toBeDefined();
    expect(body['godotVersion']).toBe('4.7.1');
  });

  it('getVersionInfo returns correct structure', () => {
    const info = getVersionInfo();
    expect(info.version).toBe('1.0.0');
    expect(info.schemaVersion).toBe(6);
    expect(info.nodeVersion).toBe(process.version);
    expect(info.godotVersion).toBe('4.7.1');
    expect(typeof info.buildTime).toBe('string');
  });
});

describe('Phase 18 — Diagnostics Export', () => {
  let app: FastifyInstance;
  let testLogDir: string;

  beforeAll(async () => {
    testLogDir = join(tmpdir(), `riftcrowd-diag-test-${Date.now()}`);
    mkdirSync(testLogDir, { recursive: true });

    app = Fastify({ logger: false });

    // Set a test token for auth
    process.env['LOCAL_SESSION_TOKEN'] = 'test-token';

    registerDiagnosticsRoute(app, { config, logDir: testLogDir });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    if (existsSync(testLogDir)) {
      rmSync(testLogDir, { recursive: true, force: true });
    }
    delete process.env['LOCAL_SESSION_TOKEN'];
  });

  it('POST /diagnostics/export requires auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/diagnostics/export',
    });
    expect(response.statusCode).toBe(401);
  });

  it('POST /diagnostics/export creates a ZIP file', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/diagnostics/export',
      headers: {
        authorization: 'Bearer test-token',
      },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as { ok: boolean; path: string };
    expect(body.ok).toBe(true);
    expect(body.path).toContain('diagnostics-');
    expect(body.path).toMatch(/\.zip$/);
    expect(existsSync(body.path)).toBe(true);
  });

  it('POST /diagnostics/export with wrong token returns 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/diagnostics/export',
      headers: {
        authorization: 'Bearer wrong-token',
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it('GET /diagnostics/info returns diagnostic data', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/diagnostics/info',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      config: Record<string, unknown>;
      system: Record<string, unknown>;
      health: Record<string, unknown>;
    };

    // Config should be redacted
    expect(body.config['localSessionToken']).toBe('***REDACTED***');

    // System info should be present
    expect(body.system['os']).toBeDefined();
    expect(body.system['nodeVersion']).toBe(process.version);

    // Health should be ok
    expect(body.health['gateway']).toEqual({ ok: true, status: 'running' });
  });
});

describe('Phase 18 — Config Redaction', () => {
  it('sanitizeConfig redacts LOCAL_SESSION_TOKEN', () => {
    const redacted = sanitizeConfig(config);
    expect(redacted['localSessionToken']).toBe('***REDACTED***');
  });

  it('sanitizeConfig preserves non-secret values', () => {
    const redacted = sanitizeConfig(config);
    expect(redacted['host']).toBe(config.host);
    expect(redacted['gatewayPort']).toBe(config.gatewayPort);
    expect(redacted['liveProvider']).toBe(config.liveProvider);
  });

  it('sanitizeConfig redacts TikFinity token when present', () => {
    const redacted = sanitizeConfig(config);
    if (config.tikfinity?.token) {
      expect((redacted['tikfinity'] as Record<string, unknown>)['token']).toBe('***REDACTED***');
    }
  });
});
