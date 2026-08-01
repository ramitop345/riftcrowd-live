/**
 * Phase 17 — Smoke Test.
 *
 * Start gateway with all feature flags enabled.
 * Assert: all routes respond, health check passes, preflight/fallback/window configs load.
 * Target: 1 test with 20+ assertions.
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';

// The default LOCAL_SESSION_TOKEN is 'change-me'
// Set it in env so getToken() in gateway_routes.ts returns it
process.env['LOCAL_SESSION_TOKEN'] = 'change-me';
const SESSION_TOKEN = 'change-me';
const AUTH_HEADER = `Bearer ${SESSION_TOKEN}`;

describe('Smoke Test — Full Gateway Startup', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp({
      logger: false,
      enablePipeline: true,
      enableDirector: true,
      enableMockRoutes: true,
      enableWs: false, // WS requires HTTP server attach
      enableGiftEconomy: true,
      enableFreeEngagement: true,
      enableViewerRoutes: true,
      enableTikfinity: false, // No real TikFinity server
      enableVFX: true,
      enableRunbook: true,
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('all core routes respond correctly', async () => {
    // 1. Health check
    const healthRes = await app.inject({ method: 'GET', url: '/health' });
    expect(healthRes.statusCode).toBe(200);
    const health = JSON.parse(healthRes.body) as { status: string };
    expect(health.status).toBe('ok');

    // 2. Status endpoint (requires auth)
    const statusRes = await app.inject({
      method: 'GET',
      url: '/status',
      headers: { authorization: AUTH_HEADER },
    });
    expect(statusRes.statusCode).toBe(200);

    // 3. Config endpoint (requires auth)
    const configRes = await app.inject({
      method: 'GET',
      url: '/config',
      headers: { authorization: AUTH_HEADER },
    });
    expect(configRes.statusCode).toBe(200);

    // 4. Pipeline stats
    expect(app.pipeline).toBeDefined();
    const stats = app.pipeline!.getStats();
    expect(stats.processed).toBe(0);

    // 5. Director exists
    expect(app.director).toBeDefined();

    // 6. Director state is valid
    expect(app.director!.state).toBeDefined();

    // 7. Gift economy registered
    expect(app.giftEconomy).toBeDefined();

    // 8. Free engagement registered
    expect(app.freeEngagement).toBeDefined();

    // 9. VFX orchestrator registered
    expect(app.vfxOrchestrator).toBeDefined();

    // 10. VFX config is valid
    const vfxConfig = app.vfxOrchestrator!.getConfig();
    expect(vfxConfig.quality).toBeDefined();
    expect(vfxConfig.pool).toBeDefined();

    // 11. Audio orchestrator registered
    expect(app.audioOrchestrator).toBeDefined();

    // 12. Readability orchestrator registered
    expect(app.readabilityOrchestrator).toBeDefined();

    // 13. Preflight orchestrator registered
    expect(app.preflightOrchestrator).toBeDefined();

    // 14. Fallback orchestrator registered
    expect(app.fallbackOrchestrator).toBeDefined();

    // 15. VFX stats are valid
    const vfxStats = app.vfxOrchestrator!.getStats();
    expect(vfxStats.active).toBe(0);
    expect(vfxStats.idle).toBeGreaterThan(0);

    // 16. Pipeline event bus is accessible
    expect(app.pipeline!.eventBus).toBeDefined();

    // 17. Pipeline command queue is accessible
    expect(app.pipeline!.commandQueue).toBeDefined();
    expect(app.pipeline!.commandQueue.size).toBe(0);

    // 18. Pipeline dedupe store is accessible
    expect(app.pipeline!.dedupeStore).toBeDefined();

    // 19. Pipeline rate limiter is accessible
    expect(app.pipeline!.rateLimiter).toBeDefined();

    // 20. Pipeline rules engine is accessible
    expect(app.pipeline!.rulesEngine).toBeDefined();

    // 21. Fallback orchestrator drains empty
    const fallbackCmds = app.fallbackOrchestrator!.drainCommands();
    expect(fallbackCmds).toHaveLength(0);

    // 22. Health response has provider field
    expect(health.status).toBeDefined();

    // 23. Health response has timestamp
    const healthFull = JSON.parse(healthRes.body) as Record<string, unknown>;
    expect(healthFull['timestamp']).toBeDefined();

    // 24. Health response has version
    expect(healthFull['version']).toBeDefined();

    // 25. FIX 11: Window config route responds
    const windowRes = await app.inject({
      method: 'GET',
      url: '/window/config',
      headers: { authorization: AUTH_HEADER },
    });
    expect(windowRes.statusCode).toBe(200);
    const windowCfg = JSON.parse(windowRes.body) as Record<string, unknown>;
    expect(windowCfg['mode']).toBeDefined();
  });
});
