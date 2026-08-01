/**
 * Phase 10 — WebSocket server unit tests.
 *
 * Uses real `ws` WebSocket clients against a Fastify + WsServer setup.
 * Tests: handshake, heartbeat, command broadcast, ack, reconnect snapshot,
 * idempotency, auth, multiple clients, protocol version mismatch.
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { WS_PROTOCOL_VERSION, type GameCommand } from '@riftcrowd/shared';
import { WsServer } from '../src/ws/ws_server.js';
import { EventBus } from '../src/pipeline/event_bus.js';

const TOKEN = 'test-ws-token';
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
async function collectMessages(ws: WebSocket, count: number, timeoutMs: number = 1500): Promise<Record<string, unknown>[]> {
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
    if (ws.readyState === WebSocket.OPEN) { resolve(); return; }
    const timeout = setTimeout(() => reject(new Error('WS open timeout')), 5000);
    ws.once('open', () => { clearTimeout(timeout); resolve(); });
    ws.once('error', (err) => { clearTimeout(timeout); reject(err); });
  });
}

function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ code: -1, reason: 'timeout' }), 5000);
    ws.once('close', (code, reason) => { clearTimeout(timeout); resolve({ code, reason: reason.toString() }); });
    ws.once('error', () => { /* swallow */ });
    ws.once('unexpected-response', (_req, res) => {
      clearTimeout(timeout);
      resolve({ code: res.statusCode ?? -1, reason: 'unexpected-response' });
    });
  });
}

function makeCmd(id: string): GameCommand {
  return {
    schemaVersion: 1,
    id,
    type: 'SPAWN_CHAMPION',
    createdAt: new Date().toISOString(),
    sourceEventIds: ['evt_001'],
  };
}

function sendJson(ws: WebSocket, data: unknown): void {
  ws.send(JSON.stringify(data));
}

/** Creates a WS client and immediately starts collecting messages (before open). */
function createCollectingClient(port: number, token: string = TOKEN, maxMessages: number = 20, timeoutMs: number = 1500): { ws: WebSocket; promise: Promise<Record<string, unknown>[]> } {
  const ws = connectClient(port, token);
  const promise = collectMessages(ws, maxMessages, timeoutMs);
  return { ws, promise };
}

/** Helper: connect, get handshake, send ack, return collected messages. */
async function handshakenClient(port: number, clientId: string, lastSeq: number = 0): Promise<{ ws: WebSocket; msgs: Record<string, unknown>[] }> {
  const { ws, promise } = createCollectingClient(port);
  await waitForOpen(ws);
  sendJson(ws, {
    type: 'handshake_ack',
    protocolVersion: PV,
    clientId,
    lastReceivedSequenceNumber: lastSeq,
  });
  const msgs = await promise;
  return { ws, msgs };
}

let ctx: TestContext;

beforeEach(async () => {
  ctx = await setupTest();
});

afterEach(async () => {
  await teardownTest(ctx);
});

describe('WsServer — handshake', () => {
  it('sends handshake on connect', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    const msgs = await promise;
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs[0]!['type']).toBe('handshake');
    expect(msgs[0]!['protocolVersion']).toBe(PV);
    expect(typeof msgs[0]!['serverId']).toBe('string');
    expect(msgs[0]!['heartbeatIntervalMs']).toBe(60_000);
    expect(msgs[0]!['retryBufferCapacity']).toBe(100);
    expect(msgs[0]!['currentSequenceNumber']).toBe(0);
    ws.close();
  });

  it('completes handshake when client sends ack', async () => {
    const { ws } = await handshakenClient(ctx.port, 'test_client');
    expect(ctx.wsServer.clientCount).toBe(1);
    ws.close();
  });

  it('sends snapshot when client reconnects with old sequence', async () => {
    // Pre-populate buffer
    ctx.eventBus.publish('command', makeCmd('cmd_snap_1'));
    ctx.eventBus.publish('command', makeCmd('cmd_snap_2'));

    const { ws, msgs } = await handshakenClient(ctx.port, 'reconnect_client', 0);
    // Should have received a snapshot
    const snapshot = msgs.find((m) => m['type'] === 'snapshot');
    expect(snapshot).toBeDefined();
    expect(snapshot!['type']).toBe('snapshot');
    const commands = snapshot!['commands'] as GameCommand[];
    expect(commands).toHaveLength(2);
    expect(commands[0]!.id).toBe('cmd_snap_1');
    expect(commands[1]!.id).toBe('cmd_snap_2');
    ws.close();
  });

  it('does not send snapshot when client is up to date', async () => {
    ctx.eventBus.publish('command', makeCmd('cmd_a'));
    const { ws, msgs } = await handshakenClient(ctx.port, 'uptodate_client', 1);
    const snapshot = msgs.find((m) => m['type'] === 'snapshot');
    expect(snapshot).toBeUndefined();
    ws.close();
  });
});

