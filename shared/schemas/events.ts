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

/** Viewer identity as it exists for the duration of a session. */
export const LiveUserSchema = z
  .object({
    id: z.string().min(1),
    handle: z.string().min(1),
    displayName: z.string().min(1),
  })
  .strict();

/**
 * Gift payload, present on `gift` events. `repeatCount` is a positive integer; a streak is grouped by
 * `streakId` so repeated frames are counted once.
 */
export const LiveGiftSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    repeatCount: z.number().int().positive(),
    streakId: z.string().min(1).optional(),
    streakEnded: z.boolean().optional(),
    providerValue: z.number().nonnegative().optional(),
  })
  .strict();

/**
 * The only event shape that crosses the adapter boundary. Provider vocabulary never travels further
 * than the adapter that produced it. `rawHash` allows dedupe and log correlation without storing the
 * raw provider payload.
 */
export const NormalizedLiveEventSchema = z
  .object({
    id: z.string().min(1),
    provider: z.string().min(1),
    type: LiveEventTypeSchema,
    receivedAt: z.string().datetime(),
    user: LiveUserSchema,
    comment: z.string().optional(),
    likeCount: z.number().int().nonnegative().optional(),
    gift: LiveGiftSchema.optional(),
    rawHash: z.string().min(1),
  })
  .strict();

export type LiveEventType = z.infer<typeof LiveEventTypeSchema>;
export type LiveUser = z.infer<typeof LiveUserSchema>;
export type LiveGift = z.infer<typeof LiveGiftSchema>;
export type NormalizedLiveEvent = z.infer<typeof NormalizedLiveEventSchema>;

/** All event types as a plain array, useful for exhaustive tests and mock generators. */
export const LIVE_EVENT_TYPES: readonly LiveEventType[] = LiveEventTypeSchema.options;
