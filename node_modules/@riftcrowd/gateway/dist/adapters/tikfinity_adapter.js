/**
 * TikFinityAdapter — real provider adapter for TikFinity local LIVE API (Phase 14).
 *
 * Connects to TikFinity's local WebSocket endpoint, receives raw LIVE events,
 * validates them with Zod, and maps them into NormalizedLiveEvent objects for
 * the gateway pipeline.
 *
 * Fault tolerance:
 * - Exponential backoff reconnect (1s → 30s cap, max 10 retries).
 * - Heartbeat ping/pong (configurable interval, 5s pong timeout).
 * - Malformed payloads dropped with warning (never crash).
 * - Unknown event types dropped with warning.
 * - Unknown fields stripped by Zod (changed payloads tolerated).
 */
import { createHash, randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { z } from 'zod';
import { EVENT_SCHEMA_VERSION } from '@riftcrowd/shared';
// ---------------------------------------------------------------------------
// TikFinity config schema
// ---------------------------------------------------------------------------
export const TikFinityConfigSchema = z.object({
    url: z.string().min(1).regex(/^wss?:\/\//, 'Must start with ws:// or wss://').default('ws://127.0.0.1:23184/ws'),
    token: z.string().optional(),
    reconnectMs: z.number().int().positive().default(5000),
    heartbeatMs: z.number().int().positive().default(30000),
    enabled: z.boolean().default(false),
});
// ---------------------------------------------------------------------------
// TikFinity raw event schemas (representative — based on TikFinity local API)
//
// TikFinity exposes a local WebSocket that emits JSON messages with a `type`
// discriminator. The payload shape per type is documented in
// docs/PROVIDER_TIKFINITY.md. All schemas use `.strip()` to tolerate unknown
// fields from future TikFinity versions.
// ---------------------------------------------------------------------------
const TikFinityUserSchema = z.object({
    id: z.string().min(1).max(128),
    nickname: z.string().min(1).max(128),
    profilePictureUrl: z.string().max(512).optional(),
}).strip();
export const TikFinityChatSchema = z.object({
    type: z.literal('chat'),
    user: TikFinityUserSchema,
    comment: z.string().max(1000),
    timestamp: z.number().finite().optional(),
}).strip();
export const TikFinityLikeSchema = z.object({
    type: z.literal('like'),
    user: TikFinityUserSchema,
    likeCount: z.number().int().min(0).max(1_000_000).optional().default(1),
    timestamp: z.number().finite().optional(),
}).strip();
export const TikFinityFollowSchema = z.object({
    type: z.literal('follow'),
    user: TikFinityUserSchema,
    timestamp: z.number().finite().optional(),
}).strip();
export const TikFinityShareSchema = z.object({
    type: z.literal('share'),
    user: TikFinityUserSchema,
    shareType: z.string().max(64).optional(),
    timestamp: z.number().finite().optional(),
}).strip();
export const TikFinitySubscriptionSchema = z.object({
    type: z.literal('subscription'),
    user: TikFinityUserSchema,
    months: z.number().int().min(1).max(120).optional(),
    timestamp: z.number().finite().optional(),
}).strip();
export const TikFinityGiftSchema = z.object({
    type: z.literal('gift'),
    user: TikFinityUserSchema,
    giftId: z.string().min(1).max(128),
    giftName: z.string().min(1).max(128),
    coinCount: z.number().int().min(0).max(10_000_000).optional().default(0),
    repeatCount: z.number().int().min(1).max(100_000).optional().default(1),
    timestamp: z.number().finite().optional(),
}).strip();
/** Union of all known TikFinity raw event types. */
export const TikFinityRawEventSchema = z.discriminatedUnion('type', [
    TikFinityChatSchema,
    TikFinityLikeSchema,
    TikFinityFollowSchema,
    TikFinityShareSchema,
    TikFinitySubscriptionSchema,
    TikFinityGiftSchema,
]);
// ---------------------------------------------------------------------------
// Reconnect constants
// ---------------------------------------------------------------------------
const MAX_RECONNECT_RETRIES = 10;
const MAX_BACKOFF_MS = 30_000;
const HEARTBEAT_PONG_TIMEOUT_MS = 5000;
/**
 * Parses a raw JSON string from the TikFinity WebSocket into a
 * TikFinityRawEvent. Returns null for malformed or unknown payloads.
 */
export function parseTikfinityPayload(raw) {
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return { ok: false, error: 'Payload is not a JSON object' };
        }
        const result = TikFinityRawEventSchema.safeParse(parsed);
        if (result.success) {
            return { ok: true, value: result.data };
        }
        // Check if it has a 'type' field that we don't recognize
        const obj = parsed;
        if (typeof obj['type'] === 'string') {
            const knownTypes = ['chat', 'like', 'follow', 'share', 'subscription', 'gift'];
            if (!knownTypes.includes(obj['type'])) {
                return { ok: false, error: `Unknown event type: ${obj['type']}` };
            }
        }
        return {
            ok: false,
            error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        };
    }
    catch (err) {
        return { ok: false, error: `JSON parse error: ${String(err)}` };
    }
}
export class TikFinityAdapter {
    cfg;
    onWarn;
    onInfo;
    onFatal;
    /** Instance-scoped counter for deterministic unique event IDs. (FIX 1) */
    eventCounter = 0;
    /** Instance-specific salt for event ID uniqueness across concurrent adapters. (FIX 1) */
    instanceSalt = randomUUID().slice(0, 8);
    ws = null;
    handler;
    connected = false;
    running = false;
    reconnectAttempts = 0;
    reconnectTimer = null;
    heartbeatTimer = null;
    pongTimer = null;
    // Observability
    _eventsReceived = 0;
    _eventsDropped = 0;
    _reconnectCount = 0;
    constructor(opts) {
        this.cfg = TikFinityConfigSchema.parse(opts.config);
        this.onWarn = opts.onWarn ?? (() => { });
        this.onInfo = opts.onInfo ?? (() => { });
        this.onFatal = opts.onFatal;
    }
    async start() {
        if (this.running)
            return;
        this.running = true;
        this.eventCounter = 0; // FIX 1: reset instance counter only
        this.connect();
    }
    async stop() {
        this.running = false;
        this.connected = false;
        this.clearTimers();
        if (this.ws) {
            try {
                this.ws.removeAllListeners();
                this.ws.close();
            }
            catch {
                // Ignore close errors
            }
            this.ws = null;
        }
    }
    onEvent(handler) {
        this.handler = handler;
    }
    isConnected() {
        return this.connected;
    }
    /** Returns the number of events successfully received and mapped. */
    get eventsReceived() {
        return this._eventsReceived;
    }
    /** Returns the number of events dropped (malformed or unknown). */
    get eventsDropped() {
        return this._eventsDropped;
    }
    /** Returns the number of reconnection attempts made. */
    get reconnectCount() {
        return this._reconnectCount;
    }
    /** Resets the instance event counter (for tests). (FIX 1) */
    resetEventCounter() {
        this.eventCounter = 0;
    }
    // -------------------------------------------------------------------------
    // Event mapping: TikFinity raw → NormalizedLiveEvent (FIX 1: instance method)
    // -------------------------------------------------------------------------
    /**
     * Maps a validated TikFinity raw event into a NormalizedLiveEvent.
     * Returns null if mapping fails (should not happen after Zod validation).
     */
    mapEvent(raw) {
        try {
            this.eventCounter++;
            const receivedAt = new Date(raw.timestamp ?? Date.now()).toISOString();
            const baseUser = {
                id: raw.user.id,
                handle: raw.user.nickname,
                displayName: raw.user.nickname,
            };
            // FIX 11: compute real SHA-256 hash of raw JSON payload
            const rawHash = `sha256:${createHash('sha256').update(JSON.stringify(raw)).digest('hex')}`;
            const base = {
                schemaVersion: EVENT_SCHEMA_VERSION,
                id: `evt_tf_${this.instanceSalt}_${this.eventCounter}_${Date.now().toString(36)}`,
                provider: 'tikfinity',
                receivedAt,
                rawHash,
            };
            switch (raw.type) {
                case 'chat':
                    return {
                        ...base,
                        type: 'chat',
                        user: baseUser,
                        comment: raw.comment.slice(0, 500),
                    };
                case 'like':
                    return {
                        ...base,
                        type: 'like',
                        user: baseUser,
                        likeCount: raw.likeCount ?? 1,
                    };
                case 'follow':
                    return {
                        ...base,
                        type: 'follow',
                        user: baseUser,
                    };
                case 'share':
                    return {
                        ...base,
                        type: 'share',
                        user: baseUser,
                    };
                case 'subscription':
                    return {
                        ...base,
                        type: 'subscribe',
                        user: baseUser,
                    };
                case 'gift':
                    return {
                        ...base,
                        type: 'gift',
                        user: baseUser,
                        gift: {
                            id: raw.giftId,
                            name: raw.giftName,
                            repeatCount: raw.repeatCount ?? 1,
                            providerValue: raw.coinCount ?? 0,
                        },
                    };
                default:
                    return null;
            }
        }
        catch {
            return null;
        }
    }
    // -------------------------------------------------------------------------
    // Internal: WebSocket connection
    // -------------------------------------------------------------------------
    connect() {
        if (!this.running)
            return;
        try {
            const url = this.cfg.token
                ? `${this.cfg.url}?token=${encodeURIComponent(this.cfg.token)}`
                : this.cfg.url;
            this.ws = new WebSocket(url);
            this.ws.on('open', () => this.handleOpen());
            this.ws.on('message', (data) => this.handleMessage(data));
            this.ws.on('close', (code, reason) => this.handleClose(code, reason));
            this.ws.on('error', (err) => this.handleError(err));
            this.ws.on('pong', () => this.handlePong());
        }
        catch (err) {
            this.onWarn(`[TikFinity] WebSocket creation failed: ${String(err)}`);
            this.scheduleReconnect();
        }
    }
    handleOpen() {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.onInfo('[TikFinity] Connected to provider WebSocket', { url: this.cfg.url });
        this.startHeartbeat();
    }
    handleMessage(data) {
        const raw = typeof data === 'string' ? data : data.toString('utf8');
        const parsed = parseTikfinityPayload(raw);
        if (!parsed.ok) {
            this._eventsDropped++;
            this.onWarn(`[TikFinity] Dropped event: ${parsed.error}`);
            return;
        }
        const normalized = this.mapEvent(parsed.value);
        if (!normalized) {
            this._eventsDropped++;
            this.onWarn(`[TikFinity] Failed to map event type: ${parsed.value.type}`);
            return;
        }
        this._eventsReceived++;
        this.handler?.(normalized);
    }
    handleClose(code, reason) {
        this.connected = false;
        this.stopHeartbeat();
        // FIX 4: log close code and reason
        this.onInfo(`[TikFinity] Connection closed: code=${code} reason=${reason.toString('utf8')}`);
        if (this.running) {
            this.onWarn('[TikFinity] Connection closed unexpectedly, scheduling reconnect');
            this.scheduleReconnect();
        }
    }
    handleError(err) {
        this.onWarn(`[TikFinity] WebSocket error: ${err.message}`);
        // close event will fire after error, triggering reconnect
    }
    // -------------------------------------------------------------------------
    // Internal: Reconnection with exponential backoff
    // -------------------------------------------------------------------------
    scheduleReconnect() {
        if (!this.running)
            return;
        if (this.reconnectAttempts >= MAX_RECONNECT_RETRIES) {
            this.onWarn(`[TikFinity] Max reconnect attempts (${MAX_RECONNECT_RETRIES}) reached, giving up`);
            this.running = false;
            // FIX 8: notify operator via onFatal callback
            this.onFatal?.('[TikFinity] Adapter permanently disconnected after max retries');
            return;
        }
        const backoffMs = Math.min(this.cfg.reconnectMs * Math.pow(2, this.reconnectAttempts), MAX_BACKOFF_MS);
        this.reconnectAttempts++;
        this._reconnectCount++;
        this.onInfo(`[TikFinity] Reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_RETRIES} in ${backoffMs}ms`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, backoffMs);
    }
    // -------------------------------------------------------------------------
    // Internal: Heartbeat
    // -------------------------------------------------------------------------
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            this.sendPing();
        }, this.cfg.heartbeatMs);
    }
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        if (this.pongTimer) {
            clearTimeout(this.pongTimer);
            this.pongTimer = null;
        }
    }
    sendPing() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
            return;
        // FIX 5: clear existing pongTimer before creating new one
        if (this.pongTimer) {
            clearTimeout(this.pongTimer);
            this.pongTimer = null;
        }
        try {
            this.ws.ping();
        }
        catch {
            // Ignore ping failures
        }
        // Set pong timeout — if no pong in 5s, force reconnect
        this.pongTimer = setTimeout(() => {
            this.onWarn('[TikFinity] Heartbeat pong timeout, forcing reconnect');
            if (this.ws) {
                try {
                    this.ws.terminate();
                }
                catch {
                    // Ignore terminate errors
                }
            }
        }, HEARTBEAT_PONG_TIMEOUT_MS);
    }
    handlePong() {
        if (this.pongTimer) {
            clearTimeout(this.pongTimer);
            this.pongTimer = null;
        }
    }
    // -------------------------------------------------------------------------
    // Internal: Timer cleanup
    // -------------------------------------------------------------------------
    clearTimers() {
        this.stopHeartbeat();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
}
