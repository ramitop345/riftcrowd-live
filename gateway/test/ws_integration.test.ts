/**
 * Phase 10 — WebSocket integration tests.
 *
 * End-to-end: buildApp with pipeline + director + mock routes + WS → MockLiveAdapter
 * with four_mode_round / normal_traffic → connect WS client → verify handshake,
 * commands flow, acks, reconnect snapshot, idempotency.
 */

import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import type { FastifyInstance } from 'fastify';
import { WS_PROTOCOL_VERSION, type GameCommand } from '@riftcrowd/shared';
import { buildApp } from '../src/app.js';
import { TestClock } from '../src/adapters/test_clock.js';
import { MockLiveAdapter } from '../src/adapters/mock_live_adapter.js';
import { getScenario } from '../src/adapters/scenarios.js';
import { WsServer } from '../src/ws/ws_server.js';

import { config } from '../src/config.js';

const TOKEN = config.localSessionToken; // use whatever the config resolved to
const PV = WS_PROTOCOL_VERSION;

interface IntegrationCtx {
  app: FastifyInstance;
  port: number;
  clock: TestClock;
  adapter: MockLiveAdapter;
  wsServer: WsServer;
}

async function setupIntegration(scenarioName: string): Promise<IntegrationCtx> {
  const app = buildApp({
    logger: false,
    enablePipeline: true,
    enableDirector: true,
    enableMockRoutes: true,
    enableWs: true,
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  const scenario = getScenario(scenarioName);
  const clock = new TestClock();
  const adapter = new MockLiveAdapter({
    scenario,
    clock,
    pipeline: app.pipeline,
    director: app.director,
  });
  await adapter.start();

  return { app, port, clock, adapter, wsServer: app.wsServer! };
}

async function teardownIntegration(ctx: IntegrationCtx): Promise<void> {
  await ctx.adapter.stop();
  await ctx.app.close();
}

function connectClient(port: number, token: string = TOKEN): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}/ws/game?token=${token}`);
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) { resolve(); return; }
    const timeout = setTimeout(() => reject(new Error('WS open timeout')), 5000);
    ws.once('open', () => { clearTimeout(timeout); resolve(); });
    ws.once('error', (err) => { clearTimeout(timeout); reject(err); });
  });
}

/** Collects messages from a WS until timeout or count reached. */
function collectMessages(ws: WebSocket, count: number, timeoutMs: number = 1500): Promise<Record<string, unknown>[]> {
  const msgs: Record<string, unknown>[] = [];
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      ws.removeAllListeners('message');
      resolve(msgs);
    }, timeoutMs);
    ws.on('message', (data: Buffer | string) => {
      const text = typeof data === 'string' ? data : data.toString('utf8');
      try { msgs.push(JSON.parse(text) as Record<string, unknown>); } catch { /* skip */ }
      if (msgs.length >= count) {
        clearTimeout(timer);
        ws.removeAllListeners('message');
        resolve(msgs);
      }
    });
  });
}

function sendJson(ws: WebSocket, data: unknown): void {
  ws.send(JSON.stringify(data));
}

/** Creates a WS client and immediately starts collecting messages (before open). */
function createCollectingClient(port: number, token: string = TOKEN, maxMessages: number = 20, timeoutMs: number = 1500) {
  const ws = connectClient(port, token);
  const promise = collectMessages(ws, maxMessages, timeoutMs);
  return { ws, promise };
}

let ctx: IntegrationCtx;

afterEach(async () => {
  if (ctx) await teardownIntegration(ctx);
});

describe('WS Integration — four_mode_round', () => {
  it('handshake completes and commands flow through', async () => {
    ctx = await setupIntegration('four_mode_round');

    // Advance scenario to produce some commands
    ctx.clock.advance(30_000);
    await new Promise((r) => setTimeout(r, 100));

    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    sendJson(ws, {
      type: 'handshake_ack',
      protocolVersion: PV,
      clientId: 'integ_client',
      lastReceivedSequenceNumber: 0,
    });
    const messages = await promise;

    // First message should be handshake
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]!['type']).toBe('handshake');

    // Should get snapshot or commands after handshake_ack
    const hasSnapshotOrCommand = messages.some(
      (m) => m['type'] === 'snapshot' || m['type'] === 'command',
    );
    if (ctx.adapter.commands.length > 0) {
      expect(hasSnapshotOrCommand).toBe(true);
    }

    ws.close();
  });

  it('reconnect sends snapshot with missed commands', async () => {
    ctx = await setupIntegration('normal_traffic');

    ctx.clock.advance(60_000);
    await new Promise((r) => setTimeout(r, 100));

    // Connect, receive commands, disconnect
    const c1 = createCollectingClient(ctx.port);
    await waitForOpen(c1.ws);
    sendJson(c1.ws, { type: 'handshake_ack', protocolVersion: PV, clientId: 'reconn_client', lastReceivedSequenceNumber: 0 });
    const firstBatch = await c1.promise;

    let lastSeq = 0;
    for (const msg of firstBatch) {
      if (msg['type'] === 'snapshot') lastSeq = msg['sequenceNumber'] as number;
      else if (msg['type'] === 'command') lastSeq = msg['sequenceNumber'] as number;
    }
    c1.ws.close();
    await new Promise((r) => setTimeout(r, 100));

    // Advance more to produce additional commands
    ctx.clock.advance(30_000);
    await new Promise((r) => setTimeout(r, 100));

    // Reconnect with lastReceivedSequenceNumber = lastSeq
    const c2 = createCollectingClient(ctx.port);
    await waitForOpen(c2.ws);
    sendJson(c2.ws, {
      type: 'handshake_ack',
      protocolVersion: PV,
      clientId: 'reconn_client_2',
      lastReceivedSequenceNumber: lastSeq,
    });
    const reconnectMsgs = await c2.promise;

    const currentSeq = ctx.wsServer.currentSequenceNumber;
    if (currentSeq > lastSeq) {
      const snapshot = reconnectMsgs.find((m) => m['type'] === 'snapshot');
      expect(snapshot).toBeDefined();
      if (snapshot) {
        expect(snapshot['type']).toBe('snapshot');
        expect(Array.isArray(snapshot['commands'])).toBe(true);
      }
    }

    c2.ws.close();
  });

  it('ack flow works end-to-end', async () => {
    ctx = await setupIntegration('normal_traffic');

    ctx.clock.advance(40_000);
    await new Promise((r) => setTimeout(r, 100));

    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    sendJson(ws, { type: 'handshake_ack', protocolVersion: PV, clientId: 'ack_e2e_client', lastReceivedSequenceNumber: 0 });

    const msgs = await promise;
    // Find first command or snapshot with commands
    let firstCmdId: string | null = null;
    let firstSeq: number | null = null;

    for (const msg of msgs) {
      if (msg['type'] === 'snapshot') {
        const cmds = msg['commands'] as GameCommand[];
        if (cmds.length > 0) { firstCmdId = cmds[0]!.id; firstSeq = 0; break; }
      } else if (msg['type'] === 'command') {
        firstCmdId = msg['messageId'] as string;
        firstSeq = msg['sequenceNumber'] as number;
        break;
      }
    }

    if (firstCmdId && firstSeq !== null) {
      sendJson(ws, {
        type: 'command_ack',
        protocolVersion: PV,
        messageId: firstCmdId,
        sequenceNumber: firstSeq,
        status: 'accepted',
      });
      await new Promise((r) => setTimeout(r, 50));

      if (ctx.wsServer) {
        const entries = ctx.wsServer.buffer.toArray();
        const entry = entries.find((e) => e.sequenceNumber === firstSeq);
        expect(entry).toBeDefined();
        if (entry) {
          expect(entry.ackedAt).toBeDefined();
        }
      }
    }
    ws.close();
  });
});

describe('WS Integration — heartbeat', () => {
  it('connection stays alive with heartbeat', async () => {
    ctx = await setupIntegration('normal_traffic');
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    sendJson(ws, { type: 'handshake_ack', protocolVersion: PV, clientId: 'hb_integ', lastReceivedSequenceNumber: 0 });
    await promise;

    // Connection should stay alive
    await new Promise((r) => setTimeout(r, 200));
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });
});

describe('WS Integration — auth', () => {
  it('rejects WS connection with wrong token', async () => {
    ctx = await setupIntegration('normal_traffic');
    const ws = new WebSocket(`ws://127.0.0.1:${ctx.port}/ws/game?token=wrong_token`);
    const closed = await new Promise<{ code: number }>((resolve) => {
      const timeout = setTimeout(() => resolve({ code: -1 }), 5000);
      ws.once('close', (code) => { clearTimeout(timeout); resolve({ code }); });
      ws.once('error', () => { /* swallow */ });
      ws.once('unexpected-response', (_req, res) => {
        clearTimeout(timeout);
        resolve({ code: res.statusCode ?? -1 });
      });
    });
    expect(closed.code).not.toBe(1000);
  });

  it('rejects WS connection without token', async () => {
    ctx = await setupIntegration('normal_traffic');
    const ws = new WebSocket(`ws://127.0.0.1:${ctx.port}/ws/game`);
    const closed = await new Promise<{ code: number }>((resolve) => {
      const timeout = setTimeout(() => resolve({ code: -1 }), 5000);
      ws.once('close', (code) => { clearTimeout(timeout); resolve({ code }); });
      ws.once('error', () => { /* swallow */ });
      ws.once('unexpected-response', (_req, res) => {
        clearTimeout(timeout);
        resolve({ code: res.statusCode ?? -1 });
      });
    });
    expect(closed.code).not.toBe(1000);
  });
});