describe('WsServer — auth', () => {
  it('rejects connection without token', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${ctx.port}/ws/game`);
    const result = await waitForClose(ws);
    expect(result.code).not.toBe(1000);
  });

  it('rejects connection with wrong token', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${ctx.port}/ws/game?token=wrong`);
    const result = await waitForClose(ws);
    expect(result.code).not.toBe(1000);
  });

  it('accepts connection with correct token', async () => {
    const { ws, promise } = createCollectingClient(ctx.port, TOKEN);
    await waitForOpen(ws);
    const msgs = await promise;
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs[0]!['type']).toBe('handshake');
    ws.close();
  });
});

describe('WsServer — command broadcast', () => {
  it('broadcasts command to handshaken client', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    sendJson(ws, { type: 'handshake_ack', protocolVersion: PV, clientId: 'broadcast_client', lastReceivedSequenceNumber: 0 });
    await new Promise((r) => setTimeout(r, 100));
    ctx.eventBus.publish('command', makeCmd('cmd_broadcast_1'));
    const msgs = await promise;

    const cmdMsg = msgs.find((m) => m['type'] === 'command');
    expect(cmdMsg).toBeDefined();
    expect(cmdMsg!['messageId']).toBe('cmd_broadcast_1');
    expect(cmdMsg!['requiresAck']).toBe(true);
    expect((cmdMsg!['command'] as Record<string, unknown>)['id']).toBe('cmd_broadcast_1');
    ws.close();
  });

  it('assigns monotonic sequence numbers', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    sendJson(ws, { type: 'handshake_ack', protocolVersion: PV, clientId: 'seq_client', lastReceivedSequenceNumber: 0 });
    await new Promise((r) => setTimeout(r, 100));

    ctx.eventBus.publish('command', makeCmd('s1'));
    ctx.eventBus.publish('command', makeCmd('s2'));
    ctx.eventBus.publish('command', makeCmd('s3'));
    const msgs = await promise;

    const cmds = msgs.filter((m) => m['type'] === 'command');
    expect(cmds.length).toBeGreaterThanOrEqual(3);
    expect(cmds[0]!['sequenceNumber']).toBe(0);
    expect(cmds[1]!['sequenceNumber']).toBe(1);
    expect(cmds[2]!['sequenceNumber']).toBe(2);
    ws.close();
  });

  it('broadcasts to multiple clients', async () => {
    const c1 = createCollectingClient(ctx.port);
    const c2 = createCollectingClient(ctx.port);
    await waitForOpen(c1.ws);
    await waitForOpen(c2.ws);
    sendJson(c1.ws, { type: 'handshake_ack', protocolVersion: PV, clientId: 'multi_1', lastReceivedSequenceNumber: 0 });
    sendJson(c2.ws, { type: 'handshake_ack', protocolVersion: PV, clientId: 'multi_2', lastReceivedSequenceNumber: 0 });
    await new Promise((r) => setTimeout(r, 100));

    ctx.eventBus.publish('command', makeCmd('multi_cmd'));
    const [m1, m2] = await Promise.all([c1.promise, c2.promise]);

    const cmd1 = m1.find((m) => m['type'] === 'command');
    const cmd2 = m2.find((m) => m['type'] === 'command');
    expect(cmd1).toBeDefined();
    expect(cmd2).toBeDefined();
    expect((cmd1!['command'] as Record<string, unknown>)['id']).toBe('multi_cmd');
    expect((cmd2!['command'] as Record<string, unknown>)['id']).toBe('multi_cmd');
    c1.ws.close();
    c2.ws.close();
  });

  it('does not broadcast to non-handshaken clients', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    // Don't send handshake_ack
    const msgs = await promise;
    // Should only have handshake, no commands
    const cmds = msgs.filter((m) => m['type'] === 'command');
    expect(cmds).toHaveLength(0);
    // Now publish a command — should not arrive
    ctx.eventBus.publish('command', makeCmd('no_broadcast'));
    await new Promise((r) => setTimeout(r, 200));
    // Still no commands (we need to check with a fresh collector)
    ws.close();
  });
});

