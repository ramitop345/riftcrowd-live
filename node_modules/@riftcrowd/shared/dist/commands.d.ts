import { z } from 'zod';
/**
 * Version of the game-command contract. Bump this whenever a field is renamed, retyped, or removed,
 * or when an enum member changes. Additive optional fields do not require a bump.
 *
 * Phase 17/Tier 4: bumped to 6 — added FRAME_REPORT (Godot → gateway) and
 * SET_QUALITY_TIER (gateway → Godot) command types for 4-tier VFX quality ladder.
 */
export declare const COMMAND_SCHEMA_VERSION = 6;
/** The complete command vocabulary the Godot client understands. */
export declare const GameCommandTypeSchema: z.ZodEnum<["JOIN_FACTION", "SPAWN_CHAMPION", "ADD_ENERGY", "ADD_SHIELD", "SPAWN_SQUAD", "CAST_ABILITY", "START_WORLD_EVENT", "DISPLAY_SPOTLIGHT", "PAUSE_EVENTS", "END_ROUND", "GIFT_APPLY", "FOLLOW_GUARDIAN", "SHARE_SHIELD", "STRATEGY_VOTE", "FREE_ENERGY_ABILITY", "ADD_SCORE", "SPAWN_VFX", "SPOTLIGHT_CARD", "SUPPORTER_CALLOUT", "CAMERA_IMPULSE", "PLAY_AUDIO", "SET_WINDOW_MODE", "ACTIVATE_FALLBACK", "DEACTIVATE_FALLBACK", "SET_QUALITY_TIER"]>;
/** Flat primitives only: no nested objects, no arrays, no functions. Keys and strings are bounded. */
export declare const GameCommandMetadataSchema: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
/**
 * The only shape the game consumes. `sourceEventIds` traces which normalized events produced this
 * command, so merged commands can still credit every contributing viewer.
 */
export declare const GameCommandSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<6>;
    id: z.ZodString;
    type: z.ZodEnum<["JOIN_FACTION", "SPAWN_CHAMPION", "ADD_ENERGY", "ADD_SHIELD", "SPAWN_SQUAD", "CAST_ABILITY", "START_WORLD_EVENT", "DISPLAY_SPOTLIGHT", "PAUSE_EVENTS", "END_ROUND", "GIFT_APPLY", "FOLLOW_GUARDIAN", "SHARE_SHIELD", "STRATEGY_VOTE", "FREE_ENERGY_ABILITY", "ADD_SCORE", "SPAWN_VFX", "SPOTLIGHT_CARD", "SUPPORTER_CALLOUT", "CAMERA_IMPULSE", "PLAY_AUDIO", "SET_WINDOW_MODE", "ACTIVATE_FALLBACK", "DEACTIVATE_FALLBACK", "SET_QUALITY_TIER"]>;
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
    type: "JOIN_FACTION" | "SPAWN_CHAMPION" | "ADD_ENERGY" | "ADD_SHIELD" | "SPAWN_SQUAD" | "CAST_ABILITY" | "START_WORLD_EVENT" | "DISPLAY_SPOTLIGHT" | "PAUSE_EVENTS" | "END_ROUND" | "GIFT_APPLY" | "FOLLOW_GUARDIAN" | "SHARE_SHIELD" | "STRATEGY_VOTE" | "FREE_ENERGY_ABILITY" | "ADD_SCORE" | "SPAWN_VFX" | "SPOTLIGHT_CARD" | "SUPPORTER_CALLOUT" | "CAMERA_IMPULSE" | "PLAY_AUDIO" | "SET_WINDOW_MODE" | "ACTIVATE_FALLBACK" | "DEACTIVATE_FALLBACK" | "SET_QUALITY_TIER";
    schemaVersion: 6;
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
    type: "JOIN_FACTION" | "SPAWN_CHAMPION" | "ADD_ENERGY" | "ADD_SHIELD" | "SPAWN_SQUAD" | "CAST_ABILITY" | "START_WORLD_EVENT" | "DISPLAY_SPOTLIGHT" | "PAUSE_EVENTS" | "END_ROUND" | "GIFT_APPLY" | "FOLLOW_GUARDIAN" | "SHARE_SHIELD" | "STRATEGY_VOTE" | "FREE_ENERGY_ABILITY" | "ADD_SCORE" | "SPAWN_VFX" | "SPOTLIGHT_CARD" | "SUPPORTER_CALLOUT" | "CAMERA_IMPULSE" | "PLAY_AUDIO" | "SET_WINDOW_MODE" | "ACTIVATE_FALLBACK" | "DEACTIVATE_FALLBACK" | "SET_QUALITY_TIER";
    schemaVersion: 6;
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
export type GameCommandType = z.infer<typeof GameCommandTypeSchema>;
export type GameCommandMetadata = z.infer<typeof GameCommandMetadataSchema>;
export type GameCommand = z.infer<typeof GameCommandSchema>;
/** Frame performance report sent from Godot to gateway every ~1 second. */
export declare const FrameReportSchema: z.ZodObject<{
    type: z.ZodLiteral<"FRAME_REPORT">;
    avgFrameMs: z.ZodNumber;
    p95FrameMs: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    type: "FRAME_REPORT";
    avgFrameMs: number;
    p95FrameMs: number;
}, {
    type: "FRAME_REPORT";
    avgFrameMs: number;
    p95FrameMs: number;
}>;
export type FrameReport = z.infer<typeof FrameReportSchema>;
/** Quality tier command sent from gateway to Godot when auto-stepping. */
export declare const SetQualityTierSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<6>;
    type: z.ZodLiteral<"SET_QUALITY_TIER">;
    tier: z.ZodEnum<["low", "medium", "high", "ultra"]>;
    reason: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    type: "SET_QUALITY_TIER";
    schemaVersion: 6;
    tier: "low" | "medium" | "high" | "ultra";
    reason?: string | undefined;
}, {
    type: "SET_QUALITY_TIER";
    schemaVersion: 6;
    tier: "low" | "medium" | "high" | "ultra";
    reason?: string | undefined;
}>;
export type SetQualityTier = z.infer<typeof SetQualityTierSchema>;
/** All command types as a plain array, useful for exhaustive tests and dashboard test buttons. */
export declare const GAME_COMMAND_TYPES: readonly GameCommandType[];
