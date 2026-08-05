/**
 * Phase 11 — Gift Economy Configuration Schema.
 *
 * Validates gateway/config/gifts.json: tiers, mappings, cooldowns, overflow, streaks, bounds.
 * All values have sensible defaults; missing required sections are rejected.
 */
import { z } from 'zod';
// ---------------------------------------------------------------------------
// Impact type enum
// ---------------------------------------------------------------------------
export const GiftImpactTypeSchema = z.enum([
    'spawn_champion',
    'add_energy',
    'add_shield',
    'spawn_squad',
    'cast_ability',
    'start_world_event',
    'display_spotlight',
    'trigger_technique',
]);
// ---------------------------------------------------------------------------
// Tier impact
// ---------------------------------------------------------------------------
export const TierImpactSchema = z
    .object({
    type: GiftImpactTypeSchema,
    magnitude: z.number().finite().min(0),
    duration: z.number().int().positive().optional(),
    cinematic: z.boolean().optional(),
})
    .strict();
// ---------------------------------------------------------------------------
// Secondary technique impact (gift tiers trigger faction techniques alongside
// the primary impact)
// ---------------------------------------------------------------------------
export const TechniqueImpactSchema = z
    .object({
    type: z.literal('trigger_technique'),
    /** Technique tier performed by the faction: 1 (minor), 2 (average), 3 (major), 4 (lion, reserved). */
    magnitude: z.number().int().min(1).max(4),
    cinematic: z.boolean().optional(),
})
    .strict();
// ---------------------------------------------------------------------------
// Tier
// ---------------------------------------------------------------------------
export const GiftTierSchema = z
    .object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(64),
    minValue: z.number().int().min(0),
    maxValue: z.number().int().min(0),
    impact: TierImpactSchema,
    technique: TechniqueImpactSchema.optional(),
})
    .strict();
// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------
export const GiftMappingSchema = z
    .object({
    giftId: z.string().min(1).max(128),
    tierId: z.string().min(1).max(64),
    displayName: z.string().min(1).max(128).optional(),
})
    .strict();
// ---------------------------------------------------------------------------
// Cooldowns
// ---------------------------------------------------------------------------
export const GiftCooldownsSchema = z
    .object({
    perUserMs: z.number().int().min(0),
    perFactionMs: z.number().int().min(0),
    abilityMs: z.number().int().min(0),
    cinematicMs: z.number().int().min(0),
    globalMs: z.number().int().min(0),
})
    .strict();
// ---------------------------------------------------------------------------
// Overflow
// ---------------------------------------------------------------------------
export const GiftOverflowSchema = z
    .object({
    type: z.enum(['reserve_energy', 'reserve_score']),
    conversionRate: z.number().finite().min(0),
})
    .strict();
// ---------------------------------------------------------------------------
// Streaks
// ---------------------------------------------------------------------------
export const GiftStreaksSchema = z
    .object({
    windowMs: z.number().int().positive(),
    minCount: z.number().int().min(2),
    multiplier: z.number().finite().min(1),
})
    .strict();
// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------
export const GiftBoundsSchema = z
    .object({
    maxActiveChampionsPerFaction: z.number().int().min(1),
    maxActiveSquadsPerFaction: z.number().int().min(1),
    maxActiveWorldEvents: z.number().int().min(1),
    maxQueueSize: z.number().int().min(1),
})
    .strict();
// ---------------------------------------------------------------------------
// Full config
// ---------------------------------------------------------------------------
export const GiftEconomyConfigSchema = z
    .object({
    tiers: z.array(GiftTierSchema).min(1),
    mappings: z.array(GiftMappingSchema).min(1),
    cooldowns: GiftCooldownsSchema,
    overflow: GiftOverflowSchema,
    streaks: GiftStreaksSchema,
    bounds: GiftBoundsSchema,
})
    .strict()
    .superRefine((cfg, ctx) => {
    const tierIds = new Set(cfg.tiers.map((t) => t.id));
    cfg.mappings.forEach((m, i) => {
        if (!tierIds.has(m.tierId)) {
            ctx.addIssue({
                code: 'custom',
                path: ['mappings', i, 'tierId'],
                message: `Unknown tier: ${m.tierId}`,
            });
        }
    });
});
