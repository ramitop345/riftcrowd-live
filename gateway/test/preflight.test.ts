/**
 * Phase 16 — Preflight Orchestrator unit tests.
 *
 * Tests: PreflightOrchestrator, check factories.
 * Total target: ≥15 tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PreflightOrchestrator,
  makeGatewayHealthCheck,
  makeDashboardReachableCheck,
  makeProviderCheck,
  makeConfigCheck,
  makeAudioCheck,
  makeVFXConfigCheck,
} from '../src/preflight/preflight_orchestrator.js';

// ===================================================================
// PreflightOrchestrator
// ===================================================================

describe('PreflightOrchestrator', () => {
  let orchestrator: PreflightOrchestrator;

  beforeEach(() => {
    orchestrator = new PreflightOrchestrator();
  });

  it('starts with zero checks', () => {
    expect(orchestrator.checkCount).toBe(0);
  });

  it('run with no checks returns ok=true', async () => {
    const result = await orchestrator.run();
    expect(result.ok).toBe(true);
    expect(result.checks).toHaveLength(0);
  });

  it('addCheck increments check count', () => {
    orchestrator.addCheck(async () => ({ name: 'test', ok: true, message: 'ok' }));
    expect(orchestrator.checkCount).toBe(1);
  });

  it('all checks pass → ok=true', async () => {
    orchestrator.addCheck(async () => ({ name: 'a', ok: true, message: 'a ok' }));
    orchestrator.addCheck(async () => ({ name: 'b', ok: true, message: 'b ok' }));
    const result = await orchestrator.run();
    expect(result.ok).toBe(true);
    expect(result.checks).toHaveLength(2);
  });

  it('one check fails → ok=false', async () => {
    orchestrator.addCheck(async () => ({ name: 'a', ok: true, message: 'a ok' }));
    orchestrator.addCheck(async () => ({ name: 'b', ok: false, message: 'b failed' }));
    const result = await orchestrator.run();
    expect(result.ok).toBe(false);
    expect(result.checks[1]!.ok).toBe(false);
    expect(result.checks[1]!.message).toBe('b failed');
  });

  it('check that throws is caught and reported', async () => {
    orchestrator.addCheck(async () => { throw new Error('boom'); });
    const result = await orchestrator.run();
    expect(result.ok).toBe(false);
    expect(result.checks[0]!.ok).toBe(false);
    expect(result.checks[0]!.message).toContain('boom');
  });

  // FIX 7: Hanging check times out instead of blocking indefinitely
  it('hanging check times out with ok=false', async () => {
    const fastOrchestrator = new PreflightOrchestrator(200); // 200ms timeout
    fastOrchestrator.addCheck(() => new Promise(() => {})); // never resolves
    const result = await fastOrchestrator.run();
    expect(result.ok).toBe(false);
    expect(result.checks[0]!.ok).toBe(false);
    expect(result.checks[0]!.message).toContain('timed out');
  }, 5000);
});

// ===================================================================
// Gateway health check
// ===================================================================

describe('makeGatewayHealthCheck', () => {
  it('passes when status is ok', async () => {
    const check = makeGatewayHealthCheck(async () => ({ status: 'ok' }));
    const result = await check();
    expect(result.ok).toBe(true);
    expect(result.name).toBe('gateway_health');
  });

  it('fails when status is not ok', async () => {
    const check = makeGatewayHealthCheck(async () => ({ status: 'degraded' }));
    const result = await check();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('degraded');
  });

  it('fails when fetch throws', async () => {
    const check = makeGatewayHealthCheck(async () => { throw new Error('network error'); });
    const result = await check();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('network error');
  });

  // FIX 8: Gateway health check fails when fetch returns error status
  it('fails when fetch rejects (connection refused)', async () => {
    const check = makeGatewayHealthCheck(async () => {
      throw new Error('fetch failed: ECONNREFUSED');
    });
    const result = await check();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('ECONNREFUSED');
  });
});

// ===================================================================
// Dashboard reachable check
// ===================================================================

describe('makeDashboardReachableCheck', () => {
  it('passes when dashboard is reachable', async () => {
    const check = makeDashboardReachableCheck(async () => true);
    const result = await check();
    expect(result.ok).toBe(true);
    expect(result.name).toBe('dashboard_reachable');
  });

  it('fails when dashboard returns non-200', async () => {
    const check = makeDashboardReachableCheck(async () => false);
    const result = await check();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('non-200');
  });

  it('fails when fetch throws', async () => {
    const check = makeDashboardReachableCheck(async () => { throw new Error('ECONNREFUSED'); });
    const result = await check();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('ECONNREFUSED');
  });
});

// ===================================================================
// Provider check
// ===================================================================

describe('makeProviderCheck', () => {
  it('mock provider passes when running', async () => {
    const check = makeProviderCheck('mock', () => true, async () => false);
    const result = await check();
    expect(result.ok).toBe(true);
    expect(result.name).toBe('provider');
    expect(result.message).toContain('MockLiveAdapter');
  });

  it('mock provider fails when not running', async () => {
    const check = makeProviderCheck('mock', () => false, async () => false);
    const result = await check();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('not running');
  });

  it('tikfinity provider passes when connected', async () => {
    const check = makeProviderCheck('tikfinity', () => false, async () => true);
    const result = await check();
    expect(result.ok).toBe(true);
    expect(result.message).toContain('TikFinity');
  });

  it('tikfinity provider fails when not connected', async () => {
    const check = makeProviderCheck('tikfinity', () => false, async () => false);
    const result = await check();
    expect(result.ok).toBe(false);
  });

  it('unknown provider fails', async () => {
    const check = makeProviderCheck('unknown', () => false, async () => false);
    const result = await check();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Unknown provider');
  });
});

// ===================================================================
// Config check
// ===================================================================

describe('makeConfigCheck', () => {
  it('passes when config is valid', async () => {
    const check = makeConfigCheck(() => ({ ok: true, errors: [] }));
    const result = await check();
    expect(result.ok).toBe(true);
    expect(result.name).toBe('config_valid');
  });

  it('fails with error messages', async () => {
    const check = makeConfigCheck(() => ({ ok: false, errors: ['missing HOST'] }));
    const result = await check();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('missing HOST');
  });
});

// ===================================================================
// Audio check
// ===================================================================

describe('makeAudioCheck', () => {
  it('passes when audio assets present', async () => {
    const check = makeAudioCheck(() => ({ ok: true, message: 'Audio ok' }));
    const result = await check();
    expect(result.ok).toBe(true);
    expect(result.name).toBe('audio_assets');
  });

  it('fails when audio assets missing', async () => {
    const check = makeAudioCheck(() => ({ ok: false, message: 'No audio dir' }));
    const result = await check();
    expect(result.ok).toBe(false);
  });
});

// ===================================================================
// VFX config check
// ===================================================================

describe('makeVFXConfigCheck', () => {
  it('passes when VFX config valid', async () => {
    const check = makeVFXConfigCheck(() => ({ ok: true, errors: [] }));
    const result = await check();
    expect(result.ok).toBe(true);
    expect(result.name).toBe('vfx_config');
  });

  it('fails with VFX config errors', async () => {
    const check = makeVFXConfigCheck(() => ({ ok: false, errors: ['pool.maxParticles: must be positive'] }));
    const result = await check();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('pool.maxParticles');
  });
});
