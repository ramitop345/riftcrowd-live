/**
 * Phase 14 — TikFinity Adapter tests.
 *
 * Covers: config schema, Zod parsing, event mapping, connection lifecycle,
 * reconnection, heartbeat, fault tolerance. Target: ≥30 tests.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket, { WebSocketServer } from 'ws';
import {
  TikFinityAdapter,
  TikFinityConfigSchema,
  TikFinityRawEventSchema,
  parseTikfinityPayload,
} from '../src/adapters/tikfinity_adapter.js';
import type { NormalizedLiveEvent } from '@riftcrowd/shared';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures', 'tikfinity');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadFixture(name: string): unknown {
  const raw = readFileSync(join(FIXTURES_DIR, `${name}.json`), 'utf8');
  return JSON.parse(raw);
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return TikFinityConfigSchema.parse({
    url: 'ws://127.0.0.1:0/ws',
    reconnectMs: 100,
    heartbeatMs: 60000, // large so heartbeat doesn't interfere
    enabled: true,
    ...overrides,
  });
}

/** Creates a lightweight TikFinityAdapter for pure mapping tests (no WS connection). */
function makeMapper(): TikFinityAdapter {
  return new TikFinityAdapter({
    config: TikFinityConfigSchema.parse({ url: 'ws://127.0.0.1:0/ws' }),
  });
}

/** Starts a local WS echo/test server on a random port. Returns { port, server, clients }. */
function startTestServer(): { port: number; server: WebSocketServer; sendToAll: (msg: string) => void; close: () => Promise<void> } {
  const server = new WebSocketServer({ port: 0 });
  const port = (server.address() as { port: number }).port;
  const clients: Set<WebSocket> = new Set();

  server.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
  });

  return {
    port,
    server,
    sendToAll(msg: string) {
      for (const c of clients) {
        if (c.readyState === WebSocket.OPEN) c.send(msg);
      }
    },
    async close() {
      for (const c of clients) {
        try { c.terminate(); } catch { /* ignore */ }
      }
      return new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

// ===========================================================================
// 1. Config schema
// ===========================================================================

describe('TikFinity config schema', () => {
  it('accepts valid config', () => {
    const cfg = TikFinityConfigSchema.parse({
      url: 'ws://127.0.0.1:23184/ws',
      token: 'REDACTED_TOKEN',
      reconnectMs: 5000,
      heartbeatMs: 30000,
      enabled: true,
    });
    expect(cfg.url).toBe('ws://127.0.0.1:23184/ws');
    expect(cfg.token).toBe('REDACTED_TOKEN');
    expect(cfg.enabled).toBe(true);
  });

  it('applies defaults for missing fields', () => {
    const cfg = TikFinityConfigSchema.parse({});
    expect(cfg.url).toBe('ws://127.0.0.1:23184/ws');
    expect(cfg.reconnectMs).toBe(5000);
    expect(cfg.heartbeatMs).toBe(30000);
    expect(cfg.enabled).toBe(false);
    expect(cfg.token).toBeUndefined();
  });

  it('rejects empty url', () => {
    expect(() => TikFinityConfigSchema.parse({ url: '' })).toThrow();
  });

  it('rejects negative reconnectMs', () => {
    expect(() => TikFinityConfigSchema.parse({ reconnectMs: -1 })).toThrow();
  });

  it('rejects zero heartbeatMs', () => {
    expect(() => TikFinityConfigSchema.parse({ heartbeatMs: 0 })).toThrow();
  });
});

// ===========================================================================
// 2. Zod parsing of raw events
// ===========================================================================

describe('parseTikfinityPayload', () => {
  it('parses valid chat fixture', () => {
    const fixture = loadFixture('chat');
    const result = parseTikfinityPayload(JSON.stringify(fixture));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('chat');
    }
  });

  it('parses valid like fixture', () => {
    const fixture = loadFixture('like');
    const result = parseTikfinityPayload(JSON.stringify(fixture));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('like');
    }
  });

  it('parses valid follow fixture', () => {
    const fixture = loadFixture('follow');
    const result = parseTikfinityPayload(JSON.stringify(fixture));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('follow');
    }
  });

  it('parses valid share fixture', () => {
    const fixture = loadFixture('share');
    const result = parseTikfinityPayload(JSON.stringify(fixture));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('share');
    }
  });

  it('parses valid subscription fixture', () => {
    const fixture = loadFixture('subscription');
    const result = parseTikfinityPayload(JSON.stringify(fixture));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('subscription');
    }
  });

  it('parses valid gift fixture', () => {
    const fixture = loadFixture('gift');
    const result = parseTikfinityPayload(JSON.stringify(fixture));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('gift');
    }
  });

  it('rejects malformed JSON', () => {
    const result = parseTikfinityPayload('{not valid json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('JSON parse error');
    }
  });

  it('rejects non-object payload', () => {
    const result = parseTikfinityPayload('"just a string"');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not a JSON object');
    }
  });

  it('rejects array payload', () => {
    const result = parseTikfinityPayload('[1, 2, 3]');
    expect(result.ok).toBe(false);
  });

  it('rejects unknown event type', () => {
    const result = parseTikfinityPayload(JSON.stringify({
      type: 'unknown_type',
      user: { id: 'u1', nickname: 'n1' },
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Unknown event type');
    }
  });

  it('rejects chat event missing comment', () => {
    const result = parseTikfinityPayload(JSON.stringify({
      type: 'chat',
      user: { id: 'u1', nickname: 'n1' },
    }));
    expect(result.ok).toBe(false);
  });

  it('rejects gift event missing giftId', () => {
    const result = parseTikfinityPayload(JSON.stringify({
      type: 'gift',
      user: { id: 'u1', nickname: 'n1' },
      giftName: 'Rose',
    }));
    expect(result.ok).toBe(false);
  });

  it('strips unknown fields (tolerant of API changes)', () => {
    const result = parseTikfinityPayload(JSON.stringify({
      type: 'chat',
      user: { id: 'u1', nickname: 'n1', extraField: 'surprise' },
      comment: 'hello',
      timestamp: 12345,
      newApiField: true,
    }));
    expect(result.ok).toBe(true);
  });

  it('rejects event with missing user', () => {
    const result = parseTikfinityPayload(JSON.stringify({
      type: 'follow',
    }));
    expect(result.ok).toBe(false);
  });
});

