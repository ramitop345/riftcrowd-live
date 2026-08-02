/**
 * Phase 18 — Configuration migration and backup.
 *
 * Loads config from gateway/config/*.json, creates backups, validates against
 * Zod schemas, and migrates old schema versions to new ones with defaults.
 * Idempotent: running twice produces the same result.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
// ---------------------------------------------------------------------------
// Schema definitions for each config file
// ---------------------------------------------------------------------------
/** Window config schema (window.json). */
const WindowConfigSchema = z.object({
    mode: z.enum(['windowed', 'fullscreen', 'borderless']).default('windowed'),
    portrait: z.boolean().default(true),
    width: z.number().int().positive().default(1080),
    height: z.number().int().positive().default(1920),
    vsync: z.boolean().default(true),
    fps: z.number().int().positive().default(60),
}).strict();
/** VFX config schema (vfx.json). */
const VFXConfigSchema = z.object({
    pool: z.object({
        maxParticles: z.number().int().positive().default(100),
        maxFlashes: z.number().int().positive().default(20),
        maxTrails: z.number().int().positive().default(50),
        maxOverlays: z.number().int().positive().default(30),
    }).default({}),
    quality: z.enum(['low', 'medium', 'high', 'ultra']).default('high'),
    frameRateBudget: z.number().int().positive().default(60),
    motionReduction: z.boolean().default(false),
    colorBlindMode: z.boolean().default(false),
    safeZone: z.object({
        topPx: z.number().int().min(0).default(80),
        bottomPx: z.number().int().min(0).default(120),
        leftPx: z.number().int().min(0).default(20),
        rightPx: z.number().int().min(0).default(20),
    }).default({}),
}).strict();
/** Audio config schema (audio.json). */
const AudioConfigSchema = z.object({
    volumeGroups: z.object({
        master: z.number().int().min(0).max(100).default(80),
        music: z.number().int().min(0).max(100).default(60),
        sfx: z.number().int().min(0).max(100).default(90),
        ui: z.number().int().min(0).max(100).default(70),
    }).default({}),
    tracks: z.object({
        backgroundMusic: z.string().default('audio/music/background.ogg'),
        battleMusic: z.string().default('audio/music/battle.ogg'),
        resultsMusic: z.string().default('audio/music/results.ogg'),
    }).default({}),
    sfx: z.object({
        hit: z.string().default('audio/sfx/hit.ogg'),
        follow: z.string().default('audio/sfx/follow.ogg'),
        share: z.string().default('audio/sfx/share.ogg'),
        gift: z.string().default('audio/sfx/gift.ogg'),
        ability: z.string().default('audio/sfx/ability.ogg'),
        spotlight: z.string().default('audio/sfx/spotlight.ogg'),
    }).default({}),
}).strict();
/** Readability config schema (readability.json). */
const ReadabilityConfigSchema = z.object({
    colorBlindMode: z.boolean().default(false),
    motionReduction: z.boolean().default(false),
    safeZone: z.object({
        topPx: z.number().int().min(0).default(80),
        bottomPx: z.number().int().min(0).default(120),
        leftPx: z.number().int().min(0).default(20),
        rightPx: z.number().int().min(0).default(20),
    }).default({}),
    fontSize: z.enum(['small', 'medium', 'large']).default('medium'),
    contrastBoost: z.boolean().default(false),
}).strict();
/** TikFinity config schema (tikfinity.json) - optional file. */
const TikfinityConfigSchema = z.object({
    url: z.string().default('ws://127.0.0.1:23184/ws'),
    token: z.string().optional(),
    reconnectMs: z.number().int().positive().default(5000),
    heartbeatMs: z.number().int().positive().default(30000),
}).strict();
const CONFIG_FILES = [
    { name: 'window.json', schema: WindowConfigSchema, required: true },
    { name: 'vfx.json', schema: VFXConfigSchema, required: true },
    { name: 'audio.json', schema: AudioConfigSchema, required: true },
    { name: 'readability.json', schema: ReadabilityConfigSchema, required: true },
    { name: 'tikfinity.json', schema: TikfinityConfigSchema, required: false },
];
// ---------------------------------------------------------------------------
// Migration logic
// ---------------------------------------------------------------------------
/**
 * Resolves the gateway config directory path.
 * In production: relative to the launcher executable.
 * In development: relative to the workspace root.
 */
