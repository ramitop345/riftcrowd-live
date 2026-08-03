import { z } from 'zod';
/**
 * Version of the WebSocket envelope protocol between the gateway and the Godot client. Bump this
 * whenever a message kind, field name, or field type changes. Payload models carry their own schema
 * versions; this constant covers only the envelope.
 */
export declare const PROTOCOL_VERSION = 1;
/** Typed, non-fatal reasons the gateway or game rejects a frame. */
export declare const ProtocolErrorCodeSchema: z.ZodEnum<["INVALID_MESSAGE", "UNSUPPORTED_VERSION", "UNAUTHORIZED", "QUEUE_FULL", "INTERNAL"]>;
/** Envelope carrying one normalized live event (gateway -> observers such as the dashboard). */
export declare const EventMessageSchema: z.ZodObject<{
    protocolVersion: z.ZodLiteral<1>;
    kind: z.ZodLiteral<"event">;
    event: z.ZodObject<{
        schemaVersion: z.ZodLiteral<1>;
        id: z.ZodString;
        provider: z.ZodString;
        type: z.ZodEnum<["chat", "like", "follow", "share", "gift", "subscribe", "join", "provider_status"]>;
        receivedAt: z.ZodString;
        user: z.ZodObject<{
            id: z.ZodString;
            handle: z.ZodString;
            displayName: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            id: string;
            displayName: string;
            handle: string;
        }, {
            id: string;
            displayName: string;
            handle: string;
        }>;
        comment: z.ZodOptional<z.ZodString>;
        likeCount: z.ZodOptional<z.ZodNumber>;
        gift: z.ZodOptional<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            repeatCount: z.ZodNumber;
            streakId: z.ZodOptional<z.ZodString>;
            streakEnded: z.ZodOptional<z.ZodBoolean>;
            providerValue: z.ZodOptional<z.ZodNumber>;
        }, "strict", z.ZodTypeAny, {
            id: string;
            name: string;
            repeatCount: number;
            streakId?: string | undefined;
            streakEnded?: boolean | undefined;
            providerValue?: number | undefined;
        }, {
            id: string;
            name: string;
            repeatCount: number;
            streakId?: string | undefined;
            streakEnded?: boolean | undefined;
            providerValue?: number | undefined;
        }>>;
        rawHash: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        type: "join" | "chat" | "like" | "follow" | "share" | "gift" | "subscribe" | "provider_status";
        schemaVersion: 1;
        id: string;
        provider: string;
        receivedAt: string;
        user: {
            id: string;
            displayName: string;
            handle: string;
        };
        rawHash: string;
        gift?: {
            id: string;
            name: string;
            repeatCount: number;
            streakId?: string | undefined;
            streakEnded?: boolean | undefined;
            providerValue?: number | undefined;
        } | undefined;
        comment?: string | undefined;
        likeCount?: number | undefined;
    }, {
        type: "join" | "chat" | "like" | "follow" | "share" | "gift" | "subscribe" | "provider_status";
        schemaVersion: 1;
        id: string;
        provider: string;
        receivedAt: string;
        user: {
            id: string;
            displayName: string;
            handle: string;
        };
        rawHash: string;
        gift?: {
            id: string;
            name: string;
            repeatCount: number;
            streakId?: string | undefined;
            streakEnded?: boolean | undefined;
            providerValue?: number | undefined;
        } | undefined;
        comment?: string | undefined;
        likeCount?: number | undefined;
    }>;
}, "strict", z.ZodTypeAny, {
    event: {
        type: "join" | "chat" | "like" | "follow" | "share" | "gift" | "subscribe" | "provider_status";
        schemaVersion: 1;
        id: string;
        provider: string;
        receivedAt: string;
        user: {
            id: string;
            displayName: string;
            handle: string;
        };
        rawHash: string;
        gift?: {
            id: string;
            name: string;
            repeatCount: number;
            streakId?: string | undefined;
            streakEnded?: boolean | undefined;
            providerValue?: number | undefined;
        } | undefined;
        comment?: string | undefined;
        likeCount?: number | undefined;
    };
    protocolVersion: 1;
    kind: "event";
}, {
    event: {
        type: "join" | "chat" | "like" | "follow" | "share" | "gift" | "subscribe" | "provider_status";
        schemaVersion: 1;
        id: string;
        provider: string;
        receivedAt: string;
        user: {
            id: string;
            displayName: string;
            handle: string;
        };
        rawHash: string;
        gift?: {
            id: string;
            name: string;
            repeatCount: number;
            streakId?: string | undefined;
            streakEnded?: boolean | undefined;
            providerValue?: number | undefined;
        } | undefined;
        comment?: string | undefined;
        likeCount?: number | undefined;
    };
    protocolVersion: 1;
    kind: "event";
}>;
/** Envelope carrying one game command (gateway -> game). */
export declare const CommandMessageSchema: z.ZodObject<{
    protocolVersion: z.ZodLiteral<1>;
    kind: z.ZodLiteral<"command">;
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
}, "strict", z.ZodTypeAny, {
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
    kind: "command";
}, {
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
    kind: "command";
}>;
/** The game acknowledges a command id so the gateway can drop it from the retry buffer. */
export declare const AckMessageSchema: z.ZodObject<{
    protocolVersion: z.ZodLiteral<1>;
    kind: z.ZodLiteral<"ack">;
    commandId: z.ZodString;
    receivedAt: z.ZodString;
}, "strict", z.ZodTypeAny, {
    receivedAt: string;
    protocolVersion: 1;
    kind: "ack";
    commandId: string;
}, {
    receivedAt: string;
    protocolVersion: 1;
    kind: "ack";
    commandId: string;
}>;
/** Typed, non-fatal rejection of a frame, including validation failures. Never carries secrets. */
export declare const ErrorMessageSchema: z.ZodObject<{
    protocolVersion: z.ZodLiteral<1>;
    kind: z.ZodLiteral<"error">;
    code: z.ZodEnum<["INVALID_MESSAGE", "UNSUPPORTED_VERSION", "UNAUTHORIZED", "QUEUE_FULL", "INTERNAL"]>;
    message: z.ZodString;
    relatedId: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    code: "INVALID_MESSAGE" | "UNSUPPORTED_VERSION" | "UNAUTHORIZED" | "QUEUE_FULL" | "INTERNAL";
    message: string;
    protocolVersion: 1;
    kind: "error";
    relatedId?: string | undefined;
}, {
    code: "INVALID_MESSAGE" | "UNSUPPORTED_VERSION" | "UNAUTHORIZED" | "QUEUE_FULL" | "INTERNAL";
    message: string;
    protocolVersion: 1;
    kind: "error";
    relatedId?: string | undefined;
}>;
/**
 * Full game-state resync after a reconnect. The `state` payload is intentionally loose here; its
 * structure is firmed up in Phase 10 alongside the WebSocket integration.
 */
