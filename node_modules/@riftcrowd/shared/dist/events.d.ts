import { z } from 'zod';
/**
 * Version of the normalized live-event contract. Bump this whenever a field is renamed, retyped, or
 * removed, or when an enum member changes. Additive optional fields do not require a bump.
 */
export declare const EVENT_SCHEMA_VERSION = 1;
/** Every event kind a provider adapter may emit. No other value is accepted downstream. */
export declare const LiveEventTypeSchema: z.ZodEnum<["chat", "like", "follow", "share", "gift", "subscribe", "join", "provider_status"]>;
/**
 * Viewer identity as it exists for the duration of a session. Provider data is untrusted, so every
 * string carries an upper bound; anything longer is rejected, not truncated.
 */
export declare const LiveUserSchema: z.ZodObject<{
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
/**
 * Gift payload, present on `gift` events. `repeatCount` is a positive integer; a streak is grouped by
 * `streakId` so repeated frames are counted once.
 */
export declare const LiveGiftSchema: z.ZodObject<{
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
}>;
/**
 * The only event shape that crosses the adapter boundary. Provider vocabulary never travels further
 * than the adapter that produced it. `rawHash` allows dedupe and log correlation without storing the
 * raw provider payload.
 */
export declare const NormalizedLiveEventSchema: z.ZodObject<{
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
export type LiveEventType = z.infer<typeof LiveEventTypeSchema>;
export type LiveUser = z.infer<typeof LiveUserSchema>;
export type LiveGift = z.infer<typeof LiveGiftSchema>;
export type NormalizedLiveEvent = z.infer<typeof NormalizedLiveEventSchema>;
/** All event types as a plain array, useful for exhaustive tests and mock generators. */
export declare const LIVE_EVENT_TYPES: readonly LiveEventType[];