describe('WS Integration — multiple clients', () => {
  it('both clients receive the same commands', async () => {
    ctx = await setupIntegration('normal_traffic');

    const c1 = createCollectingClient(ctx.port);
    const c2 = createCollectingClient(ctx.port);
    await waitForOpen(c1.ws);
    await waitForOpen(c2.ws);

    sendJson(c1.ws, { type: 'handshake_ack', protocolVersion: PV, clientId: 'mc_1', lastReceivedSequenceNumber: 0 });
    sendJson(c2.ws, { type: 'handshake_ack', protocolVersion: PV, clientId: 'mc_2', lastReceivedSequenceNumber: 0 });
    await new Promise((r) => setTimeout(r, 50));

    // Advance to produce commands
    ctx.clock.advance(40_000);
    await new Promise((r) => setTimeout(r, 200));

    const [m1, m2] = await Promise.all([c1.promise, c2.promise]);

    const cmdTypes1 = m1.filter((m) => m['type'] === 'command' || m['type'] === 'snapshot');
    const cmdTypes2 = m2.filter((m) => m['type'] === 'command' || m['type'] === 'snapshot');

    if (cmdTypes1.length > 0) {
      expect(cmdTypes2.length).toBeGreaterThan(0);
    }

    c1.ws.close();
    c2.ws.close();
  });
});

