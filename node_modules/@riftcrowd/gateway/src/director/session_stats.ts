/**
 * SessionStats — persistent round statistics for the Match Director.
 *
 * File: gateway/data/session-stats.json (runtime state, gitignored).
 * Writes are atomic (write to .tmp then rename) to prevent corruption.
 * On any read/write error, logs a warning and continues with defaults.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema (versioned, schemaVersion 1)
// ---------------------------------------------------------------------------

export const SessionStatsSchema = z.object({
  schemaVersion: z.literal(1),
  roundsPlayed: z.number().int().min(0),
  modeCounts: z.record(z.string(), z.number().int().min(0)),
  factionWinCounts: z.record(z.string(), z.number().int().min(0)),
  recentModes: z.array(z.string()).max(10),
  lastSavedAt: z.string(),
}).strict();

export type SessionStats = z.infer<typeof SessionStatsSchema>;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Returns a fresh default SessionStats object. */
export function defaultStats(): SessionStats {
  return {
    schemaVersion: 1,
    roundsPlayed: 0,
    modeCounts: {},
    factionWinCounts: {},
    recentModes: [],
    lastSavedAt: new Date(0).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/**
 * Reads and validates session stats from disk.
 * Returns default stats on ENOENT, parse error, or schema failure.
 * Logs a warning for non-ENOENT errors.
 */
export function loadStats(filePath: string): SessionStats {
  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const result = SessionStatsSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    console.warn(`[SessionStats] schema validation failed for ${filePath}, using defaults`);
    return defaultStats();
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return defaultStats();
    }
    console.warn(`[SessionStats] failed to load ${filePath}: ${String(err)}`);
    return defaultStats();
  }
}

// ---------------------------------------------------------------------------
// Save (atomic: write to .tmp then rename)
// ---------------------------------------------------------------------------

/**
 * Atomically writes session stats to disk.
 * Creates parent directories if needed. Non-fatal on error (logs and continues).
 */
export function saveStats(filePath: string, stats: SessionStats): void {
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${filePath}.tmp`;
    const payload = JSON.stringify(stats, null, 2);
    writeFileSync(tmpPath, payload, 'utf8');
    renameSync(tmpPath, filePath);
  } catch (err: unknown) {
    console.warn(`[SessionStats] failed to save ${filePath}: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Pure update: recordRound
// ---------------------------------------------------------------------------

/**
 * Returns new stats with the given round recorded.
 * Pure function — does not mutate the input.
 */
export function recordRound(
  stats: SessionStats,
  modeId: string,
  winningFactionId: string,
): SessionStats {
  const modeCounts = { ...stats.modeCounts };
  modeCounts[modeId] = (modeCounts[modeId] ?? 0) + 1;

  const factionWinCounts = { ...stats.factionWinCounts };
  factionWinCounts[winningFactionId] = (factionWinCounts[winningFactionId] ?? 0) + 1;

  const recentModes = [modeId, ...stats.recentModes].slice(0, 10);

  return {
    schemaVersion: 1,
    roundsPlayed: stats.roundsPlayed + 1,
    modeCounts,
    factionWinCounts,
    recentModes,
    lastSavedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface NodeError extends Error {
  code?: string;
}

function isNodeError(err: unknown): err is NodeError {
  return err instanceof Error && 'code' in err;
}
