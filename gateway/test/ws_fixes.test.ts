/**
 * Phase 10 — Review fix tests: Zod validation and mandatory protocol version.
 *
 * FIX 1: Malformed messages are rejected via Zod schema validation.
 * FIX 2: Missing protocolVersion field triggers UNSUPPORTED_VERSION error.
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { WS_PROTOCOL_VERSION } from '@riftcrowd/shared';
import { WsServer } from '../src/ws/ws_server.js';
import { EventBus } from '../src/pipeline/event_bus.js';

const TOKEN = 'test-ws-token-fix';
const PV = WS_PROTOCOL_VERSION;

interface TestContext {
  app: FastifyInstance;
  eventBus: EventBus;
  wsServer: WsServer;
  port: number;
}

async function setupTest(): Promise<TestContext> {
  const app = Fastify({ logger: false });
  const eventBus = new EventBus(1000);
  const wsServer = new WsServer({
    heartbeatIntervalMs: 60_000,
    heartbeatTimeoutMs: 120_000,
    retryBufferCapacity: 100,
    maxReconnectBackoffMs: 1000,
    idempotencyWindowSize: 50,
    sessionToken: TOKEN,
  });

  app.get('/health', () => ({ status: 'ok' }));
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  wsServer.attach(app.server, eventBus);

  return { app, eventBus, wsServer, port };
}

async function teardownTest(ctx: TestContext): Promise<void> {
  await ctx.wsServer.close();
  await ctx.app.close();
}

function connectClient(port: number, token: string = TOKEN): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}/ws/game?token=${token}`);
}

/** Collects messages from a WS until timeout or count reached. */
async function collectMessages(
  ws: WebSocket,
  count: number,
  timeoutMs: number = 1500,
): Promise<Record<string, unknown>[]> {
  const msgs: Record<string, unknown>[] = [];
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      ws.removeAllListeners('message');
      resolve(msgs);
    }, timeoutMs);

    ws.on('message', (data: Buffer | string) => {
      const text = typeof data === 'string' ? data : data.toString('utf8');
      try {
        msgs.push(JSON.parse(text) as Record<string, unknown>);
      } catch {
        // skip non-JSON
      }
      if (msgs.length >= count) {
        clearTimeout(timer);
        ws.removeAllListeners('message');
        resolve(msgs);
      }
    });
  });
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => reject(new Error('WS open timeout')), 5000);
    ws.once('open', () => {
      clearTimeout(timeout);
      resolve();
    });
    ws.once('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function sendJson(ws: WebSocket, data: unknown): void {
  ws.send(JSON.stringify(data));
}

function createCollectingClient(
  port: number,
  token: string = TOKEN,
  maxMessages: number = 20,
  timeoutMs: number = 1500,
): { ws: WebSocket; promise: Promise<Record<string, unknown>[]> } {
  const ws = connectClient(port, token);
  const promise = collectMessages(ws, maxMessages, timeoutMs);
  return { ws, promise };
}

let ctx: TestContext;

beforeEach(async () => {
  ctx = await setupTest();
});

afterEach(async () => {
  await teardownTest(ctx);
});

describe('FIX 1 — Zod validation on handshake_ack', () => {
  it('rejects handshake_ack with non-numeric lastReceivedSequenceNumber ("abc")', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    sendJson(ws, {
      type: 'handshake_ack',
      protocolVersion: PV,
      clientId: 'bad_seq_client',
      lastReceivedSequenceNumber: 'abc',
    });
    const msgs = await promise;
    const errMsg = msgs.find((m) => m['type'] === 'error');
    expect(errMsg).toBeDefined();
    expect(errMsg!['code']).toBe('INVALID_MESSAGE');
    ws.close();
  });

  it('rejects handshake_ack with null clientId', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    sendJson(ws, {
      type: 'handshake_ack',
      protocolVersion: PV,
      clientId: null,
      lastReceivedSequenceNumber: 0,
    });
    const msgs = await promise;
    const errMsg = msgs.find((m) => m['type'] === 'error');
    expect(errMsg).toBeDefined();
    expect(errMsg!['code']).toBe('INVALID_MESSAGE');
    ws.close();
  });

  it('rejects handshake_ack with empty clientId', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    sendJson(ws, {
      type: 'handshake_ack',
      protocolVersion: PV,
      clientId: '',
      lastReceivedSequenceNumber: 0,
    });
    const msgs = await promise;
    const errMsg = msgs.find((m) => m['type'] === 'error');
    expect(errMsg).toBeDefined();
    expect(errMsg!['code']).toBe('INVALID_MESSAGE');
    ws.close();
  });

  it('rejects handshake_ack with negative lastReceivedSequenceNumber', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    sendJson(ws, {
      type: 'handshake_ack',
      protocolVersion: PV,
      clientId: 'neg_seq_client',
      lastReceivedSequenceNumber: -5,
    });
    const msgs = await promise;
    const errMsg = msgs.find((m) => m['type'] === 'error');
    expect(errMsg).toBeDefined();
    expect(errMsg!['code']).toBe('INVALID_MESSAGE');
    ws.close();
  });
});

