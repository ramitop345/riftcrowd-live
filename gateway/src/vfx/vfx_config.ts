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
  })
  .strict();

export type VFXConfig = z.infer<typeof VFXConfigSchema>;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

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
    return VFXConfigSchema.parse(JSON.parse(raw));
  } catch {
    return { ...VFX_DEFAULTS };
  }
}
