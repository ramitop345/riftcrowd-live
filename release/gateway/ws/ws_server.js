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
import { timingSafeEqual } from 'node:crypto';
import { WS_PROTOCOL_VERSION, WsHandshakeAckSchema, WsHeartbeatPongSchema, WsCommandAckSchema, } from '@riftcrowd/shared';
import { RetryBuffer } from './retry_buffer.js';
const DEFAULT_CONFIG = {
    heartbeatIntervalMs: 5000,
    heartbeatTimeoutMs: 15000,
    retryBufferCapacity: 1000,
    maxReconnectBackoffMs: 30000,
    idempotencyWindowSize: 500,
    sessionToken: '',
    path: '/ws/game',
};
// ---------------------------------------------------------------------------
// WsServer class
// ---------------------------------------------------------------------------
export class WsServer {
    config;
    retryBuffer;
    clients = new Map();
    idempotencySet = new Set(); // "clientId:messageId"
    idempotencyQueue = []; // bounded eviction
    wss;
    eventBusUnsub;
    serverId;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.retryBuffer = new RetryBuffer(this.config.retryBufferCapacity);
        this.serverId = `gw_${Date.now().toString(36)}`;
    }
    /** The retry buffer (for testing). */
    get buffer() {
        return this.retryBuffer;
    }
    /** Current sequence number (for testing). Alias for nextSequenceNumber. */
    get currentSequenceNumber() {
        return this.retryBuffer.nextSequenceNumber;
    }
    /** Number of connected clients. */
    get clientCount() {
        return this.clients.size;
    }
    /**
     * Attaches the WebSocket server to an existing HTTP server (from Fastify).
     * Subscribes to the event bus 'command' topic.
     */
    attach(httpServer, eventBus, path) {
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
        this.eventBusUnsub = eventBus.subscribe('command', (cmd) => {
            this.onNewCommand(cmd);
        });
    }
    /**
     * Closes the WebSocket server and cleans up all connections.
     */
    async close() {
        if (this.eventBusUnsub) {
            this.eventBusUnsub();
            this.eventBusUnsub = undefined;
        }
        // Close all client connections
        for (const [ws, state] of this.clients) {
            if (state.heartbeatTimer)
                clearInterval(state.heartbeatTimer);
            try {
                ws.close(1001, 'Server shutting down');
            }
            catch {
                // ignore close errors during shutdown
            }
        }
        this.clients.clear();
        return new Promise((resolve) => {
            if (this.wss) {
                this.wss.close(() => resolve());
            }
            else {
                resolve();
            }
        });
    }
    /** Broadcasts a command to all connected, handshaken clients. */
    broadcastCommand(cmd) {
        this.onNewCommand(cmd);
    }
    // -------------------------------------------------------------------------
    // Auth verification
    // -------------------------------------------------------------------------
    verifyAuth(url, callback) {
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
        if (providedBuf.length !== expectedBuf.length ||
            !timingSafeEqual(providedBuf, expectedBuf)) {
            callback(false, 401, 'Invalid token');
            return;
        }
        callback(true);
    }
    // -------------------------------------------------------------------------
    // Connection handling
    // -------------------------------------------------------------------------
    handleConnection(ws) {
        const state = {
            ws,
            clientId: '',
            lastReceivedSequenceNumber: 0,
            handshakeCompleted: false,
            lastPongAt: Date.now(),
        };
        this.clients.set(ws, state);
        // Send handshake
        const handshake = {
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
        ws.on('message', (data) => {
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
    handleMessage(ws, state, data) {
        let parsed;
        try {
            const text = typeof data === 'string' ? data : data.toString('utf8');
            parsed = JSON.parse(text);
        }
        catch {
            this.sendError(ws, 'INVALID_MESSAGE', 'Malformed JSON');
            return;
        }
        if (!parsed || typeof parsed !== 'object') {
            this.sendError(ws, 'INVALID_MESSAGE', 'Expected JSON object');
            return;
        }
        const msg = parsed;
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
    handleHandshakeAck(ws, state, msg) {
        const result = WsHandshakeAckSchema.safeParse(msg);
        if (!result.success) {
            this.sendError(ws, 'INVALID_MESSAGE', `Invalid handshake_ack: ${result.error.issues[0]?.message ?? 'parse error'}`);
            return;
        }
        const ack = result.data;
        state.clientId = ack.clientId;
        state.lastReceivedSequenceNumber = ack.lastReceivedSequenceNumber;
        state.handshakeCompleted = true;
        // Send snapshot if client missed commands
        const current = this.retryBuffer.nextSequenceNumber;
        if (ack.lastReceivedSequenceNumber < current) {
            const missedCommands = this.retryBuffer.getRange(ack.lastReceivedSequenceNumber, current);
            if (missedCommands.length > 0) {
                const snapshot = {
                    type: 'snapshot',
                    protocolVersion: WS_PROTOCOL_VERSION,
                    sequenceNumber: current,
                    commands: missedCommands,
                };
                this.send(ws, snapshot);
            }
        }
    }
    handleHeartbeatPong(ws, state, msg) {
        const result = WsHeartbeatPongSchema.safeParse(msg);
        if (!result.success) {
            this.sendError(ws, 'INVALID_MESSAGE', `Invalid heartbeat_pong: ${result.error.issues[0]?.message ?? 'parse error'}`);
            return;
        }
        state.lastPongAt = Date.now();
    }
    handleCommandAck(ws, state, msg) {
        const result = WsCommandAckSchema.safeParse(msg);
        if (!result.success) {
            this.sendError(ws, 'INVALID_MESSAGE', `Invalid command_ack: ${result.error.issues[0]?.message ?? 'parse error'}`);
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
                    if (evicted)
                        this.idempotencySet.delete(evicted);
                }
            }
        }
    }
    // -------------------------------------------------------------------------
    // Heartbeat
    // -------------------------------------------------------------------------
    sendHeartbeat(ws, state) {
        // Check if previous pong was received within timeout
        const elapsed = Date.now() - state.lastPongAt;
        if (elapsed > this.config.heartbeatTimeoutMs) {
            this.sendError(ws, 'HEARTBEAT_TIMEOUT', 'No heartbeat pong received within timeout');
            ws.close(1001, 'Heartbeat timeout');
            return;
        }
        const ping = {
            type: 'heartbeat_ping',
            protocolVersion: WS_PROTOCOL_VERSION,
            timestamp: Date.now(),
        };
        this.send(ws, ping);
    }
    // -------------------------------------------------------------------------
    // Command broadcast
    // -------------------------------------------------------------------------
    onNewCommand(cmd) {
        const seq = this.retryBuffer.add(cmd);
        // Broadcast to all handshaken clients
        const wsCommand = {
            type: 'command',
            protocolVersion: WS_PROTOCOL_VERSION,
            messageId: cmd.id,
            command: cmd,
            sequenceNumber: seq,
            requiresAck: true,
        };
        for (const [, state] of this.clients) {
            if (!state.handshakeCompleted)
                continue;
            // Idempotency check: skip if this client already saw this command
            const key = `${state.clientId}:${cmd.id}`;
            if (this.idempotencySet.has(key))
                continue;
            this.send(state.ws, wsCommand);
        }
    }
    // -------------------------------------------------------------------------
    // Disconnect
    // -------------------------------------------------------------------------
    handleDisconnect(ws, state) {
        if (!this.clients.has(ws))
            return; // already cleaned up
        if (state.heartbeatTimer) {
            clearInterval(state.heartbeatTimer);
            state.heartbeatTimer = undefined;
        }
        this.clients.delete(ws);
    }
    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    send(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }
    sendError(ws, code, message, details) {
        const error = {
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
    sendDisconnectAndClose(ws, reason) {
        const disc = {
            type: 'disconnect',
            protocolVersion: WS_PROTOCOL_VERSION,
            reason,
        };
        this.send(ws, disc);
        ws.close(1000, reason);
    }
}
