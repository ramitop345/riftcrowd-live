import { z } from 'zod';

/**
 * Version of the game-command contract. Bump this whenever a field is renamed, retyped, or removed,
 * or when an enum member changes. Additive optional fields do not require a bump.
 *
 * Phase 17/Tier 4: bumped to 6 — added FRAME_REPORT (Godot → gateway) and
 * SET_QUALITY_TIER (gateway → Godot) command types for 4-tier VFX quality ladder.
 */
export const COMMAND_SCHEMA_VERSION = 6;

/** The complete command vocabulary the Godot client understands. */
export const GameCommandTypeSchema = z.enum([
  'JOIN_FACTION',
  'SPAWN_CHAMPION',
  'ADD_ENERGY',
  'ADD_SHIELD',
  'SPAWN_SQUAD',
  'CAST_ABILITY',
  'START_WORLD_EVENT',
  'DISPLAY_SPOTLIGHT',
  'PAUSE_EVENTS',
  'END_ROUND',
  'GIFT_APPLY',
  'FOLLOW_GUARDIAN',
  'SHARE_SHIELD',
  'STRATEGY_VOTE',
  'FREE_ENERGY_ABILITY',
  'ADD_SCORE',
  // Phase 15 — VFX, audio, readability
  'SPAWN_VFX',
  'SPOTLIGHT_CARD',
  'SUPPORTER_CALLOUT',
  'CAMERA_IMPULSE',
  'PLAY_AUDIO',
  // Phase 16 — streaming workflow
  'SET_WINDOW_MODE',
  'ACTIVATE_FALLBACK',
  'DEACTIVATE_FALLBACK',
  // Phase 17/Tier 4 — VFX quality ladder
  'SET_QUALITY_TIER',
]);

/** Flat primitives only: no nested objects, no arrays, no functions. Keys and strings are bounded. */
export const GameCommandMetadataSchema = z.record(
  z.string().min(1).max(128),
  z.union([z.string().max(500), z.number().finite(), z.boolean()]),
);

/**
 * The only shape the game consumes. `sourceEventIds` traces which normalized events produced this
 * command, so merged commands can still credit every contributing viewer.
 */
export const GameCommandSchema = z
  .object({
    schemaVersion: z.literal(COMMAND_SCHEMA_VERSION),
    id: z.string().min(1).max(128),
    type: GameCommandTypeSchema,
    createdAt: z.string().datetime(),
    factionId: z.string().min(1).max(128).optional(),
    viewerId: z.string().min(1).max(128).optional(),
    displayName: z.string().min(1).max(64).optional(),
    amount: z.number().finite().optional(),
    abilityId: z.string().min(1).max(128).optional(),
    sourceEventIds: z.array(z.string().min(1).max(128)).max(1000),
    expiresAt: z.string().datetime().optional(),
    metadata: GameCommandMetadataSchema.optional(),
  })
  .strict();

export type GameCommandType = z.infer<typeof GameCommandTypeSchema>;
export type GameCommandMetadata = z.infer<typeof GameCommandMetadataSchema>;
export type GameCommand = z.infer<typeof GameCommandSchema>;

// ---------------------------------------------------------------------------
// Tier 4 — FRAME_REPORT (Godot → gateway) and SET_QUALITY_TIER schemas
// ---------------------------------------------------------------------------

/** Frame performance report sent from Godot to gateway every ~1 second. */
export const FrameReportSchema = z
  .object({
    type: z.literal('FRAME_REPORT'),
    avgFrameMs: z.number().finite().min(0),
    p95FrameMs: z.number().finite().min(0),
  })
  .strict();

export type FrameReport = z.infer<typeof FrameReportSchema>;

/** Quality tier command sent from gateway to Godot when auto-stepping. */
export const SetQualityTierSchema = z
  .object({
    schemaVersion: z.literal(COMMAND_SCHEMA_VERSION),
    type: z.literal('SET_QUALITY_TIER'),
    tier: z.enum(['low', 'medium', 'high', 'ultra']),
    reason: z.string().max(256).optional(),
  })
  .strict();

export type SetQualityTier = z.infer<typeof SetQualityTierSchema>;

/** All command types as a plain array, useful for exhaustive tests and dashboard test buttons. */
export const GAME_COMMAND_TYPES: readonly GameCommandType[] = GameCommandTypeSchema.options;
