/**
 * Phase 10 — WebSocket protocol schemas for the gateway ↔ Godot real-time bridge.
 *
 * Discriminated union on `type` covering: handshake, handshake_ack, heartbeat_ping,
 * heartbeat_pong, command, command_ack, snapshot, error, reconnect, disconnect.
 *
 * Every message carries a `protocolVersion` field. The WS_PROTOCOL_VERSION constant
 * is independent from the Phase 2 PROTOCOL_VERSION (HTTP messages) to allow each
 * transport to evolve independently.
 */
import { z } from 'zod';
import { GameCommandSchema } from './commands.js';
/**
 * Version of the WebSocket transport protocol between the gateway and the Godot client.
 * Bump when a message type, field name, or field type changes.
 */
export const WS_PROTOCOL_VERSION = 1;
// ---------------------------------------------------------------------------
// Handshake
// ---------------------------------------------------------------------------
/** Server → client: initial greeting after WS connection established. */
export const WsHandshakeSchema = z
    .object({
    type: z.literal('handshake'),
    protocolVersion: z.literal(WS_PROTOCOL_VERSION),
    serverId: z.string().min(1).max(128),
    heartbeatIntervalMs: z.number().int().positive(),
    retryBufferCapacity: z.number().int().positive(),
    currentSequenceNumber: z.number().int().min(0),
})
    .strict();
/** Client → server: acknowledgment of handshake with reconnect info. */
export const WsHandshakeAckSchema = z
    .object({
    type: z.literal('handshake_ack'),
    protocolVersion: z.literal(WS_PROTOCOL_VERSION),
    clientId: z.string().min(1).max(128),
    lastReceivedSequenceNumber: z.number().int().min(0),
})
    .strict();
// ---------------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------------
/** Server → client: periodic liveness ping. */
export const WsHeartbeatPingSchema = z
    .object({
    type: z.literal('heartbeat_ping'),
    protocolVersion: z.literal(WS_PROTOCOL_VERSION),
    timestamp: z.number().finite(),
})
    .strict();
/** Client → server: response to heartbeat ping. */
export const WsHeartbeatPongSchema = z
    .object({
    type: z.literal('heartbeat_pong'),
    protocolVersion: z.literal(WS_PROTOCOL_VERSION),
    timestamp: z.number().finite(),
})
    .strict();
// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------
/** Server → client: a game command with sequencing metadata. */
export const WsCommandSchema = z
    .object({
    type: z.literal('command'),
    protocolVersion: z.literal(WS_PROTOCOL_VERSION),
    messageId: z.string().min(1).max(128),
    command: GameCommandSchema,
    sequenceNumber: z.number().int().min(0),
    requiresAck: z.boolean(),
})
    .strict();
/** Client → server: acknowledgment of a received command. */
export const WsCommandAckSchema = z
    .object({
    type: z.literal('command_ack'),
    protocolVersion: z.literal(WS_PROTOCOL_VERSION),
    messageId: z.string().min(1).max(128),
    sequenceNumber: z.number().int().min(0),
    status: z.enum(['accepted', 'rejected', 'duplicate']),
    reason: z.string().min(1).max(500).optional(),
})
    .strict();
// ---------------------------------------------------------------------------
// Snapshot (reconnect recovery)
// ---------------------------------------------------------------------------
/** Server → client: buffered commands the client missed during disconnect. */
export const WsSnapshotSchema = z
    .object({
    type: z.literal('snapshot'),
    protocolVersion: z.literal(WS_PROTOCOL_VERSION),
    sequenceNumber: z.number().int().min(0),
    commands: z.array(GameCommandSchema),
})
    .strict();
// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------
/** Bidirectional: typed error notification. */
export const WsErrorSchema = z
    .object({
    type: z.literal('error'),
    protocolVersion: z.literal(WS_PROTOCOL_VERSION),
    code: z.string().min(1).max(128),
    message: z.string().min(1).max(500),
    details: z.unknown().optional(),
})
    .strict();
// ---------------------------------------------------------------------------
// Reconnect / Disconnect
// ---------------------------------------------------------------------------
/** Client → server: signals a reconnect attempt (informational). */
export const WsReconnectSchema = z
    .object({
    type: z.literal('reconnect'),
    protocolVersion: z.literal(WS_PROTOCOL_VERSION),
    clientId: z.string().min(1).max(128),
    lastReceivedSequenceNumber: z.number().int().min(0),
})
    .strict();
/** Server → client: graceful disconnect notification. */
export const WsDisconnectSchema = z
    .object({
    type: z.literal('disconnect'),
    protocolVersion: z.literal(WS_PROTOCOL_VERSION),
    reason: z.string().min(1).max(500),
})
    .strict();
// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------
/** Every message that may cross the WebSocket, discriminated by `type`. */
export const WsMessageSchema = z.discriminatedUnion('type', [
    WsHandshakeSchema,
    WsHandshakeAckSchema,
    WsHeartbeatPingSchema,
    WsHeartbeatPongSchema,
    WsCommandSchema,
    WsCommandAckSchema,
    WsSnapshotSchema,
    WsErrorSchema,
    WsReconnectSchema,
    WsDisconnectSchema,
]);