describe('FIX 1 — Zod validation on command_ack', () => {
  it('rejects command_ack with non-enum status (123)', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    sendJson(ws, {
      type: 'handshake_ack',
      protocolVersion: PV,
      clientId: 'cmd_ack_test_client',
      lastReceivedSequenceNumber: 0,
    });
    await new Promise((r) => setTimeout(r, 100));
    sendJson(ws, {
      type: 'command_ack',
      protocolVersion: PV,
      messageId: 'some_cmd',
      sequenceNumber: 0,
      status: 123,
    });
    const msgs = await promise;
    const errMsg = msgs.find((m) => m['type'] === 'error');
    expect(errMsg).toBeDefined();
    expect(errMsg!['code']).toBe('INVALID_MESSAGE');
    ws.close();
  });

  it('rejects command_ack with unknown status string', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    sendJson(ws, {
      type: 'handshake_ack',
      protocolVersion: PV,
      clientId: 'cmd_ack_str_client',
      lastReceivedSequenceNumber: 0,
    });
    await new Promise((r) => setTimeout(r, 100));
    sendJson(ws, {
      type: 'command_ack',
      protocolVersion: PV,
      messageId: 'some_cmd',
      sequenceNumber: 0,
      status: 'unknown_status',
    });
    const msgs = await promise;
    const errMsg = msgs.find((m) => m['type'] === 'error');
    expect(errMsg).toBeDefined();
    expect(errMsg!['code']).toBe('INVALID_MESSAGE');
    ws.close();
  });

  it('rejects command_ack with missing messageId', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    sendJson(ws, {
      type: 'handshake_ack',
      protocolVersion: PV,
      clientId: 'cmd_ack_noid_client',
      lastReceivedSequenceNumber: 0,
    });
    await new Promise((r) => setTimeout(r, 100));
    sendJson(ws, {
      type: 'command_ack',
      protocolVersion: PV,
      sequenceNumber: 0,
      status: 'accepted',
    });
    const msgs = await promise;
    const errMsg = msgs.find((m) => m['type'] === 'error');
    expect(errMsg).toBeDefined();
    expect(errMsg!['code']).toBe('INVALID_MESSAGE');
    ws.close();
  });
});

describe('FIX 1 — Zod validation on heartbeat_pong', () => {
  it('rejects heartbeat_pong with non-numeric timestamp', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    sendJson(ws, {
      type: 'handshake_ack',
      protocolVersion: PV,
      clientId: 'pong_bad_ts_client',
      lastReceivedSequenceNumber: 0,
    });
    await new Promise((r) => setTimeout(r, 100));
    sendJson(ws, {
      type: 'heartbeat_pong',
      protocolVersion: PV,
      timestamp: 'not_a_number',
    });
    const msgs = await promise;
    const errMsg = msgs.find((m) => m['type'] === 'error');
    expect(errMsg).toBeDefined();
    expect(errMsg!['code']).toBe('INVALID_MESSAGE');
    ws.close();
  });
});

describe('FIX 2 — Mandatory protocol version', () => {
  it('rejects message without protocolVersion field', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    // Send handshake_ack without protocolVersion
    sendJson(ws, {
      type: 'handshake_ack',
      clientId: 'missing_pv_client',
      lastReceivedSequenceNumber: 0,
    });
    const msgs = await promise;
    const errMsg = msgs.find((m) => m['type'] === 'error');
    expect(errMsg).toBeDefined();
    expect(errMsg!['code']).toBe('UNSUPPORTED_VERSION');
    ws.close();
  });

  it('rejects command_ack without protocolVersion field', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    // First, complete handshake with valid protocol version
    sendJson(ws, {
      type: 'handshake_ack',
      protocolVersion: PV,
      clientId: 'cmd_no_pv_client',
      lastReceivedSequenceNumber: 0,
    });
    await new Promise((r) => setTimeout(r, 100));
    // Now send command_ack without protocolVersion
    sendJson(ws, {
      type: 'command_ack',
      messageId: 'some_cmd',
      sequenceNumber: 0,
      status: 'accepted',
    });
    const msgs = await promise;
    const errMsg = msgs.find((m) => m['type'] === 'error');
    expect(errMsg).toBeDefined();
    expect(errMsg!['code']).toBe('UNSUPPORTED_VERSION');
    ws.close();
  });
});
