/**
 * Phase 14 — TikFinity config tests.
 *
 * Tests that the gateway config correctly includes the tikfinity block,
 * reads env vars, and validates defaults.
 * Target: ≥5 tests.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { TikFinityConfigSchema } from '../src/adapters/tikfinity_adapter.js';

// ===========================================================================
// Config validation
// ===========================================================================

describe('TikFinity gateway config', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save relevant env vars
    for (const key of ['LIVE_PROVIDER', 'TIKFINITY_URL', 'TIKFINITY_TOKEN', 'TIKFINITY_RECONNECT_MS', 'TIKFINITY_HEARTBEAT_MS']) {
      originalEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    // Restore env vars
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('default config has tikfinity disabled', () => {
    const cfg = TikFinityConfigSchema.parse({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.url).toBe('ws://127.0.0.1:23184/ws');
    expect(cfg.reconnectMs).toBe(5000);
    expect(cfg.heartbeatMs).toBe(30000);
    expect(cfg.token).toBeUndefined();
  });

  it('enabled when LIVE_PROVIDER=tikfinity', () => {
    const cfg = TikFinityConfigSchema.parse({ enabled: true });
    expect(cfg.enabled).toBe(true);
  });

  it('accepts custom URL', () => {
    const cfg = TikFinityConfigSchema.parse({ url: 'ws://127.0.0.1:9999/ws' });
    expect(cfg.url).toBe('ws://127.0.0.1:9999/ws');
  });

  it('accepts custom reconnect and heartbeat intervals', () => {
    const cfg = TikFinityConfigSchema.parse({
      reconnectMs: 10000,
      heartbeatMs: 60000,
    });
    expect(cfg.reconnectMs).toBe(10000);
    expect(cfg.heartbeatMs).toBe(60000);
  });

  it('accepts token', () => {
    const cfg = TikFinityConfigSchema.parse({
      token: 'my-secret-token',
    });
    expect(cfg.token).toBe('my-secret-token');
  });

  it('rejects empty URL', () => {
    expect(() => TikFinityConfigSchema.parse({ url: '' })).toThrow();
  });

  it('rejects non-WebSocket URL scheme (FIX 7)', () => {
    expect(() => TikFinityConfigSchema.parse({ url: 'http://example.com/ws' })).toThrow(/Must start with ws:\/\/ or wss:\/\//);
    expect(() => TikFinityConfigSchema.parse({ url: 'https://example.com/ws' })).toThrow(/Must start with ws:\/\/ or wss:\/\//);
  });

  it('accepts wss:// URL scheme (FIX 7)', () => {
    const cfg = TikFinityConfigSchema.parse({ url: 'wss://secure.example.com/ws' });
    expect(cfg.url).toBe('wss://secure.example.com/ws');
  });

  it('rejects negative reconnect interval', () => {
    expect(() => TikFinityConfigSchema.parse({ reconnectMs: -100 })).toThrow();
  });
});