function resolveConfigDir() {
    // Try relative to launcher dist (production release)
    const launcherDist = dirname(fileURLToPath(import.meta.url));
    const releaseConfigDir = join(launcherDist, '..', '..', 'gateway', 'config');
    if (existsSync(releaseConfigDir))
        return releaseConfigDir;
    // Try relative to workspace root (development)
    const workspaceRoot = join(launcherDist, '..', '..', '..');
    const devConfigDir = join(workspaceRoot, 'gateway', 'config');
    if (existsSync(devConfigDir))
        return devConfigDir;
    // Fallback: current working directory
    return join(process.cwd(), 'gateway', 'config');
}
/**
 * Creates a timestamped backup of a config file.
 * Returns the backup path or null if the file doesn't exist.
 */
function createBackup(configDir, fileName, timestamp) {
    const srcPath = join(configDir, fileName);
    if (!existsSync(srcPath))
        return null;
    const backupName = `${basename(fileName, '.json')}.json.bak.${timestamp}`;
    const backupPath = join(configDir, backupName);
    copyFileSync(srcPath, backupPath);
    return backupPath;
}
/**
 * Migrates a single config file:
 * 1. Read existing config
 * 2. Parse JSON
 * 3. Validate against schema
 * 4. Only if validation passes, create backup of the original file
 * 5. Write migrated config (with defaults filled in)
 * If validation fails at step 3, do not create backup — leave file untouched.
 */
function migrateConfigFile(configDir, def, timestamp) {
    const configPath = join(configDir, def.name);
    // Skip if file doesn't exist and is not required
    if (!existsSync(configPath)) {
        if (def.required) {
            return { migrated: false, skipped: false, error: `${def.name} not found (required)`, backupPath: null };
        }
        return { migrated: false, skipped: true, error: null, backupPath: null };
    }
    let raw = '';
    try {
        // Step 1: Read existing config
        raw = readFileSync(configPath, 'utf8');
        // Step 2: Parse JSON
        const parsed = JSON.parse(raw);
        // Step 3: Validate and migrate (fill defaults)
        const result = def.schema.safeParse(parsed);
        if (!result.success) {
            // Validation failed: do NOT create backup, leave file untouched
            const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
            // Write a .invalid sidecar for manual review
            const invalidPath = configPath + '.invalid';
            try {
                writeFileSync(invalidPath, raw, 'utf8');
            }
            catch {
                // Sidecar write failure is non-fatal
            }
            return { migrated: false, skipped: false, error: `${def.name} validation failed (file left untouched, .invalid sidecar created): ${errors}`, backupPath: null };
        }
        // Step 4: Only create backup AFTER validation passes
        const backupPath = createBackup(configDir, def.name, timestamp);
        // Step 5: Write migrated config (with defaults applied)
        const migrated = JSON.stringify(result.data, null, 2);
        writeFileSync(configPath, migrated + '\n', 'utf8');
        return { migrated: true, skipped: false, error: null, backupPath };
    }
    catch (err) {
        // Parse error or other failure: do NOT create backup, leave file untouched
        // Write a .invalid sidecar for manual review (mirrors schema validation path)
        const invalidPath = configPath + '.invalid';
        try {
            const sidecarContent = raw;
            writeFileSync(invalidPath, JSON.stringify({
                error: String(err),
                originalContent: sidecarContent.slice(0, 1000),
                timestamp: new Date().toISOString(),
            }, null, 2) + '\n', 'utf8');
        }
        catch {
            // Sidecar write failure is non-fatal
        }
        return { migrated: false, skipped: false, error: `${def.name} error (file left untouched, .invalid sidecar created): ${String(err)}`, backupPath: null };
    }
}
/**
 * Runs the full configuration migration across all config files.
 * Idempotent: running multiple times produces the same result.
 */
export function runConfigMigration(configDir) {
    const resolvedDir = configDir ?? resolveConfigDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const result = {
        migrated: [],
        skipped: [],
        errors: [],
        backups: [],
    };
    if (!existsSync(resolvedDir)) {
        result.errors.push(`Config directory not found: ${resolvedDir}`);
        return result;
    }
    for (const def of CONFIG_FILES) {
        const outcome = migrateConfigFile(resolvedDir, def, timestamp);
        if (outcome.backupPath) {
            result.backups.push(outcome.backupPath);
        }
        if (outcome.error) {
            result.errors.push(outcome.error);
        }
        else if (outcome.migrated) {
            result.migrated.push(def.name);
        }
        else if (outcome.skipped) {
            result.skipped.push(def.name);
        }
    }
    return result;
}
/**
 * Lists all backup files in the config directory.
 */
export function listBackups(configDir) {
    const resolvedDir = configDir ?? resolveConfigDir();
    if (!existsSync(resolvedDir))
        return [];
    return readdirSync(resolvedDir)
        .filter((f) => f.includes('.json.bak.'))
        .map((f) => join(resolvedDir, f));
}
