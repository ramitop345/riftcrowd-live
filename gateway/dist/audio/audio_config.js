/**
 * Phase 15 — Audio Configuration Schema.
 *
 * Validates gateway/config/audio.json: volume groups, tracks, SFX paths.
 */
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// ---------------------------------------------------------------------------
// Volume groups
// ---------------------------------------------------------------------------
export const AudioVolumeGroupsSchema = z
    .object({
    master: z.number().int().min(0).max(100),
    music: z.number().int().min(0).max(100),
    sfx: z.number().int().min(0).max(100),
    ui: z.number().int().min(0).max(100),
})
    .strict();
// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------
export const AudioTracksSchema = z
    .object({
    backgroundMusic: z.string().min(1).max(512),
    battleMusic: z.string().min(1).max(512),
    resultsMusic: z.string().min(1).max(512),
})
    .strict();
// ---------------------------------------------------------------------------
// SFX
// ---------------------------------------------------------------------------
export const AudioSFXSchema = z
    .object({
    hit: z.string().min(1).max(512),
    follow: z.string().min(1).max(512),
    share: z.string().min(1).max(512),
    gift: z.string().min(1).max(512),
    ability: z.string().min(1).max(512),
    spotlight: z.string().min(1).max(512),
})
    .strict();
// ---------------------------------------------------------------------------
// Full audio config
// ---------------------------------------------------------------------------
export const AudioConfigSchema = z
    .object({
    volumeGroups: AudioVolumeGroupsSchema,
    tracks: AudioTracksSchema,
    sfx: AudioSFXSchema,
})
    .strict();
// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
export const AUDIO_DEFAULTS = {
    volumeGroups: {
        master: 80,
        music: 60,
        sfx: 90,
        ui: 70,
    },
    tracks: {
        backgroundMusic: 'audio/music/background.ogg',
        battleMusic: 'audio/music/battle.ogg',
        resultsMusic: 'audio/music/results.ogg',
    },
    sfx: {
        hit: 'audio/sfx/hit.ogg',
        follow: 'audio/sfx/follow.ogg',
        share: 'audio/sfx/share.ogg',
        gift: 'audio/sfx/gift.ogg',
        ability: 'audio/sfx/ability.ogg',
        spotlight: 'audio/sfx/spotlight.ogg',
    },
};
// ---------------------------------------------------------------------------
// Load from file
// ---------------------------------------------------------------------------
export function loadAudioConfig(configPath) {
    const resolvedPath = configPath ??
        join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', 'audio.json');
    try {
        const raw = readFileSync(resolvedPath, 'utf8');
        return AudioConfigSchema.parse(JSON.parse(raw));
    }
    catch {
        return { ...AUDIO_DEFAULTS };
    }
}
