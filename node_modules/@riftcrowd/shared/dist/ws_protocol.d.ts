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
/**
 * Version of the WebSocket transport protocol between the gateway and the Godot client.
 * Bump when a message type, field name, or field type changes.
 */
export declare const WS_PROTOCOL_VERSION = 1;
/** Server → client: initial greeting after WS connection established. */
export declare const WsHandshakeSchema: z.ZodObject<{
    type: z.ZodLiteral<"handshake">;
    protocolVersion: z.ZodLiteral<1>;
    serverId: z.ZodString;
    heartbeatIntervalMs: z.ZodNumber;
    retryBufferCapacity: z.ZodNumber;
    currentSequenceNumber: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    type: "handshake";
    protocolVersion: 1;
    serverId: string;
    heartbeatIntervalMs: number;
    retryBufferCapacity: number;
    currentSequenceNumber: number;
}, {
    type: "handshake";
    protocolVersion: 1;
    serverId: string;
    heartbeatIntervalMs: number;
    retryBufferCapacity: number;
    currentSequenceNumber: number;
}>;
/** Client → server: acknowledgment of handshake with reconnect info. */
export declare const WsHandshakeAckSchema: z.ZodObject<{
    type: z.ZodLiteral<"handshake_ack">;
    protocolVersion: z.ZodLiteral<1>;
    clientId: z.ZodString;
    lastReceivedSequenceNumber: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    type: "handshake_ack";
    protocolVersion: 1;
    clientId: string;
    lastReceivedSequenceNumber: number;
}, {
    type: "handshake_ack";
    protocolVersion: 1;
    clientId: string;
    lastReceivedSequenceNumber: number;
}>;
/** Server → client: periodic liveness ping. */
export declare const WsHeartbeatPingSchema: z.ZodObject<{
    type: z.ZodLiteral<"heartbeat_ping">;
    protocolVersion: z.ZodLiteral<1>;
    timestamp: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    type: "heartbeat_ping";
    protocolVersion: 1;
    timestamp: number;
}, {
    type: "heartbeat_ping";
    protocolVersion: 1;
    timestamp: number;
}>;
/** Client → server: response to heartbeat ping. */
export declare const WsHeartbeatPongSchema: z.ZodObject<{
    type: z.ZodLiteral<"heartbeat_pong">;
    protocolVersion: z.ZodLiteral<1>;
    timestamp: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    type: "heartbeat_pong";
    protocolVersion: 1;
    timestamp: number;
}, {
    type: "heartbeat_pong";
    protocolVersion: 1;
    timestamp: number;
}>;
/** Server → client: a game command with sequencing metadata. */
export declare const WsCommandSchema: z.ZodObject<{
    type: z.ZodLiteral<"command">;
    protocolVersion: z.ZodLiteral<1>;
    messageId: z.ZodString;
    command: z.ZodObject<{
        schemaVersion: z.ZodLiteral<7>;
        id: z.ZodString;
        type: z.ZodEnum<["JOIN_FACTION", "SPAWN_CHAMPION", "ADD_ENERGY", "ADD_SHIELD", "SPAWN_SQUAD", "CAST_ABILITY", "START_WORLD_EVENT", "DISPLAY_SPOTLIGHT", "PAUSE_EVENTS", "END_ROUND", "GIFT_APPLY", "FOLLOW_GUARDIAN", "SHARE_SHIELD", "STRATEGY_VOTE", "FREE_ENERGY_ABILITY", "ADD_SCORE", "SPAWN_VFX", "SPOTLIGHT_CARD", "SUPPORTER_CALLOUT", "CAMERA_IMPULSE", "PLAY_AUDIO", "SET_WINDOW_MODE", "ACTIVATE_FALLBACK", "DEACTIVATE_FALLBACK", "SET_QUALITY_TIER", "CAST_TECHNIQUE"]>;
        createdAt: z.ZodString;
        factionId: z.ZodOptional<z.ZodString>;
        viewerId: z.ZodOptional<z.ZodString>;
        displayName: z.ZodOptional<z.ZodString>;
        amount: z.ZodOptional<z.ZodNumber>;
        abilityId: z.ZodOptional<z.ZodString>;
        sourceEventIds: z.ZodArray<z.ZodString, "many">;
        expiresAt: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
    }, "strict", z.ZodTypeAny, {
        type: "JOIN_FACTION" | "SPAWN_CHAMPION" | "ADD_ENERGY" | "ADD_SHIELD" | "SPAWN_SQUAD" | "CAST_ABILITY" | "START_WORLD_EVENT" | "DISPLAY_SPOTLIGHT" | "PAUSE_EVENTS" | "END_ROUND" | "GIFT_APPLY" | "FOLLOW_GUARDIAN" | "SHARE_SHIELD" | "STRATEGY_VOTE" | "FREE_ENERGY_ABILITY" | "ADD_SCORE" | "SPAWN_VFX" | "SPOTLIGHT_CARD" | "SUPPORTER_CALLOUT" | "CAMERA_IMPULSE" | "PLAY_AUDIO" | "SET_WINDOW_MODE" | "ACTIVATE_FALLBACK" | "DEACTIVATE_FALLBACK" | "SET_QUALITY_TIER" | "CAST_TECHNIQUE";
        schemaVersion: 7;
        id: string;
        createdAt: string;
        sourceEventIds: string[];
        factionId?: string | undefined;
        viewerId?: string | undefined;
        displayName?: string | undefined;
        amount?: number | undefined;
        abilityId?: string | undefined;
        expiresAt?: string | undefined;
        metadata?: Record<string, string | number | boolean> | undefined;
    }, {
        type: "JOIN_FACTION" | "SPAWN_CHAMPION" | "ADD_ENERGY" | "ADD_SHIELD" | "SPAWN_SQUAD" | "CAST_ABILITY" | "START_WORLD_EVENT" | "DISPLAY_SPOTLIGHT" | "PAUSE_EVENTS" | "END_ROUND" | "GIFT_APPLY" | "FOLLOW_GUARDIAN" | "SHARE_SHIELD" | "STRATEGY_VOTE" | "FREE_ENERGY_ABILITY" | "ADD_SCORE" | "SPAWN_VFX" | "SPOTLIGHT_CARD" | "SUPPORTER_CALLOUT" | "CAMERA_IMPULSE" | "PLAY_AUDIO" | "SET_WINDOW_MODE" | "ACTIVATE_FALLBACK" | "DEACTIVATE_FALLBACK" | "SET_QUALITY_TIER" | "CAST_TECHNIQUE";
        schemaVersion: 7;
        id: string;
        createdAt: string;
        sourceEventIds: string[];
        factionId?: string | undefined;
        viewerId?: string | undefined;
        displayName?: string | undefined;
        amount?: number | undefined;
        abilityId?: string | undefined;
        expiresAt?: string | undefined;
        metadata?: Record<string, string | number | boolean> | undefined;
    }>;
    sequenceNumber: z.ZodNumber;
    requiresAck: z.ZodBoolean;
}, "strict", z.ZodTypeAny, {
    type: "command";
    command: {
        type: "JOIN_FACTION" | "SPAWN_CHAMPION" | "ADD_ENERGY" | "ADD_SHIELD" | "SPAWN_SQUAD" | "CAST_ABILITY" | "START_WORLD_EVENT" | "DISPLAY_SPOTLIGHT" | "PAUSE_EVENTS" | "END_ROUND" | "GIFT_APPLY" | "FOLLOW_GUARDIAN" | "SHARE_SHIELD" | "STRATEGY_VOTE" | "FREE_ENERGY_ABILITY" | "ADD_SCORE" | "SPAWN_VFX" | "SPOTLIGHT_CARD" | "SUPPORTER_CALLOUT" | "CAMERA_IMPULSE" | "PLAY_AUDIO" | "SET_WINDOW_MODE" | "ACTIVATE_FALLBACK" | "DEACTIVATE_FALLBACK" | "SET_QUALITY_TIER" | "CAST_TECHNIQUE";
        schemaVersion: 7;
        id: string;
        createdAt: string;
        sourceEventIds: string[];
        factionId?: string | undefined;
        viewerId?: string | undefined;
        displayName?: string | undefined;
        amount?: number | undefined;
        abilityId?: string | undefined;
        expiresAt?: string | undefined;
        metadata?: Record<string, string | number | boolean> | undefined;
    };
    protocolVersion: 1;
    messageId: string;
    sequenceNumber: number;
    requiresAck: boolean;
}, {
    type: "command";
    command: {
        type: "JOIN_FACTION" | "SPAWN_CHAMPION" | "ADD_ENERGY" | "ADD_SHIELD" | "SPAWN_SQUAD" | "CAST_ABILITY" | "START_WORLD_EVENT" | "DISPLAY_SPOTLIGHT" | "PAUSE_EVENTS" | "END_ROUND" | "GIFT_APPLY" | "FOLLOW_GUARDIAN" | "SHARE_SHIELD" | "STRATEGY_VOTE" | "FREE_ENERGY_ABILITY" | "ADD_SCORE" | "SPAWN_VFX" | "SPOTLIGHT_CARD" | "SUPPORTER_CALLOUT" | "CAMERA_IMPULSE" | "PLAY_AUDIO" | "SET_WINDOW_MODE" | "ACTIVATE_FALLBACK" | "DEACTIVATE_FALLBACK" | "SET_QUALITY_TIER" | "CAST_TECHNIQUE";
        schemaVersion: 7;
        id: string;
        createdAt: string;
        sourceEventIds: string[];
        factionId?: string | undefined;
        viewerId?: string | undefined;
        displayName?: string | undefined;
        amount?: number | undefined;
        abilityId?: string | undefined;
        expiresAt?: string | undefined;
        metadata?: Record<string, string | number | boolean> | undefined;
    };
    protocolVersion: 1;
    messageId: string;
    sequenceNumber: number;
    requiresAck: boolean;
}>;
/** Client → server: acknowledgment of a received command. */
export declare const WsCommandAckSchema: z.ZodObject<{
    type: z.ZodLiteral<"command_ack">;
    protocolVersion: z.ZodLiteral<1>;
    messageId: z.ZodString;
    sequenceNumber: z.ZodNumber;
    status: z.ZodEnum<["accepted", "rejected", "duplicate"]>;
    reason: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    type: "command_ack";
    status: "accepted" | "rejected" | "duplicate";
    protocolVersion: 1;
    messageId: string;
    sequenceNumber: number;
    reason?: string | undefined;
}, {
    type: "command_ack";
    status: "accepted" | "rejected" | "duplicate";
    protocolVersion: 1;
    messageId: string;
    sequenceNumber: number;
    reason?: string | undefined;
}>;
/** Server → client: buffered commands the client missed during disconnect. */
export declare const WsSnapshotSchema: z.ZodObject<{
    type: z.ZodLiteral<"snapshot">;
    protocolVersion: z.ZodLiteral<1>;
    sequenceNumber: z.ZodNumber;
    commands: z.ZodArray<z.ZodObject<{
        schemaVersion: z.ZodLiteral<7>;
        id: z.ZodString;
        type: z.ZodEnum<["JOIN_FACTION", "SPAWN_CHAMPION", "ADD_ENERGY", "ADD_SHIELD", "SPAWN_SQUAD", "CAST_ABILITY", "START_WORLD_EVENT", "DISPLAY_SPOTLIGHT", "PAUSE_EVENTS", "END_ROUND", "GIFT_APPLY", "FOLLOW_GUARDIAN", "SHARE_SHIELD", "STRATEGY_VOTE", "FREE_ENERGY_ABILITY", "ADD_SCORE", "SPAWN_VFX", "SPOTLIGHT_CARD", "SUPPORTER_CALLOUT", "CAMERA_IMPULSE", "PLAY_AUDIO", "SET_WINDOW_MODE", "ACTIVATE_FALLBACK", "DEACTIVATE_FALLBACK", "SET_QUALITY_TIER", "CAST_TECHNIQUE"]>;
        createdAt: z.ZodString;
        factionId: z.ZodOptional<z.ZodString>;
        viewerId: z.ZodOptional<z.ZodString>;
        displayName: z.ZodOptional<z.ZodString>;
        amount: z.ZodOptional<z.ZodNumber>;
        abilityId: z.ZodOptional<z.ZodString>;
        sourceEventIds: z.ZodArray<z.ZodString, "many">;
        expiresAt: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
    }, "strict", z.ZodTypeAny, {
        type: "JOIN_FACTION" | "SPAWN_CHAMPION" | "ADD_ENERGY" | "ADD_SHIELD" | "SPAWN_SQUAD" | "CAST_ABILITY" | "START_WORLD_EVENT" | "DISPLAY_SPOTLIGHT" | "PAUSE_EVENTS" | "END_ROUND" | "GIFT_APPLY" | "FOLLOW_GUARDIAN" | "SHARE_SHIELD" | "STRATEGY_VOTE" | "FREE_ENERGY_ABILITY" | "ADD_SCORE" | "SPAWN_VFX" | "SPOTLIGHT_CARD" | "SUPPORTER_CALLOUT" | "CAMERA_IMPULSE" | "PLAY_AUDIO" | "SET_WINDOW_MODE" | "ACTIVATE_FALLBACK" | "DEACTIVATE_FALLBACK" | "SET_QUALITY_TIER" | "CAST_TECHNIQUE";
        schemaVersion: 7;
        id: string;
        createdAt: string;
        sourceEventIds: string[];
        factionId?: string | undefined;
        viewerId?: string | undefined;
        displayName?: string | undefined;
        amount?: number | undefined;
        abilityId?: string | undefined;
        expiresAt?: string | undefined;
        metadata?: Record<string, string | number | boolean> | undefined;
    }, {
        type: "JOIN_FACTION" | "SPAWN_CHAMPION" | "ADD_ENERGY" | "ADD_SHIELD" | "SPAWN_SQUAD" | "CAST_ABILITY" | "START_WORLD_EVENT" | "DISPLAY_SPOTLIGHT" | "PAUSE_EVENTS" | "END_ROUND" | "GIFT_APPLY" | "FOLLOW_GUARDIAN" | "SHARE_SHIELD" | "STRATEGY_VOTE" | "FREE_ENERGY_ABILITY" | "ADD_SCORE" | "SPAWN_VFX" | "SPOTLIGHT_CARD" | "SUPPORTER_CALLOUT" | "CAMERA_IMPULSE" | "PLAY_AUDIO" | "SET_WINDOW_MODE" | "ACTIVATE_FALLBACK" | "DEACTIVATE_FALLBACK" | "SET_QUALITY_TIER" | "CAST_TECHNIQUE";
        schemaVersion: 7;
        id: string;
        createdAt: string;
        sourceEventIds: string[];
        factionId?: string | undefined;
        viewerId?: string | undefined;
        displayName?: string | undefined;
        amount?: number | undefined;
        abilityId?: string | undefined;
        expiresAt?: string | undefined;
        metadata?: Record<string, string | number | boolean> | undefined;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    type: "snapshot";
    protocolVersion: 1;
    sequenceNumber: number;
    commands: {
        type: "JOIN_FACTION" | "SPAWN_CHAMPION" | "ADD_ENERGY" | "ADD_SHIELD" | "SPAWN_SQUAD" | "CAST_ABILITY" | "START_WORLD_EVENT" | "DISPLAY_SPOTLIGHT" | "PAUSE_EVENTS" | "END_ROUND" | "GIFT_APPLY" | "FOLLOW_GUARDIAN" | "SHARE_SHIELD" | "STRATEGY_VOTE" | "FREE_ENERGY_ABILITY" | "ADD_SCORE" | "SPAWN_VFX" | "SPOTLIGHT_CARD" | "SUPPORTER_CALLOUT" | "CAMERA_IMPULSE" | "PLAY_AUDIO" | "SET_WINDOW_MODE" | "ACTIVATE_FALLBACK" | "DEACTIVATE_FALLBACK" | "SET_QUALITY_TIER" | "CAST_TECHNIQUE";
        schemaVersion: 7;
        id: string;
        createdAt: string;
        sourceEventIds: string[];
        factionId?: string | undefined;
        viewerId?: string | undefined;
        displayName?: string | undefined;
        amount?: number | undefined;
        abilityId?: string | undefined;
        expiresAt?: string | undefined;
        metadata?: Record<string, string | number | boolean> | undefined;
    }[];
}, {
    type: "snapshot";
    protocolVersion: 1;
    sequenceNumber: number;
    commands: {
        type: "JOIN_FACTION" | "SPAWN_CHAMPION" | "ADD_ENERGY" | "ADD_SHIELD" | "SPAWN_SQUAD" | "CAST_ABILITY" | "START_WORLD_EVENT" | "DISPLAY_SPOTLIGHT" | "PAUSE_EVENTS" | "END_ROUND" | "GIFT_APPLY" | "FOLLOW_GUARDIAN" | "SHARE_SHIELD" | "STRATEGY_VOTE" | "FREE_ENERGY_ABILITY" | "ADD_SCORE" | "SPAWN_VFX" | "SPOTLIGHT_CARD" | "SUPPORTER_CALLOUT" | "CAMERA_IMPULSE" | "PLAY_AUDIO" | "SET_WINDOW_MODE" | "ACTIVATE_FALLBACK" | "DEACTIVATE_FALLBACK" | "SET_QUALITY_TIER" | "CAST_TECHNIQUE";
        schemaVersion: 7;
        id: string;
        createdAt: string;
        sourceEventIds: string[];
        factionId?: string | undefined;
        viewerId?: string | undefined;
        displayName?: string | undefined;
        amount?: number | undefined;
        abilityId?: string | undefined;
        expiresAt?: string | undefined;
        metadata?: Record<string, string | number | boolean> | undefined;
    }[];
}>;
/** Bidirectional: typed error notification. */
export declare const WsErrorSchema: z.ZodObject<{
    type: z.ZodLiteral<"error">;
    protocolVersion: z.ZodLiteral<1>;
    code: z.ZodString;
    message: z.ZodString;
    details: z.ZodOptional<z.ZodUnknown>;
}, "strict", z.ZodTypeAny, {
    code: string;
    message: string;
    type: "error";
    protocolVersion: 1;
    details?: unknown;
}, {
    code: string;
    message: string;
    type: "error";
    protocolVersion: 1;
    details?: unknown;
}>;
/** Client → server: signals a reconnect attempt (informational). */
export declare const WsReconnectSchema: z.ZodObject<{
    type: z.ZodLiteral<"reconnect">;
    protocolVersion: z.ZodLiteral<1>;
    clientId: z.ZodString;
    lastReceivedSequenceNumber: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    type: "reconnect";
    protocolVersion: 1;
    clientId: string;
    lastReceivedSequenceNumber: number;
}, {
    type: "reconnect";
    protocolVersion: 1;
    clientId: string;
    lastReceivedSequenceNumber: number;
}>;
/** Server → client: graceful disconnect notification. */
export declare const WsDisconnectSchema: z.ZodObject<{
    type: z.ZodLiteral<"disconnect">;
    protocolVersion: z.ZodLiteral<1>;
    reason: z.ZodString;
}, "strict", z.ZodTypeAny, {
    type: "disconnect";
    reason: string;
    protocolVersion: 1;
}, {
    type: "disconnect";
    reason: string;
    protocolVersion: 1;
}>;
/** Every message that may cross the WebSocket, discriminated by `type`. */
export declare const WsMessageSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"handshake">;
    protocolVersion: z.ZodLiteral<1>;
    serverId: z.ZodString;
    heartbeatIntervalMs: z.ZodNumber;
    retryBufferCapacity: z.ZodNumber;
    currentSequenceNumber: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    type: "handshake";
    protocolVersion: 1;
    serverId: string;
    heartbeatIntervalMs: number;
    retryBufferCapacity: number;
    currentSequenceNumber: number;
}, {
    type: "handshake";
    protocolVersion: 1;
    serverId: string;
    heartbeatIntervalMs: number;
    retryBufferCapacity: number;
    currentSequenceNumber: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"handshake_ack">;
    protocolVersion: z.ZodLiteral<1>;
    clientId: z.ZodString;
    lastReceivedSequenceNumber: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    type: "handshake_ack";
    protocolVersion: 1;
    clientId: string;
    lastReceivedSequenceNumber: number;
}, {
    type: "handshake_ack";
    protocolVersion: 1;
    clientId: string;
    lastReceivedSequenceNumber: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"heartbeat_ping">;
    protocolVersion: z.ZodLiteral<1>;
    timestamp: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    type: "heartbeat_ping";
    protocolVersion: 1;
    timestamp: number;
}, {
    type: "heartbeat_ping";
    protocolVersion: 1;
    timestamp: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"heartbeat_pong">;
    protocolVersion: z.ZodLiteral<1>;
    timestamp: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    type: "heartbeat_pong";
    protocolVersion: 1;
    timestamp: number;
}, {
    type: "heartbeat_pong";
    protocolVersion: 1;
    timestamp: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"command">;
    protocolVersion: z.ZodLiteral<1>;
    messageId: z.ZodString;
    command: z.ZodObject<{
        schemaVersion: z.ZodLiteral<7>;
        id: z.ZodString;
        type: z.ZodEnum<["JOIN_FACTION", "SPAWN_CHAMPION", "ADD_ENERGY", "ADD_SHIELD", "SPAWN_SQUAD", "CAST_ABILITY", "START_WORLD_EVENT", "DISPLAY_SPOTLIGHT", "PAUSE_EVENTS", "END_ROUND", "GIFT_APPLY", "FOLLOW_GUARDIAN", "SHARE_SHIELD", "STRATEGY_VOTE", "FREE_ENERGY_ABILITY", "ADD_SCORE", "SPAWN_VFX", "SPOTLIGHT_CARD", "SUPPORTER_CALLOUT", "CAMERA_IMPULSE", "PLAY_AUDIO", "SET_WINDOW_MODE", "ACTIVATE_FALLBACK", "DEACTIVATE_FALLBACK", "SET_QUALITY_TIER", "CAST_TECHNIQUE"]>;
        createdAt: z.ZodString;
        factionId: z.ZodOptional<z.ZodString>;
        viewerId: z.ZodOptional<z.ZodString>;
        displayName: z.ZodOptional<z.ZodString>;
        amount: z.ZodOptional<z.ZodNumber>;
        abilityId: z.ZodOptional<z.ZodString>;
        sourceEventIds: z.ZodArray<z.ZodString, "many">;
        expiresAt: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
    }, "strict", z.ZodTypeAny, {
        type: "JOIN_FACTION" | "SPAWN_CHAMPION" | "ADD_ENERGY" | "ADD_SHIELD" | "SPAWN_SQUAD" | "CAST_ABILITY" | "START_WORLD_EVENT" | "DISPLAY_SPOTLIGHT" | "PAUSE_EVENTS" | "END_ROUND" | "GIFT_APPLY" | "FOLLOW_GUARDIAN" | "SHARE_SHIELD" | "STRATEGY_VOTE" | "FREE_ENERGY_ABILITY" | "ADD_SCORE" | "SPAWN_VFX" | "SPOTLIGHT_CARD" | "SUPPORTER_CALLOUT" | "CAMERA_IMPULSE" | "PLAY_AUDIO" | "SET_WINDOW_MODE" | "ACTIVATE_FALLBACK" | "DEACTIVATE_FALLBACK" | "SET_QUALITY_TIER" | "CAST_TECHNIQUE";
        schemaVersion: 7;
        id: string;
        createdAt: string;
        sourceEventIds: string[];
        factionId?: string | undefined;
        viewerId?: string | undefined;
        displayName?: string | undefined;
        amount?: number | undefined;
        abilityId?: string | undefined;
        expiresAt?: string | undefined;
        metadata?: Record<string, string | number | boolean> | undefined;
    }, {
        type: "JOIN_FACTION" | "SPAWN_CHAMPION" | "ADD_ENERGY" | "ADD_SHIELD" | "SPAWN_SQUAD" | "CAST_ABILITY" | "START_WORLD_EVENT" | "DISPLAY_SPOTLIGHT" | "PAUSE_EVENTS" | "END_ROUND" | "GIFT_APPLY" | "FOLLOW_GUARDIAN" | "SHARE_SHIELD" | "STRATEGY_VOTE" | "FREE_ENERGY_ABILITY" | "ADD_SCORE" | "SPAWN_VFX" | "SPOTLIGHT_CARD" | "SUPPORTER_CALLOUT" | "CAMERA_IMPULSE" | "PLAY_AUDIO" | "SET_WINDOW_MODE" | "ACTIVATE_FALLBACK" | "DEACTIVATE_FALLBACK" | "SET_QUALITY_TIER" | "CAST_TECHNIQUE";
        schemaVersion: 7;
        id: string;
        createdAt: string;
        sourceEventIds: string[];
        factionId?: string | undefined;
        viewerId?: string | undefined;
        displayName?: string | undefined;
        amount?: number | undefined;
        abilityId?: string | undefined;
        expiresAt?: string | undefined;
        metadata?: Record<string, string | number | boolean> | undefined;
    }>;
    sequenceNumber: z.ZodNumber;
    requiresAck: z.ZodBoolean;
}, "strict", z.ZodTypeAny, {
    type: "command";
    command: {
        type: "JOIN_FACTION" | "SPAWN_CHAMPION" | "ADD_ENERGY" | "ADD_SHIELD" | "SPAWN_SQUAD" | "CAST_ABILITY" | "START_WORLD_EVENT" | "DISPLAY_SPOTLIGHT" | "PAUSE_EVENTS" | "END_ROUND" | "GIFT_APPLY" | "FOLLOW_GUARDIAN" | "SHARE_SHIELD" | "STRATEGY_VOTE" | "FREE_ENERGY_ABILITY" | "ADD_SCORE" | "SPAWN_VFX" | "SPOTLIGHT_CARD" | "SUPPORTER_CALLOUT" | "CAMERA_IMPULSE" | "PLAY_AUDIO" | "SET_WINDOW_MODE" | "ACTIVATE_FALLBACK" | "DEACTIVATE_FALLBACK" | "SET_QUALITY_TIER" | "CAST_TECHNIQUE";
        schemaVersion: 7;
        id: string;
        createdAt: string;
        sourceEventIds: string[];
        factionId?: string | undefined;
        viewerId?: string | undefined;
        displayName?: string | undefined;
        amount?: number | undefined;
        abilityId?: string | undefined;
        expiresAt?: string | undefined;
        metadata?: Record<string, string | number | boolean> | undefined;
    };
    protocolVersion: 1;
    messageId: string;
    sequenceNumber: number;
    requiresAck: boolean;
}, {
    type: "command";
    command: {
        type: "JOIN_FACTION" | "SPAWN_CHAMPION" | "ADD_ENERGY" | "ADD_SHIELD" | "SPAWN_SQUAD" | "CAST_ABILITY" | "START_WORLD_EVENT" | "DISPLAY_SPOTLIGHT" | "PAUSE_EVENTS" | "END_ROUND" | "GIFT_APPLY" | "FOLLOW_GUARDIAN" | "SHARE_SHIELD" | "STRATEGY_VOTE" | "FREE_ENERGY_ABILITY" | "ADD_SCORE" | "SPAWN_VFX" | "SPOTLIGHT_CARD" | "SUPPORTER_CALLOUT" | "CAMERA_IMPULSE" | "PLAY_AUDIO" | "SET_WINDOW_MODE" | "ACTIVATE_FALLBACK" | "DEACTIVATE_FALLBACK" | "SET_QUALITY_TIER" | "CAST_TECHNIQUE";
        schemaVersion: 7;
        id: string;
        createdAt: string;
        sourceEventIds: string[];
        factionId?: string | undefined;
        viewerId?: string | undefined;
        displayName?: string | undefined;
        amount?: number | undefined;
        abilityId?: string | undefined;
        expiresAt?: string | undefined;
        metadata?: Record<string, string | number | boolean> | undefined;
    };
    protocolVersion: 1;
    messageId: string;
    sequenceNumber: number;
    requiresAck: boolean;
}>, z.ZodObject<{
    type: z.ZodLiteral<"command_ack">;
    protocolVersion: z.ZodLiteral<1>;
    messageId: z.ZodString;
    sequenceNumber: z.ZodNumber;
    status: z.ZodEnum<["accepted", "rejected", "duplicate"]>;
    reason: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    type: "command_ack";
    status: "accepted" | "rejected" | "duplicate";
    protocolVersion: 1;
    messageId: string;
    sequenceNumber: number;
    reason?: string | undefined;
}, {
    type: "command_ack";
    status: "accepted" | "rejected" | "duplicate";
    protocolVersion: 1;
    messageId: string;
    sequenceNumber: number;
    reason?: string | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"snapshot">;
    protocolVersion: z.ZodLiteral<1>;
    sequenceNumber: z.ZodNumber;
    commands: z.ZodArray<z.ZodObject<{
        schemaVersion: z.ZodLiteral<7>;
        id: z.ZodString;
        type: z.ZodEnum<["JOIN_FACTION", "SPAWN_CHAMPION", "ADD_ENERGY", "ADD_SHIELD", "SPAWN_SQUAD", "CAST_ABILITY", "START_WORLD_EVENT", "DISPLAY_SPOTLIGHT", "PAUSE_EVENTS", "END_ROUND", "GIFT_APPLY", "FOLLOW_GUARDIAN", "SHARE_SHIELD", "STRATEGY_VOTE", "FREE_ENERGY_ABILITY", "ADD_SCORE", "SPAWN_VFX", "SPOTLIGHT_CARD", "SUPPORTER_CALLOUT", "CAMERA_IMPULSE", "PLAY_AUDIO", "SET_WINDOW_MODE", "ACTIVATE_FALLBACK", "DEACTIVATE_FALLBACK", "SET_QUALITY_TIER", "CAST_TECHNIQUE"]>;
        createdAt: z.ZodString;
        factionId: z.ZodOptional<z.ZodString>;
        viewerId: z.ZodOptional<z.ZodString>;
        displayName: z.ZodOptional<z.ZodString>;
        amount: z.ZodOptional<z.ZodNumber>;
        abilityId: z.ZodOptional<z.ZodString>;
        sourceEventIds: z.ZodArray<z.ZodString, "many">;
        expiresAt: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
    }, "strict", z.ZodTypeAny, {
        type: "JOIN_FACTION" | "SPAWN_CHAMPION" | "ADD_ENERGY" | "ADD_SHIELD" | "SPAWN_SQUAD" | "CAST_ABILITY" | "START_WORLD_EVENT" | "DISPLAY_SPOTLIGHT" | "PAUSE_EVENTS" | "END_ROUND" | "GIFT_APPLY" | "FOLLOW_GUARDIAN" | "SHARE_SHIELD" | "STRATEGY_VOTE" | "FREE_ENERGY_ABILITY" | "ADD_SCORE" | "SPAWN_VFX" | "SPOTLIGHT_CARD" | "SUPPORTER_CALLOUT" | "CAMERA_IMPULSE" | "PLAY_AUDIO" | "SET_WINDOW_MODE" | "ACTIVATE_FALLBACK" | "DEACTIVATE_FALLBACK" | "SET_QUALITY_TIER" | "CAST_TECHNIQUE";
        schemaVersion: 7;
        id: string;
        createdAt: string;
        sourceEventIds: string[];
        factionId?: string | undefined;
        viewerId?: string | undefined;
        displayName?: string | undefined;
        amount?: number | undefined;
        abilityId?: string | undefined;
        expiresAt?: string | undefined;
        metadata?: Record<string, string | number | boolean> | undefined;
    }, {
        type: "JOIN_FACTION" | "SPAWN_CHAMPION" | "ADD_ENERGY" | "ADD_SHIELD" | "SPAWN_SQUAD" | "CAST_ABILITY" | "START_WORLD_EVENT" | "DISPLAY_SPOTLIGHT" | "PAUSE_EVENTS" | "END_ROUND" | "GIFT_APPLY" | "FOLLOW_GUARDIAN" | "SHARE_SHIELD" | "STRATEGY_VOTE" | "FREE_ENERGY_ABILITY" | "ADD_SCORE" | "SPAWN_VFX" | "SPOTLIGHT_CARD" | "SUPPORTER_CALLOUT" | "CAMERA_IMPULSE" | "PLAY_AUDIO" | "SET_WINDOW_MODE" | "ACTIVATE_FALLBACK" | "DEACTIVATE_FALLBACK" | "SET_QUALITY_TIER" | "CAST_TECHNIQUE";
        schemaVersion: 7;
        id: string;
        createdAt: string;
        sourceEventIds: string[];
        factionId?: string | undefined;
        viewerId?: string | undefined;
        displayName?: string | undefined;
        amount?: number | undefined;
        abilityId?: string | undefined;
        expiresAt?: string | undefined;
        metadata?: Record<string, string | number | boolean> | undefined;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    type: "snapshot";
    protocolVersion: 1;
    sequenceNumber: number;
    commands: {
        type: "JOIN_FACTION" | "SPAWN_CHAMPION" | "ADD_ENERGY" | "ADD_SHIELD" | "SPAWN_SQUAD" | "CAST_ABILITY" | "START_WORLD_EVENT" | "DISPLAY_SPOTLIGHT" | "PAUSE_EVENTS" | "END_ROUND" | "GIFT_APPLY" | "FOLLOW_GUARDIAN" | "SHARE_SHIELD" | "STRATEGY_VOTE" | "FREE_ENERGY_ABILITY" | "ADD_SCORE" | "SPAWN_VFX" | "SPOTLIGHT_CARD" | "SUPPORTER_CALLOUT" | "CAMERA_IMPULSE" | "PLAY_AUDIO" | "SET_WINDOW_MODE" | "ACTIVATE_FALLBACK" | "DEACTIVATE_FALLBACK" | "SET_QUALITY_TIER" | "CAST_TECHNIQUE";
        schemaVersion: 7;
        id: string;
        createdAt: string;
        sourceEventIds: string[];
        factionId?: string | undefined;
        viewerId?: string | undefined;
        displayName?: string | undefined;
        amount?: number | undefined;
        abilityId?: string | undefined;
        expiresAt?: string | undefined;
        metadata?: Record<string, string | number | boolean> | undefined;
    }[];
}, {
    type: "snapshot";
    protocolVersion: 1;
    sequenceNumber: number;
    commands: {
        type: "JOIN_FACTION" | "SPAWN_CHAMPION" | "ADD_ENERGY" | "ADD_SHIELD" | "SPAWN_SQUAD" | "CAST_ABILITY" | "START_WORLD_EVENT" | "DISPLAY_SPOTLIGHT" | "PAUSE_EVENTS" | "END_ROUND" | "GIFT_APPLY" | "FOLLOW_GUARDIAN" | "SHARE_SHIELD" | "STRATEGY_VOTE" | "FREE_ENERGY_ABILITY" | "ADD_SCORE" | "SPAWN_VFX" | "SPOTLIGHT_CARD" | "SUPPORTER_CALLOUT" | "CAMERA_IMPULSE" | "PLAY_AUDIO" | "SET_WINDOW_MODE" | "ACTIVATE_FALLBACK" | "DEACTIVATE_FALLBACK" | "SET_QUALITY_TIER" | "CAST_TECHNIQUE";
        schemaVersion: 7;
        id: string;
        createdAt: string;
        sourceEventIds: string[];
        factionId?: string | undefined;
        viewerId?: string | undefined;
        displayName?: string | undefined;
        amount?: number | undefined;
        abilityId?: string | undefined;
        expiresAt?: string | undefined;
        metadata?: Record<string, string | number | boolean> | undefined;
    }[];
}>, z.ZodObject<{
    type: z.ZodLiteral<"error">;
    protocolVersion: z.ZodLiteral<1>;
    code: z.ZodString;
    message: z.ZodString;
    details: z.ZodOptional<z.ZodUnknown>;
}, "strict", z.ZodTypeAny, {
    code: string;
    message: string;
    type: "error";
    protocolVersion: 1;
    details?: unknown;
}, {
    code: string;
    message: string;
    type: "error";
    protocolVersion: 1;
    details?: unknown;
}>, z.ZodObject<{
    type: z.ZodLiteral<"reconnect">;
    protocolVersion: z.ZodLiteral<1>;
    clientId: z.ZodString;
    lastReceivedSequenceNumber: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    type: "reconnect";
    protocolVersion: 1;
    clientId: string;
    lastReceivedSequenceNumber: number;
}, {
    type: "reconnect";
    protocolVersion: 1;
    clientId: string;
    lastReceivedSequenceNumber: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"disconnect">;
    protocolVersion: z.ZodLiteral<1>;
    reason: z.ZodString;
}, "strict", z.ZodTypeAny, {
    type: "disconnect";
    reason: string;
    protocolVersion: 1;
}, {
    type: "disconnect";
    reason: string;
    protocolVersion: 1;
}>]>;
export type WsHandshake = z.infer<typeof WsHandshakeSchema>;
export type WsHandshakeAck = z.infer<typeof WsHandshakeAckSchema>;
export type WsHeartbeatPing = z.infer<typeof WsHeartbeatPingSchema>;
export type WsHeartbeatPong = z.infer<typeof WsHeartbeatPongSchema>;
export type WsCommand = z.infer<typeof WsCommandSchema>;
export type WsCommandAck = z.infer<typeof WsCommandAckSchema>;
export type WsSnapshot = z.infer<typeof WsSnapshotSchema>;
export type WsError = z.infer<typeof WsErrorSchema>;
export type WsReconnect = z.infer<typeof WsReconnectSchema>;
export type WsDisconnect = z.infer<typeof WsDisconnectSchema>;
export type WsMessage = z.infer<typeof WsMessageSchema>;