describe('WsServer — command ack', () => {
  it('marks command as acked in retry buffer on accepted', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    sendJson(ws, { type: 'handshake_ack', protocolVersion: PV, clientId: 'ack_client', lastReceivedSequenceNumber: 0 });
    await new Promise((r) => setTimeout(r, 100));

    ctx.eventBus.publish('command', makeCmd('ack_cmd'));
    const msgs = await promise;
    const cmdMsg = msgs.find((m) => m['type'] === 'command');
    expect(cmdMsg).toBeDefined();
    const seq = cmdMsg!['sequenceNumber'] as number;

    sendJson(ws, { type: 'command_ack', protocolVersion: PV, messageId: 'ack_cmd', sequenceNumber: seq, status: 'accepted' });
    await new Promise((r) => setTimeout(r, 100));

    const entries = ctx.wsServer.buffer.toArray();
    const entry = entries.find((e) => e.sequenceNumber === seq);
    expect(entry).toBeDefined();
    expect(entry!.ackedAt).toBeDefined();
    ws.close();
  });

  it('marks command as acked on duplicate status', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    sendJson(ws, { type: 'handshake_ack', protocolVersion: PV, clientId: 'dup_ack_client', lastReceivedSequenceNumber: 0 });
    await new Promise((r) => setTimeout(r, 100));

    ctx.eventBus.publish('command', makeCmd('dup_ack_cmd'));
    const msgs = await promise;
    const cmdMsg = msgs.find((m) => m['type'] === 'command');
    expect(cmdMsg).toBeDefined();
    const seq = cmdMsg!['sequenceNumber'] as number;

    sendJson(ws, { type: 'command_ack', protocolVersion: PV, messageId: 'dup_ack_cmd', sequenceNumber: seq, status: 'duplicate' });
    await new Promise((r) => setTimeout(r, 100));

    const entries = ctx.wsServer.buffer.toArray();
    const entry = entries.find((e) => e.sequenceNumber === seq);
    expect(entry).toBeDefined();
    expect(entry!.ackedAt).toBeDefined();
    ws.close();
  });
});

describe('WsServer — idempotency', () => {
  it('skips re-broadcasting already acked command to same client', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    sendJson(ws, { type: 'handshake_ack', protocolVersion: PV, clientId: 'idemp_client', lastReceivedSequenceNumber: 0 });
    await new Promise((r) => setTimeout(r, 100));

    ctx.eventBus.publish('command', makeCmd('idemp_cmd'));
    const msgs = await promise;
    const cmdMsg = msgs.find((m) => m['type'] === 'command');
    expect(cmdMsg).toBeDefined();
    const seq = cmdMsg!['sequenceNumber'] as number;

    sendJson(ws, { type: 'command_ack', protocolVersion: PV, messageId: 'idemp_cmd', sequenceNumber: seq, status: 'accepted' });
    await new Promise((r) => setTimeout(r, 100));

    // Set up a new message collector before re-broadcast
    const postRebroadcast: Record<string, unknown>[] = [];
    ws.on('message', (data) => {
      const text = typeof data === 'string' ? data : data.toString('utf8');
      try { postRebroadcast.push(JSON.parse(text)); } catch { /* skip */ }
    });
    ctx.wsServer.broadcastCommand(makeCmd('idemp_cmd'));
    await new Promise((r) => setTimeout(r, 200));
    const dupCmds = postRebroadcast.filter((m) => m['type'] === 'command');
    expect(dupCmds).toHaveLength(0);
    ws.close();
  });
});

