/**
 * Phase 15 — VFX Configuration Schema.
 *
 * Validates gateway/config/vfx.json: pool limits, quality level, frame-rate budget,
 * motion reduction, color-blind mode, safe-zone bounds.
 */

import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Pool limits
// ---------------------------------------------------------------------------

export const VFXPoolLimitsSchema = z
  .object({
    maxParticles: z.number().int().min(0),
    maxFlashes: z.number().int().min(0),
    maxTrails: z.number().int().min(0),
    maxOverlays: z.number().int().min(0),
  })
  .strict();

export type VFXPoolLimits = z.infer<typeof VFXPoolLimitsSchema>;

// ---------------------------------------------------------------------------
// Quality level
// ---------------------------------------------------------------------------

export const VFXQualitySchema = z.enum(['low', 'medium', 'high', 'ultra']);
export type VFXQuality = z.infer<typeof VFXQualitySchema>;

// ---------------------------------------------------------------------------
// Safe zone
// ---------------------------------------------------------------------------

export const VFXSafeZoneSchema = z
  .object({
    topPx: z.number().int().min(0),
    bottomPx: z.number().int().min(0),
    leftPx: z.number().int().min(0),
    rightPx: z.number().int().min(0),
  })
  .strict();

export type VFXSafeZone = z.infer<typeof VFXSafeZoneSchema>;

// ---------------------------------------------------------------------------
// Per-tier multiplier table
// ---------------------------------------------------------------------------

const TierMultiplierSchema = z
  .object({
    particleMultiplier: z.number().positive(),
    flashMultiplier: z.number().positive(),
    trailMultiplier: z.number().positive(),
    overlayMultiplier: z.number().positive(),
  })
  .strict();

export type TierMultiplier = z.infer<typeof TierMultiplierSchema>;

export const QualityTiersSchema = z
  .object({
    ultra: TierMultiplierSchema,
    high: TierMultiplierSchema,
    medium: TierMultiplierSchema,
    low: TierMultiplierSchema,
  })
  .strict();

export type QualityTiers = z.infer<typeof QualityTiersSchema>;

// ---------------------------------------------------------------------------
// Full VFX config
// ---------------------------------------------------------------------------

export const VFXConfigSchema = z
  .object({
    pool: VFXPoolLimitsSchema,
    quality: VFXQualitySchema,
    frameRateBudget: z.number().int().positive().default(60),
    motionReduction: z.boolean().default(false),
    colorBlindMode: z.boolean().default(false),
    safeZone: VFXSafeZoneSchema,
    qualityTiers: QualityTiersSchema.optional(),
  })
  .strict();

export type VFXConfig = z.infer<typeof VFXConfigSchema>;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default per-tier multiplier tables. */
export const QUALITY_TIER_DEFAULTS: QualityTiers = {
  ultra: { particleMultiplier: 1.5, flashMultiplier: 1.5, trailMultiplier: 1.5, overlayMultiplier: 1.5 },
  high: { particleMultiplier: 1.0, flashMultiplier: 1.0, trailMultiplier: 1.0, overlayMultiplier: 1.0 },
  medium: { particleMultiplier: 0.5, flashMultiplier: 0.5, trailMultiplier: 0.5, overlayMultiplier: 0.5 },
  low: { particleMultiplier: 0.25, flashMultiplier: 0.25, trailMultiplier: 0.25, overlayMultiplier: 0.25 },
};

export const VFX_DEFAULTS: VFXConfig = {
  pool: {
    maxParticles: 100,
    maxFlashes: 20,
    maxTrails: 50,
    maxOverlays: 30,
  },
  quality: 'high',
  frameRateBudget: 60,
  motionReduction: false,
  colorBlindMode: false,
  safeZone: {
    topPx: 80,
    bottomPx: 120,
    leftPx: 20,
    rightPx: 20,
  },
  qualityTiers: QUALITY_TIER_DEFAULTS,
};

// ---------------------------------------------------------------------------
// Load from file
// ---------------------------------------------------------------------------

export function loadVFXConfig(configPath?: string): VFXConfig {
  const resolvedPath =
    configPath ??
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', 'vfx.json');
  try {
    const raw = readFileSync(resolvedPath, 'utf8');
    const parsed = VFXConfigSchema.parse(JSON.parse(raw));
    // Inject default qualityTiers if not present in JSON
    if (!parsed.qualityTiers) {
      parsed.qualityTiers = QUALITY_TIER_DEFAULTS;
    }
    return parsed;
  } catch {
    return { ...VFX_DEFAULTS };
  }
}