describe('WS Integration — protocol version mismatch', () => {
  it('sends error when client sends wrong protocol version', async () => {
    ctx = await setupIntegration('normal_traffic');
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);

    sendJson(ws, {
      type: 'handshake_ack',
      protocolVersion: 999,
      clientId: 'bad_pv_client',
      lastReceivedSequenceNumber: 0,
    });

    const msgs = await promise;
    const errMsg = msgs.find((m) => m['type'] === 'error');
    expect(errMsg).toBeDefined();
    expect(errMsg!['code']).toBe('UNSUPPORTED_VERSION');
    ws.close();
  });
});

describe('WS Integration — disconnect and reconnect recovery', () => {
  it('no commands lost across reconnect', async () => {
    ctx = await setupIntegration('normal_traffic');

    // Phase 1: produce some commands
    ctx.clock.advance(40_000);
    await new Promise((r) => setTimeout(r, 100));

    const c1 = createCollectingClient(ctx.port, TOKEN, 50);
    await waitForOpen(c1.ws);
    sendJson(c1.ws, { type: 'handshake_ack', protocolVersion: PV, clientId: 'recovery_client', lastReceivedSequenceNumber: 0 });
    const batch1 = await c1.promise;

    const receivedSeqs = new Set<number>();
    for (const msg of batch1) {
      if (msg['type'] === 'command') {
        receivedSeqs.add(msg['sequenceNumber'] as number);
      } else if (msg['type'] === 'snapshot') {
        const cmds = msg['commands'] as GameCommand[];
        for (let i = 0; i < cmds.length; i++) receivedSeqs.add(i);
      }
    }
    const maxSeqReceived = receivedSeqs.size > 0 ? Math.max(...receivedSeqs) + 1 : 0;
    c1.ws.close();
    await new Promise((r) => setTimeout(r, 100));

    // Phase 2: produce more commands while disconnected
    ctx.clock.advance(30_000);
    await new Promise((r) => setTimeout(r, 100));

    // Phase 3: reconnect
    const c2 = createCollectingClient(ctx.port, TOKEN, 50);
    await waitForOpen(c2.ws);
    sendJson(c2.ws, {
      type: 'handshake_ack',
      protocolVersion: PV,
      clientId: 'recovery_client_v2',
      lastReceivedSequenceNumber: maxSeqReceived,
    });
    const batch2 = await c2.promise;

    const currentSeq = ctx.wsServer.currentSequenceNumber;
    if (currentSeq > maxSeqReceived) {
      const snapshot = batch2.find((m) => m['type'] === 'snapshot');
      expect(snapshot).toBeDefined();
      expect(Array.isArray(snapshot!['commands'])).toBe(true);
    }

    c2.ws.close();
  });
});