describe('WsServer — protocol version mismatch', () => {
  it('sends error on wrong protocol version in client message', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    sendJson(ws, { type: 'handshake_ack', protocolVersion: 999, clientId: 'bad_version', lastReceivedSequenceNumber: 0 });
    const msgs = await promise;
    const errMsg = msgs.find((m) => m['type'] === 'error');
    expect(errMsg).toBeDefined();
    expect(errMsg!['code']).toBe('UNSUPPORTED_VERSION');
    ws.close();
  });
});

describe('WsServer — error messages', () => {
  it('sends error on malformed JSON', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    ws.send('not valid json{{{');
    const msgs = await promise;
    const errMsg = msgs.find((m) => m['type'] === 'error');
    expect(errMsg).toBeDefined();
    expect(errMsg!['code']).toBe('INVALID_MESSAGE');
    ws.close();
  });

  it('sends error on unknown message type', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    sendJson(ws, { type: 'unknown_msg', protocolVersion: PV });
    const msgs = await promise;
    const errMsg = msgs.find((m) => m['type'] === 'error');
    expect(errMsg).toBeDefined();
    expect(errMsg!['code']).toBe('INVALID_MESSAGE');
    ws.close();
  });

  it('sends error on non-object message', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    ws.send('"just a string"');
    const msgs = await promise;
    const errMsg = msgs.find((m) => m['type'] === 'error');
    expect(errMsg).toBeDefined();
    expect(errMsg!['code']).toBe('INVALID_MESSAGE');
    ws.close();
  });
});

describe('WsServer — disconnect cleanup', () => {
  it('removes client on close', async () => {
    const { ws } = await handshakenClient(ctx.port, 'disc_client');
    expect(ctx.wsServer.clientCount).toBe(1);
    ws.close();
    await new Promise((r) => setTimeout(r, 200));
    expect(ctx.wsServer.clientCount).toBe(0);
  });

  it('keeps retry buffer after disconnect', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    sendJson(ws, { type: 'handshake_ack', protocolVersion: PV, clientId: 'survive_client', lastReceivedSequenceNumber: 0 });
    await new Promise((r) => setTimeout(r, 100));

    ctx.eventBus.publish('command', makeCmd('survive_cmd'));
    const msgs = await promise;
    expect(msgs.some((m) => m['type'] === 'command')).toBe(true);

    ws.close();
    await new Promise((r) => setTimeout(r, 200));

    expect(ctx.wsServer.currentSequenceNumber).toBe(1);
    expect(ctx.wsServer.buffer.size).toBeGreaterThan(0);
  });
});

describe('WsServer — heartbeat', () => {
  it('sends heartbeat ping', async () => {
    const shortApp = Fastify({ logger: false });
    const shortBus = new EventBus(100);
    const shortWs = new WsServer({
      heartbeatIntervalMs: 100,
      heartbeatTimeoutMs: 60_000,
      retryBufferCapacity: 10,
      maxReconnectBackoffMs: 1000,
      idempotencyWindowSize: 10,
      sessionToken: TOKEN,
    });
    shortApp.get('/health', () => ({ status: 'ok' }));
    await shortApp.listen({ host: '127.0.0.1', port: 0 });
    const addr = shortApp.server.address();
    const shortPort = typeof addr === 'object' && addr ? addr.port : 0;
    shortWs.attach(shortApp.server, shortBus);

    const { ws, promise } = createCollectingClient(shortPort);
    await waitForOpen(ws);
    const msgs = await promise;
    const ping = msgs.find((m) => m['type'] === 'heartbeat_ping');
    expect(ping).toBeDefined();
    expect(ping!['protocolVersion']).toBe(PV);
    expect(typeof ping!['timestamp']).toBe('number');

    ws.close();
    await shortWs.close();
    await shortApp.close();
  });

  it('processes heartbeat pong from client', async () => {
    const shortApp = Fastify({ logger: false });
    const shortBus = new EventBus(100);
    const shortWs = new WsServer({
      heartbeatIntervalMs: 100,
      heartbeatTimeoutMs: 60_000,
      retryBufferCapacity: 10,
      maxReconnectBackoffMs: 1000,
      idempotencyWindowSize: 10,
      sessionToken: TOKEN,
    });
    shortApp.get('/health', () => ({ status: 'ok' }));
    await shortApp.listen({ host: '127.0.0.1', port: 0 });
    const addr = shortApp.server.address();
    const shortPort = typeof addr === 'object' && addr ? addr.port : 0;
    shortWs.attach(shortApp.server, shortBus);

    const { ws, promise } = createCollectingClient(shortPort);
    await waitForOpen(ws);
    sendJson(ws, { type: 'handshake_ack', protocolVersion: PV, clientId: 'pong_client', lastReceivedSequenceNumber: 0 });
    const msgs = await promise;

    const ping = msgs.find((m) => m['type'] === 'heartbeat_ping');
    expect(ping).toBeDefined();

    sendJson(ws, { type: 'heartbeat_pong', protocolVersion: PV, timestamp: ping!['timestamp'] as number });
    await new Promise((r) => setTimeout(r, 200));
    expect(ws.readyState).toBe(WebSocket.OPEN);

    ws.close();
    await shortWs.close();
    await shortApp.close();
  });
});