export declare const SnapshotMessageSchema: z.ZodObject<{
    protocolVersion: z.ZodLiteral<1>;
    kind: z.ZodLiteral<"snapshot">;
    sentAt: z.ZodString;
    state: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strict", z.ZodTypeAny, {
    protocolVersion: 1;
    kind: "snapshot";
    sentAt: string;
    state: Record<string, unknown>;
}, {
    protocolVersion: 1;
    kind: "snapshot";
    sentAt: string;
    state: Record<string, unknown>;
}>;
/** Periodic liveness signal. A missed heartbeat triggers reconnect-with-backoff on either side. */
export declare const HeartbeatMessageSchema: z.ZodObject<{
    protocolVersion: z.ZodLiteral<1>;
    kind: z.ZodLiteral<"heartbeat">;
    sentAt: z.ZodString;
    sequence: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    protocolVersion: 1;
    kind: "heartbeat";
    sentAt: string;
    sequence: number;
}, {
    protocolVersion: 1;
    kind: "heartbeat";
    sentAt: string;
    sequence: number;
}>;
/** Every frame that may cross the gateway/game WebSocket, discriminated by `kind`. */
export declare const ProtocolMessageSchema: z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
    protocolVersion: z.ZodLiteral<1>;
    kind: z.ZodLiteral<"event">;
    event: z.ZodObject<{
        schemaVersion: z.ZodLiteral<1>;
        id: z.ZodString;
        provider: z.ZodString;
        type: z.ZodEnum<["chat", "like", "follow", "share", "gift", "subscribe", "join", "provider_status"]>;
        receivedAt: z.ZodString;
        user: z.ZodObject<{
            id: z.ZodString;
            handle: z.ZodString;
            displayName: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            id: string;
            displayName: string;
            handle: string;
        }, {
            id: string;
            displayName: string;
            handle: string;
        }>;
        comment: z.ZodOptional<z.ZodString>;
        likeCount: z.ZodOptional<z.ZodNumber>;
        gift: z.ZodOptional<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            repeatCount: z.ZodNumber;
            streakId: z.ZodOptional<z.ZodString>;
            streakEnded: z.ZodOptional<z.ZodBoolean>;
            providerValue: z.ZodOptional<z.ZodNumber>;
        }, "strict", z.ZodTypeAny, {
            id: string;
            name: string;
            repeatCount: number;
            streakId?: string | undefined;
            streakEnded?: boolean | undefined;
            providerValue?: number | undefined;
        }, {
            id: string;
            name: string;
            repeatCount: number;
            streakId?: string | undefined;
            streakEnded?: boolean | undefined;
            providerValue?: number | undefined;
        }>>;
        rawHash: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        type: "join" | "chat" | "like" | "follow" | "share" | "gift" | "subscribe" | "provider_status";
        schemaVersion: 1;
        id: string;
        provider: string;
        receivedAt: string;
        user: {
            id: string;
            displayName: string;
            handle: string;
        };
        rawHash: string;
        gift?: {
            id: string;
            name: string;
            repeatCount: number;
            streakId?: string | undefined;
            streakEnded?: boolean | undefined;
            providerValue?: number | undefined;
        } | undefined;
        comment?: string | undefined;
        likeCount?: number | undefined;
    }, {
        type: "join" | "chat" | "like" | "follow" | "share" | "gift" | "subscribe" | "provider_status";
        schemaVersion: 1;
        id: string;
        provider: string;
        receivedAt: string;
        user: {
            id: string;
            displayName: string;
            handle: string;
        };
        rawHash: string;
        gift?: {
            id: string;
            name: string;
            repeatCount: number;
            streakId?: string | undefined;
            streakEnded?: boolean | undefined;
            providerValue?: number | undefined;
        } | undefined;
        comment?: string | undefined;
        likeCount?: number | undefined;
    }>;
}, "strict", z.ZodTypeAny, {
    event: {
        type: "join" | "chat" | "like" | "follow" | "share" | "gift" | "subscribe" | "provider_status";
        schemaVersion: 1;
        id: string;
        provider: string;
        receivedAt: string;
        user: {
            id: string;
            displayName: string;
            handle: string;
        };
        rawHash: string;
        gift?: {
            id: string;
            name: string;
            repeatCount: number;
            streakId?: string | undefined;
            streakEnded?: boolean | undefined;
            providerValue?: number | undefined;
        } | undefined;
        comment?: string | undefined;
        likeCount?: number | undefined;
    };
    protocolVersion: 1;
    kind: "event";
}, {
    event: {
        type: "join" | "chat" | "like" | "follow" | "share" | "gift" | "subscribe" | "provider_status";
        schemaVersion: 1;
        id: string;
        provider: string;
        receivedAt: string;
        user: {
            id: string;
            displayName: string;
            handle: string;
        };
        rawHash: string;
        gift?: {
            id: string;
            name: string;
            repeatCount: number;
            streakId?: string | undefined;
            streakEnded?: boolean | undefined;
            providerValue?: number | undefined;
        } | undefined;
        comment?: string | undefined;
        likeCount?: number | undefined;
    };
    protocolVersion: 1;
    kind: "event";
}>, z.ZodObject<{
    protocolVersion: z.ZodLiteral<1>;
    kind: z.ZodLiteral<"command">;
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
}, "strict", z.ZodTypeAny, {
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
    kind: "command";
}, {
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
    kind: "command";
}>, z.ZodObject<{
    protocolVersion: z.ZodLiteral<1>;
    kind: z.ZodLiteral<"ack">;
    commandId: z.ZodString;
    receivedAt: z.ZodString;
}, "strict", z.ZodTypeAny, {
    receivedAt: string;
    protocolVersion: 1;
    kind: "ack";
    commandId: string;
}, {
    receivedAt: string;
    protocolVersion: 1;
    kind: "ack";
    commandId: string;
}>, z.ZodObject<{
    protocolVersion: z.ZodLiteral<1>;
    kind: z.ZodLiteral<"error">;
    code: z.ZodEnum<["INVALID_MESSAGE", "UNSUPPORTED_VERSION", "UNAUTHORIZED", "QUEUE_FULL", "INTERNAL"]>;
    message: z.ZodString;
    relatedId: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    code: "INVALID_MESSAGE" | "UNSUPPORTED_VERSION" | "UNAUTHORIZED" | "QUEUE_FULL" | "INTERNAL";
    message: string;
    protocolVersion: 1;
    kind: "error";
    relatedId?: string | undefined;
}, {
    code: "INVALID_MESSAGE" | "UNSUPPORTED_VERSION" | "UNAUTHORIZED" | "QUEUE_FULL" | "INTERNAL";
    message: string;
    protocolVersion: 1;
    kind: "error";
    relatedId?: string | undefined;
}>, z.ZodObject<{
    protocolVersion: z.ZodLiteral<1>;
    kind: z.ZodLiteral<"snapshot">;
    sentAt: z.ZodString;
    state: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strict", z.ZodTypeAny, {
    protocolVersion: 1;
    kind: "snapshot";
    sentAt: string;
    state: Record<string, unknown>;
}, {
    protocolVersion: 1;
    kind: "snapshot";
    sentAt: string;
    state: Record<string, unknown>;
}>, z.ZodObject<{
    protocolVersion: z.ZodLiteral<1>;
    kind: z.ZodLiteral<"heartbeat">;
    sentAt: z.ZodString;
    sequence: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    protocolVersion: 1;
    kind: "heartbeat";
    sentAt: string;
    sequence: number;
}, {
    protocolVersion: 1;
    kind: "heartbeat";
    sentAt: string;
    sequence: number;
}>]>;
export type ProtocolErrorCode = z.infer<typeof ProtocolErrorCodeSchema>;
export type EventMessage = z.infer<typeof EventMessageSchema>;
export type CommandMessage = z.infer<typeof CommandMessageSchema>;
export type AckMessage = z.infer<typeof AckMessageSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
export type SnapshotMessage = z.infer<typeof SnapshotMessageSchema>;
export type HeartbeatMessage = z.infer<typeof HeartbeatMessageSchema>;
export type ProtocolMessage = z.infer<typeof ProtocolMessageSchema>;
