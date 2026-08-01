/**
 * WsServer — Phase 10 WebSocket server for the gateway ↔ Godot real-time bridge.
 *
 * Features:
 *  - Token-based auth (same LOCAL_SESSION_TOKEN as HTTP endpoints)
 *  - Handshake with protocol version negotiation
 *  - Heartbeat ping/pong with timeout detection
 *  - Command broadcast from pipeline event bus
 *  - Idempotent command delivery (dedup on messageId + clientId)
 *  - Reconnect recovery via snapshot from bounded retry buffer
 *
 * Uses the `ws` package directly (already in gateway deps).
 * Binds to 127.0.0.1 via the Fastify HTTP server.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { GameCommand } from '@riftcrowd/shared';
import {
  WS_PROTOCOL_VERSION,
  WsHandshakeAckSchema,
  WsHeartbeatPongSchema,
  WsCommandAckSchema,
  type WsHandshake,
  type WsCommand,
  type WsSnapshot,
  type WsError,
  type WsHeartbeatPing,
  type WsDisconnect,
} from '@riftcrowd/shared';
import { RetryBuffer } from './retry_buffer.js';
import type { EventBus } from '../pipeline/event_bus.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface WsServerConfig {
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  retryBufferCapacity: number;
  maxReconnectBackoffMs: number;
  idempotencyWindowSize: number;
  sessionToken: string;
  path?: string;
}

const DEFAULT_CONFIG: WsServerConfig = {
  heartbeatIntervalMs: 5000,
  heartbeatTimeoutMs: 15000,
  retryBufferCapacity: 1000,
  maxReconnectBackoffMs: 30000,
  idempotencyWindowSize: 500,
  sessionToken: '',
  path: '/ws/game',
};

// ---------------------------------------------------------------------------
// Client state
// ---------------------------------------------------------------------------

interface ClientState {
  ws: WebSocket;
  clientId: string;
  lastReceivedSequenceNumber: number;
  handshakeCompleted: boolean;
  lastPongAt: number;
  heartbeatTimer?: ReturnType<typeof setInterval>;
}

// ---------------------------------------------------------------------------
// WsServer class
// ---------------------------------------------------------------------------

export class WsServer {
  private readonly config: WsServerConfig;
  private readonly retryBuffer: RetryBuffer;
  private readonly clients: Map<WebSocket, ClientState> = new Map();
  private readonly idempotencySet: Set<string> = new Set(); // "clientId:messageId"
  private readonly idempotencyQueue: string[] = []; // bounded eviction
  private wss?: WebSocketServer;
  private eventBusUnsub?: () => void;
  private serverId: string;

  constructor(config: Partial<WsServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.retryBuffer = new RetryBuffer(this.config.retryBufferCapacity);
    this.serverId = `gw_${Date.now().toString(36)}`;
  }

  /** The retry buffer (for testing). */
  get buffer(): RetryBuffer {
    return this.retryBuffer;
  }

  /** Current sequence number (for testing). Alias for nextSequenceNumber. */
  get currentSequenceNumber(): number {
    return this.retryBuffer.nextSequenceNumber;
  }

  /** Number of connected clients. */
  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Attaches the WebSocket server to an existing HTTP server (from Fastify).
   * Subscribes to the event bus 'command' topic.
   */
  attach(httpServer: HttpServer, eventBus: EventBus, path?: string): void {
    const wsPath = path ?? this.config.path ?? '/ws/game';

    this.wss = new WebSocketServer({
      server: httpServer,
      path: wsPath,
      verifyClient: (info, callback) => {
        this.verifyAuth(info.req?.url ?? '', callback);
      },
    });

    this.wss.on('connection', (ws) => {
      this.handleConnection(ws);
    });

    // Subscribe to command topic on the event bus
    this.eventBusUnsub = eventBus.subscribe('command', (cmd: GameCommand) => {
      this.onNewCommand(cmd);
    });
  }

  /**
   * Closes the WebSocket server and cleans up all connections.
   */
  async close(): Promise<void> {
    if (this.eventBusUnsub) {
      this.eventBusUnsub();
      this.eventBusUnsub = undefined;
    }

    // Close all client connections
    for (const [ws, state] of this.clients) {
      if (state.heartbeatTimer) clearInterval(state.heartbeatTimer);
      try {
        ws.close(1001, 'Server shutting down');
      } catch {
        // ignore close errors during shutdown
      }
    }
    this.clients.clear();

    return new Promise<void>((resolve) => {
      if (this.wss) {
        this.wss.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /** Broadcasts a command to all connected, handshaken clients. */
  broadcastCommand(cmd: GameCommand): void {
    this.onNewCommand(cmd);
  }

  // -------------------------------------------------------------------------
  // Auth verification
  // -------------------------------------------------------------------------

  private verifyAuth(
    url: string,
    callback: (result: boolean, code?: number, message?: string) => void,
  ): void {
    const token = this.config.sessionToken;
    if (!token) {
      callback(false, 503, 'Session token not configured');
      return;
    }

    // Extract token from query string: ?token=...
    const params = new URLSearchParams(url.split('?')[1] ?? '');
    const provided = params.get('token') ?? '';

    if (!provided) {
      callback(false, 401, 'Missing token');
      return;
    }

    const providedBuf = Buffer.from(provided, 'utf8');
    const expectedBuf = Buffer.from(token, 'utf8');
    if (
      providedBuf.length !== expectedBuf.length ||
      !timingSafeEqual(providedBuf, expectedBuf)
    ) {
      callback(false, 401, 'Invalid token');
      return;
    }

    callback(true);
  }

  // -------------------------------------------------------------------------
  // Connection handling
  // -------------------------------------------------------------------------

  private handleConnection(ws: WebSocket): void {
    const state: ClientState = {
      ws,
      clientId: '',
      lastReceivedSequenceNumber: 0,
      handshakeCompleted: false,
      lastPongAt: Date.now(),
    };
    this.clients.set(ws, state);

    // Send handshake
    const handshake: WsHandshake = {
      type: 'handshake',
      protocolVersion: WS_PROTOCOL_VERSION,
      serverId: this.serverId,
      heartbeatIntervalMs: this.config.heartbeatIntervalMs,
      retryBufferCapacity: this.config.retryBufferCapacity,
      currentSequenceNumber: this.retryBuffer.nextSequenceNumber,
    };
    this.send(ws, handshake);

    // Set up heartbeat
    state.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat(ws, state);
    }, this.config.heartbeatIntervalMs);

    // Message handler
    ws.on('message', (data: Buffer | string) => {
      this.handleMessage(ws, state, data);
    });

    // Close handler
    ws.on('close', () => {
      this.handleDisconnect(ws, state);
    });

    // Error handler
    ws.on('error', () => {
      this.handleDisconnect(ws, state);
    });
  }

  // -------------------------------------------------------------------------
  // Message handling
  // -------------------------------------------------------------------------

  private handleMessage(ws: WebSocket, state: ClientState, data: Buffer | string): void {
    let parsed: unknown;
    try {
      const text = typeof data === 'string' ? data : data.toString('utf8');
      parsed = JSON.parse(text);
    } catch {
      this.sendError(ws, 'INVALID_MESSAGE', 'Malformed JSON');
      return;
    }

    if (!parsed || typeof parsed !== 'object') {
      this.sendError(ws, 'INVALID_MESSAGE', 'Expected JSON object');
      return;
    }

    const msg = parsed as Record<string, unknown>;

    // Check protocol version on all messages — mandatory
    if (msg['protocolVersion'] !== WS_PROTOCOL_VERSION) {
      this.sendError(ws, 'UNSUPPORTED_VERSION', `Expected protocol version ${WS_PROTOCOL_VERSION}`);
      return;
    }

    switch (msg['type']) {
      case 'handshake_ack':
        this.handleHandshakeAck(ws, state, msg);
        break;
      case 'heartbeat_pong':
        this.handleHeartbeatPong(ws, state, msg);
        break;
      case 'command_ack':
        this.handleCommandAck(ws, state, msg);
        break;
      default:
        this.sendError(ws, 'INVALID_MESSAGE', `Unknown message type: ${String(msg['type'])}`);
    }
  }

  private handleHandshakeAck(
    ws: WebSocket,
    state: ClientState,
    msg: Record<string, unknown>,
  ): void {
    const result = WsHandshakeAckSchema.safeParse(msg);
    if (!result.success) {
      this.sendError(
        ws,
        'INVALID_MESSAGE',
        `Invalid handshake_ack: ${result.error.issues[0]?.message ?? 'parse error'}`,
      );
      return;
    }
    const ack = result.data;

    state.clientId = ack.clientId;
    state.lastReceivedSequenceNumber = ack.lastReceivedSequenceNumber;
    state.handshakeCompleted = true;

    // Send snapshot if client missed commands
    const current = this.retryBuffer.nextSequenceNumber;
    if (ack.lastReceivedSequenceNumber < current) {
      const missedCommands = this.retryBuffer.getRange(
        ack.lastReceivedSequenceNumber,
        current,
      );
      if (missedCommands.length > 0) {
        const snapshot: WsSnapshot = {
          type: 'snapshot',
          protocolVersion: WS_PROTOCOL_VERSION,
          sequenceNumber: current,
          commands: missedCommands,
        };
        this.send(ws, snapshot);
      }
    }
  }

  private handleHeartbeatPong(
    ws: WebSocket,
    state: ClientState,
    msg: Record<string, unknown>,
  ): void {
    const result = WsHeartbeatPongSchema.safeParse(msg);
    if (!result.success) {
      this.sendError(
        ws,
        'INVALID_MESSAGE',
        `Invalid heartbeat_pong: ${result.error.issues[0]?.message ?? 'parse error'}`,
      );
      return;
    }
    state.lastPongAt = Date.now();
  }

  private handleCommandAck(
    ws: WebSocket,
    state: ClientState,
    msg: Record<string, unknown>,
  ): void {
    const result = WsCommandAckSchema.safeParse(msg);
    if (!result.success) {
      this.sendError(
        ws,
        'INVALID_MESSAGE',
        `Invalid command_ack: ${result.error.issues[0]?.message ?? 'parse error'}`,
      );
      return;
    }
    const ack = result.data;
    const seq = ack.sequenceNumber;
    const status = ack.status;
    const messageId = ack.messageId;

    if (status === 'accepted' || status === 'duplicate') {
      this.retryBuffer.markAcked(seq);
    }

    // Track idempotency: mark this clientId:messageId as seen
    if (state.clientId && messageId) {
      const key = `${state.clientId}:${messageId}`;
      if (!this.idempotencySet.has(key)) {
        this.idempotencySet.add(key);
        this.idempotencyQueue.push(key);
        // Evict if over window size
        while (this.idempotencyQueue.length > this.config.idempotencyWindowSize) {
          const evicted = this.idempotencyQueue.shift();
          if (evicted) this.idempotencySet.delete(evicted);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Heartbeat
  // -------------------------------------------------------------------------

  private sendHeartbeat(ws: WebSocket, state: ClientState): void {
    // Check if previous pong was received within timeout
    const elapsed = Date.now() - state.lastPongAt;
    if (elapsed > this.config.heartbeatTimeoutMs) {
      this.sendError(ws, 'HEARTBEAT_TIMEOUT', 'No heartbeat pong received within timeout');
      ws.close(1001, 'Heartbeat timeout');
      return;
    }

    const ping: WsHeartbeatPing = {
      type: 'heartbeat_ping',
      protocolVersion: WS_PROTOCOL_VERSION,
      timestamp: Date.now(),
    };
    this.send(ws, ping);
  }

  // -------------------------------------------------------------------------
  // Command broadcast
  // -------------------------------------------------------------------------

  private onNewCommand(cmd: GameCommand): void {
    const seq = this.retryBuffer.add(cmd);

    // Broadcast to all handshaken clients
    const wsCommand: WsCommand = {
      type: 'command',
      protocolVersion: WS_PROTOCOL_VERSION,
      messageId: cmd.id,
      command: cmd,
      sequenceNumber: seq,
      requiresAck: true,
    };

    for (const [, state] of this.clients) {
      if (!state.handshakeCompleted) continue;

      // Idempotency check: skip if this client already saw this command
      const key = `${state.clientId}:${cmd.id}`;
      if (this.idempotencySet.has(key)) continue;

      this.send(state.ws, wsCommand);
    }
  }

  // -------------------------------------------------------------------------
  // Disconnect
  // -------------------------------------------------------------------------

  private handleDisconnect(ws: WebSocket, state: ClientState): void {
    if (!this.clients.has(ws)) return; // already cleaned up
    if (state.heartbeatTimer) {
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = undefined;
    }
    this.clients.delete(ws);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private send(ws: WebSocket, message: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, code: string, message: string, details?: unknown): void {
    const error: WsError = {
      type: 'error',
      protocolVersion: WS_PROTOCOL_VERSION,
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    };
    this.send(ws, error);
  }

  /**
   * Sends a graceful disconnect message before closing.
   */
  sendDisconnectAndClose(ws: WebSocket, reason: string): void {
    const disc: WsDisconnect = {
      type: 'disconnect',
      protocolVersion: WS_PROTOCOL_VERSION,
      reason,
    };
    this.send(ws, disc);
    ws.close(1000, reason);
  }
}
