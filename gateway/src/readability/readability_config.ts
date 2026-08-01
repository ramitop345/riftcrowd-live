/**
 * Phase 15 — Readability Configuration Schema.
 *
 * Validates gateway/config/readability.json: color-blind mode, motion reduction,
 * safe zone, font size, contrast boost.
 */

import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Safe zone
// ---------------------------------------------------------------------------

export const ReadabilitySafeZoneSchema = z
  .object({
    topPx: z.number().int().min(0),
    bottomPx: z.number().int().min(0),
    leftPx: z.number().int().min(0),
    rightPx: z.number().int().min(0),
  })
  .strict();

export type ReadabilitySafeZone = z.infer<typeof ReadabilitySafeZoneSchema>;

// ---------------------------------------------------------------------------
// Font size
// ---------------------------------------------------------------------------

export const ReadabilityFontSizeSchema = z.enum(['small', 'medium', 'large']);
export type ReadabilityFontSize = z.infer<typeof ReadabilityFontSizeSchema>;

// ---------------------------------------------------------------------------
// Full readability config
// ---------------------------------------------------------------------------

export const ReadabilityConfigSchema = z
  .object({
    colorBlindMode: z.boolean().default(false),
    motionReduction: z.boolean().default(false),
    safeZone: ReadabilitySafeZoneSchema,
    fontSize: ReadabilityFontSizeSchema.default('medium'),
    contrastBoost: z.boolean().default(false),
  })
  .strict();

export type ReadabilityConfig = z.infer<typeof ReadabilityConfigSchema>;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const READABILITY_DEFAULTS: ReadabilityConfig = {
  colorBlindMode: false,
  motionReduction: false,
  safeZone: {
    topPx: 80,
    bottomPx: 120,
    leftPx: 20,
    rightPx: 20,
  },
  fontSize: 'medium',
  contrastBoost: false,
};

// ---------------------------------------------------------------------------
// Load from file
// ---------------------------------------------------------------------------

export function loadReadabilityConfig(configPath?: string): ReadabilityConfig {
  const resolvedPath =
    configPath ??
    join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      'config',
      'readability.json',
    );
  try {
    const raw = readFileSync(resolvedPath, 'utf8');
    return ReadabilityConfigSchema.parse(JSON.parse(raw));
  } catch {
    return { ...READABILITY_DEFAULTS };
  }
}
