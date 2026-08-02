import { z } from 'zod';
/**
 * Version of the normalized live-event contract. Bump this whenever a field is renamed, retyped, or
 * removed, or when an enum member changes. Additive optional fields do not require a bump.
 */
export const EVENT_SCHEMA_VERSION = 1;
/** Every event kind a provider adapter may emit. No other value is accepted downstream. */
export const LiveEventTypeSchema = z.enum([
    'chat',
    'like',
    'follow',
    'share',
    'gift',
    'subscribe',
    'join',
    'provider_status',
]);
/**
 * Viewer identity as it exists for the duration of a session. Provider data is untrusted, so every
 * string carries an upper bound; anything longer is rejected, not truncated.
 */
export const LiveUserSchema = z
    .object({
    id: z.string().min(1).max(128),
    handle: z.string().min(1).max(128),
    displayName: z.string().min(1).max(64),
})
    .strict();
/**
 * Gift payload, present on `gift` events. `repeatCount` is a positive integer; a streak is grouped by
 * `streakId` so repeated frames are counted once.
 */
export const LiveGiftSchema = z
    .object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(128),
    repeatCount: z.number().int().min(1).max(100_000),
    streakId: z.string().min(1).max(128).optional(),
    streakEnded: z.boolean().optional(),
    providerValue: z.number().nonnegative().finite().optional(),
})
    .strict();
/**
 * The only event shape that crosses the adapter boundary. Provider vocabulary never travels further
 * than the adapter that produced it. `rawHash` allows dedupe and log correlation without storing the
 * raw provider payload.
 */
export const NormalizedLiveEventSchema = z
    .object({
    schemaVersion: z.literal(EVENT_SCHEMA_VERSION),
    id: z.string().min(1).max(128),
    provider: z.string().min(1).max(128),
    type: LiveEventTypeSchema,
    receivedAt: z.string().datetime(),
    user: LiveUserSchema,
    comment: z.string().max(500).optional(),
    likeCount: z.number().int().min(0).max(1_000_000).optional(),
    gift: LiveGiftSchema.optional(),
    rawHash: z.string().min(1).max(128),
})
    .strict();
/** All event types as a plain array, useful for exhaustive tests and mock generators. */
export const LIVE_EVENT_TYPES = LiveEventTypeSchema.options;
