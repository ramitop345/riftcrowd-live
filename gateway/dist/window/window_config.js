/**
 * Phase 16 — Window Mode Configuration.
 *
 * Validates gateway/config/window.json: display mode, portrait orientation,
 * resolution, vsync, and FPS cap. Supports hot-reload via reloadConfig().
 */
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
export const WindowConfigSchema = z
    .object({
    mode: z.enum(['windowed', 'borderless', 'fullscreen']),
    portrait: z.boolean().default(true),
    width: z.number().int().min(640).max(7680).default(1080),
    height: z.number().int().min(480).max(4320).default(1920),
    vsync: z.boolean().default(true),
    fps: z.number().int().min(15).max(240).default(60),
})
    .strict();
// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
export const WINDOW_DEFAULTS = {
    mode: 'windowed',
    portrait: true,
    width: 1080,
    height: 1920,
    vsync: true,
    fps: 60,
};
// ---------------------------------------------------------------------------
// Load from file
// ---------------------------------------------------------------------------
export function loadWindowConfig(configPath) {
    const resolvedPath = configPath ??
        join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', 'window.json');
    try {
        const raw = readFileSync(resolvedPath, 'utf8');
        return WindowConfigSchema.parse(JSON.parse(raw));
    }
    catch {
        return { ...WINDOW_DEFAULTS };
    }
}
// ---------------------------------------------------------------------------
// Hot-reload helper
// ---------------------------------------------------------------------------
/**
 * Reloads window config from disk. Returns the new config on success,
 * or null if the file is missing / invalid (in which case defaults are returned).
 */
export function reloadWindowConfig(configPath) {
    const resolvedPath = configPath ??
        join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', 'window.json');
    try {
        const raw = readFileSync(resolvedPath, 'utf8');
        const result = WindowConfigSchema.safeParse(JSON.parse(raw));
        if (result.success) {
            return { ok: true, config: result.data };
        }
        return {
            ok: false,
            errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        };
    }
    catch (err) {
        return { ok: false, errors: [String(err)] };
    }
}
