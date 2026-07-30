import { z } from 'zod';

/**
 * Version of the game-command contract. Bump this whenever a field is renamed, retyped, or removed,
 * or when an enum member changes. Additive optional fields do not require a bump.
 */
export const COMMAND_SCHEMA_VERSION = 1;

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

/** All command types as a plain array, useful for exhaustive tests and dashboard test buttons. */
export const GAME_COMMAND_TYPES: readonly GameCommandType[] = GameCommandTypeSchema.options;