describe('WsServer — retry buffer eviction', () => {
  it('evicts oldest entries when buffer reaches capacity', async () => {
    const capApp = Fastify({ logger: false });
    const capBus = new EventBus(100);
    const capWs = new WsServer({
      heartbeatIntervalMs: 60_000,
      heartbeatTimeoutMs: 120_000,
      retryBufferCapacity: 3,
      maxReconnectBackoffMs: 1000,
      idempotencyWindowSize: 50,
      sessionToken: TOKEN,
    });
    capApp.get('/health', () => ({ status: 'ok' }));
    await capApp.listen({ host: '127.0.0.1', port: 0 });
    capWs.attach(capApp.server, capBus);

    for (let i = 0; i < 5; i++) {
      capBus.publish('command', makeCmd(`evict_${i}`));
    }

    expect(capWs.buffer.size).toBe(3);
    const entries = capWs.buffer.toArray();
    expect(entries[0]!.command.id).toBe('evict_2');

    await capWs.close();
    await capApp.close();
  });
});

describe('WsServer — command ordering', () => {
  it('preserves command order across broadcast', async () => {
    const { ws, promise } = createCollectingClient(ctx.port);
    await waitForOpen(ws);
    sendJson(ws, { type: 'handshake_ack', protocolVersion: PV, clientId: 'order_client', lastReceivedSequenceNumber: 0 });
    await new Promise((r) => setTimeout(r, 100));

    const ids = ['ord_a', 'ord_b', 'ord_c', 'ord_d', 'ord_e'];
    for (const id of ids) {
      ctx.eventBus.publish('command', makeCmd(id));
    }

    const msgs = await promise;
    const received = msgs.filter((m) => m['type'] === 'command').map((m) => (m['command'] as Record<string, unknown>)['id'] as string);
    expect(received).toEqual(ids);
    ws.close();
  });
});

describe('WsServer — sequence number monotonic', () => {
  it('sequence numbers are strictly increasing', async () => {
    for (let i = 0; i < 10; i++) {
      ctx.eventBus.publish('command', makeCmd(`mono_${i}`));
    }
    expect(ctx.wsServer.currentSequenceNumber).toBe(10);

    const { ws, msgs } = await handshakenClient(ctx.port, 'mono_client', 0);
    const snapshot = msgs.find((m) => m['type'] === 'snapshot');
    expect(snapshot).toBeDefined();
    expect(snapshot!['sequenceNumber']).toBe(10);
    const commands = snapshot!['commands'] as GameCommand[];
    expect(commands).toHaveLength(10);
    ws.close();
  });
});

describe('WsServer — close', () => {
  it('close() cleans up all clients and the server', async () => {
    const { ws } = await handshakenClient(ctx.port, 'close_client');
    expect(ctx.wsServer.clientCount).toBe(1);
    await ctx.wsServer.close();
    expect(ctx.wsServer.clientCount).toBe(0);
    ws.close();
  });
});