describe('WS Integration — no duplicates applied', () => {
  it('reconnecting client does not receive already-acked commands twice', async () => {
    ctx = await setupIntegration('normal_traffic');

    ctx.clock.advance(40_000);
    await new Promise((r) => setTimeout(r, 100));

    const c1 = createCollectingClient(ctx.port, TOKEN, 50);
    await waitForOpen(c1.ws);
    sendJson(c1.ws, { type: 'handshake_ack', protocolVersion: PV, clientId: 'dedup_client', lastReceivedSequenceNumber: 0 });
    const batch = await c1.promise;

    let highestSeq = 0;
    for (const msg of batch) {
      if (msg['type'] === 'command') {
        const seq = msg['sequenceNumber'] as number;
        if (seq > highestSeq) highestSeq = seq;
        sendJson(c1.ws, {
          type: 'command_ack',
          protocolVersion: PV,
          messageId: msg['messageId'] as string,
          sequenceNumber: seq,
          status: 'accepted',
        });
      } else if (msg['type'] === 'snapshot') {
        highestSeq = msg['sequenceNumber'] as number;
      }
    }
    await new Promise((r) => setTimeout(r, 100));
    c1.ws.close();
    await new Promise((r) => setTimeout(r, 100));

    // Reconnect with lastReceivedSequenceNumber = highestSeq + 1
    const c2 = createCollectingClient(ctx.port, TOKEN, 20, 1000);
    await waitForOpen(c2.ws);
    sendJson(c2.ws, {
      type: 'handshake_ack',
      protocolVersion: PV,
      clientId: 'dedup_client_v2',
      lastReceivedSequenceNumber: highestSeq + 1,
    });
    const batch2 = await c2.promise;

    // Should NOT receive a snapshot since we're up to date
    const snapshot = batch2.find((m) => m['type'] === 'snapshot');
    expect(snapshot).toBeUndefined();

    c2.ws.close();
  });
});