// ===========================================================================
// 3. Event mapping
// ===========================================================================

describe('mapTikfinityEvent (via adapter.mapEvent)', () => {
  let adapter: TikFinityAdapter;
  beforeEach(() => {
    adapter = makeMapper();
    adapter.resetEventCounter();
  });

  it('maps chat to NormalizedLiveEvent', () => {
    const raw = TikFinityRawEventSchema.parse(loadFixture('chat'));
    const mapped = adapter.mapEvent(raw);
    expect(mapped).not.toBeNull();
    expect(mapped!.type).toBe('chat');
    expect(mapped!.user.id).toBe('user_001');
    expect(mapped!.user.displayName).toBe('viewer_alpha');
    expect(mapped!.comment).toContain('!strategy focus');
    expect(mapped!.provider).toBe('tikfinity');
  });

  it('maps like to NormalizedLiveEvent', () => {
    const raw = TikFinityRawEventSchema.parse(loadFixture('like'));
    const mapped = adapter.mapEvent(raw);
    expect(mapped).not.toBeNull();
    expect(mapped!.type).toBe('like');
    expect(mapped!.likeCount).toBe(5);
  });

  it('maps follow to NormalizedLiveEvent', () => {
    const raw = TikFinityRawEventSchema.parse(loadFixture('follow'));
    const mapped = adapter.mapEvent(raw);
    expect(mapped).not.toBeNull();
    expect(mapped!.type).toBe('follow');
    expect(mapped!.user.id).toBe('user_003');
  });

  it('maps share to NormalizedLiveEvent', () => {
    const raw = TikFinityRawEventSchema.parse(loadFixture('share'));
    const mapped = adapter.mapEvent(raw);
    expect(mapped).not.toBeNull();
    expect(mapped!.type).toBe('share');
  });

  it('maps subscription to subscribe event type', () => {
    const raw = TikFinityRawEventSchema.parse(loadFixture('subscription'));
    const mapped = adapter.mapEvent(raw);
    expect(mapped).not.toBeNull();
    expect(mapped!.type).toBe('subscribe');
    expect(mapped!.user.id).toBe('user_005');
  });

  it('maps gift to NormalizedLiveEvent with gift payload', () => {
    const raw = TikFinityRawEventSchema.parse(loadFixture('gift'));
    const mapped = adapter.mapEvent(raw);
    expect(mapped).not.toBeNull();
    expect(mapped!.type).toBe('gift');
    expect(mapped!.gift).toBeDefined();
    expect(mapped!.gift!.id).toBe('gift_rose_001');
    expect(mapped!.gift!.name).toBe('Rose');
    expect(mapped!.gift!.repeatCount).toBe(3);
    expect(mapped!.gift!.providerValue).toBe(100);
  });

  it('produces unique event IDs', () => {
    const raw = TikFinityRawEventSchema.parse(loadFixture('chat'));
    const m1 = adapter.mapEvent(raw);
    const m2 = adapter.mapEvent(raw);
    expect(m1!.id).not.toBe(m2!.id);
  });

  it('sets provider to tikfinity', () => {
    const raw = TikFinityRawEventSchema.parse(loadFixture('like'));
    const mapped = adapter.mapEvent(raw);
    expect(mapped!.provider).toBe('tikfinity');
  });

  it('caps chat comment at 500 chars', () => {
    const longComment = 'a'.repeat(600);
    const raw = TikFinityRawEventSchema.parse({
      type: 'chat',
      user: { id: 'u1', nickname: 'n1' },
      comment: longComment,
    });
    const mapped = adapter.mapEvent(raw);
    expect(mapped!.comment!.length).toBeLessThanOrEqual(500);
  });

  it('produces real SHA-256 rawHash (64 hex chars)', () => {
    const raw = TikFinityRawEventSchema.parse(loadFixture('chat'));
    const mapped = adapter.mapEvent(raw);
    expect(mapped!.rawHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('two concurrent adapters produce unique event IDs (FIX 1)', () => {
    const adapterA = makeMapper();
    const adapterB = makeMapper();
    const raw = TikFinityRawEventSchema.parse(loadFixture('chat'));
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      ids.add(adapterA.mapEvent(raw)!.id);
      ids.add(adapterB.mapEvent(raw)!.id);
    }
    // 10 unique IDs total (5 from each adapter)
    expect(ids.size).toBe(10);
  });
});

// ===========================================================================
// 4. TikFinityAdapter connection lifecycle
// ===========================================================================

describe('TikFinityAdapter connection', () => {
  let testServer: ReturnType<typeof startTestServer>;

  afterEach(async () => {
    if (testServer) {
      await testServer.close();
    }
  });

  it('connects to a WebSocket server', async () => {
    testServer = startTestServer();
    const adapter = new TikFinityAdapter({
      config: makeConfig({ url: `ws://127.0.0.1:${testServer.port}/ws` }),
    });

    await adapter.start();
    // Wait for connection
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    expect(adapter.isConnected()).toBe(true);
    await adapter.stop();
  });

  it('receives and maps events via WebSocket', async () => {
    testServer = startTestServer();
    const received: NormalizedLiveEvent[] = [];
    const adapter = new TikFinityAdapter({
      config: makeConfig({ url: `ws://127.0.0.1:${testServer.port}/ws` }),
    });
    adapter.onEvent((e) => received.push(e));

    await adapter.start();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    // Send a chat event
    const fixture = loadFixture('chat');
    testServer.sendToAll(JSON.stringify(fixture));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(received.length).toBe(1);
    expect(received[0]!.type).toBe('chat');
    expect(adapter.eventsReceived).toBe(1);
    await adapter.stop();
  });

  it('drops malformed payloads gracefully', async () => {
    testServer = startTestServer();
    const warnings: string[] = [];
    const adapter = new TikFinityAdapter({
      config: makeConfig({ url: `ws://127.0.0.1:${testServer.port}/ws` }),
      onWarn: (msg) => warnings.push(msg),
    });

    await adapter.start();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    testServer.sendToAll('not valid json{{{');
    testServer.sendToAll(JSON.stringify({ type: 'unknown_type' }));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(adapter.eventsDropped).toBe(2);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    await adapter.stop();
  });

  it('stop() disconnects cleanly', async () => {
    testServer = startTestServer();
    const adapter = new TikFinityAdapter({
      config: makeConfig({ url: `ws://127.0.0.1:${testServer.port}/ws` }),
    });

    await adapter.start();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    expect(adapter.isConnected()).toBe(true);

    await adapter.stop();
    expect(adapter.isConnected()).toBe(false);
  });

  it('start() is idempotent', async () => {
    testServer = startTestServer();
    const adapter = new TikFinityAdapter({
      config: makeConfig({ url: `ws://127.0.0.1:${testServer.port}/ws` }),
    });

    await adapter.start();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    expect(adapter.isConnected()).toBe(true);
    await adapter.start(); // second call should be no-op
    expect(adapter.isConnected()).toBe(true);
    await adapter.stop();
  });

  it('handles server disconnect and attempts reconnect', async () => {
    testServer = startTestServer();
    const infoMessages: string[] = [];
    const adapter = new TikFinityAdapter({
      config: makeConfig({
        url: `ws://127.0.0.1:${testServer.port}/ws`,
        reconnectMs: 50,
      }),
      onInfo: (msg) => infoMessages.push(msg),
    });

    await adapter.start();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    expect(adapter.isConnected()).toBe(true);

    // Close all client connections from server side
    for (const c of (testServer as unknown as { server: WebSocketServer }).server.clients) {
      c.close();
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    expect(adapter.reconnectCount).toBeGreaterThanOrEqual(1);
    await adapter.stop();
  });

  it('receives multiple event types in sequence', async () => {
    testServer = startTestServer();
    const received: NormalizedLiveEvent[] = [];
    const adapter = new TikFinityAdapter({
      config: makeConfig({ url: `ws://127.0.0.1:${testServer.port}/ws` }),
    });
    adapter.onEvent((e) => received.push(e));

    await adapter.start();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    const types = ['chat', 'like', 'follow', 'share', 'subscription', 'gift'] as const;
    for (const t of types) {
      testServer.sendToAll(JSON.stringify(loadFixture(t)));
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    expect(received.length).toBe(6);
    expect(received.map((e) => e.type)).toEqual(['chat', 'like', 'follow', 'share', 'subscribe', 'gift']);
    await adapter.stop();
  });
});

// ===========================================================================
// 5. Fault tolerance
// ===========================================================================

describe('TikFinityAdapter fault tolerance', () => {
  let testServer: ReturnType<typeof startTestServer>;

  afterEach(async () => {
    if (testServer) {
      await testServer.close();
    }
  });

  it('handles unknown event type without crash', async () => {
    testServer = startTestServer();
    const warnings: string[] = [];
    const adapter = new TikFinityAdapter({
      config: makeConfig({ url: `ws://127.0.0.1:${testServer.port}/ws` }),
      onWarn: (msg) => warnings.push(msg),
    });

    await adapter.start();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    testServer.sendToAll(JSON.stringify({
      type: 'future_event_type',
      user: { id: 'u1', nickname: 'n1' },
    }));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(adapter.eventsDropped).toBe(1);
    expect(warnings.some((w) => w.includes('Unknown event type'))).toBe(true);
    await adapter.stop();
  });

  it('handles payload with extra unknown fields', async () => {
    testServer = startTestServer();
    const received: NormalizedLiveEvent[] = [];
    const adapter = new TikFinityAdapter({
      config: makeConfig({ url: `ws://127.0.0.1:${testServer.port}/ws` }),
    });
    adapter.onEvent((e) => received.push(e));

    await adapter.start();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    testServer.sendToAll(JSON.stringify({
      type: 'chat',
      user: { id: 'u1', nickname: 'n1', newApiField: true },
      comment: 'hello',
      futureField: 42,
    }));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(received.length).toBe(1);
    expect(received[0]!.type).toBe('chat');
    await adapter.stop();
  });

  it('handles connection failure to unreachable server', async () => {
    const warnings: string[] = [];
    const adapter = new TikFinityAdapter({
      config: makeConfig({
        url: 'ws://127.0.0.1:1/ws', // port 1 is unreachable
        reconnectMs: 50,
      }),
      onWarn: (msg) => warnings.push(msg),
    });

    await adapter.start();
    await new Promise<void>((resolve) => setTimeout(resolve, 300));

    expect(adapter.isConnected()).toBe(false);
    // Should have attempted reconnect or logged failure
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    await adapter.stop();
  });

  it('drops event when user.id is empty', async () => {
    const result = parseTikfinityPayload(JSON.stringify({
      type: 'chat',
      user: { id: '', nickname: 'n1' },
      comment: 'hello',
    }));
    expect(result.ok).toBe(false);
  });

  it('drops event when nickname is empty', async () => {
    const result = parseTikfinityPayload(JSON.stringify({
      type: 'chat',
      user: { id: 'u1', nickname: '' },
      comment: 'hello',
    }));
    expect(result.ok).toBe(false);
  });

  it('logs close code and reason on disconnect (FIX 4)', async () => {
    testServer = startTestServer();
    const infoMessages: string[] = [];
    const adapter = new TikFinityAdapter({
      config: makeConfig({
        url: `ws://127.0.0.1:${testServer.port}/ws`,
        reconnectMs: 50,
      }),
      onInfo: (msg) => infoMessages.push(msg),
    });

    await adapter.start();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    expect(adapter.isConnected()).toBe(true);

    // Close all client connections from server side with specific code
    for (const c of (testServer as unknown as { server: WebSocketServer }).server.clients) {
      c.close(1000, 'normal shutdown');
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    // Verify close code was logged
    expect(infoMessages.some((m) => m.includes('code=1000'))).toBe(true);
    await adapter.stop();
  });

  it('calls onFatal after max reconnect attempts (FIX 8)', async () => {
    const warnings: string[] = [];
    let fatalMsg: string | null = null;
    const adapter = new TikFinityAdapter({
      config: makeConfig({
        url: 'ws://127.0.0.1:1/ws', // port 1 is unreachable
        reconnectMs: 10, // very fast reconnect for test (backoff base)
      }),
      onWarn: (msg) => warnings.push(msg),
      onFatal: (msg) => { fatalMsg = msg; },
    });

    await adapter.start();
    // Wait long enough for all 10 reconnect attempts
    // Backoff: 10*2^0 + 10*2^1 + ... + 10*2^9 = ~10s total
    await new Promise<void>((resolve) => setTimeout(resolve, 15000));

    expect(fatalMsg).not.toBeNull();
    expect(fatalMsg).toContain('permanently disconnected');
    await adapter.stop();
  }, 30000);
});
