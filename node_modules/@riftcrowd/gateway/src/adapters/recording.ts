/**
 * Recording — captures a live session (events + commands + director states)
 * and persists it to disk as a JSON file validated with Zod.
 *
 * RecordedSession schema (schemaVersion: 1):
 *   recordedAt, events, commands, directorSnapshots
 *
 * save(path) uses atomic write (tmp + rename) per Phase 6 precedent.
 * load(path) reads and Zod-validates; throws with clear error on malformed files.
 */

import { z } from 'zod';
import { writeFileSync, readFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { NormalizedLiveEvent, GameCommand } from '@riftcrowd/shared';
import { NormalizedLiveEventSchema, GameCommandSchema } from '@riftcrowd/shared';
import type { ScheduledEvent } from './scenarios.js';

// ---------------------------------------------------------------------------
// RecordedSession Zod schema
// ---------------------------------------------------------------------------

export const ScheduledEventSchema = z.object({
  timeMs: z.number().int().min(0),
  event: NormalizedLiveEventSchema,
}).strict();

export const DirectorSnapshotSchema = z.object({
  state: z.string(),
  timerSeconds: z.number().optional(),
  currentMode: z.string().nullable().optional(),
  timestamp: z.number().optional(),
}).strict();

export const RecordedSessionSchema = z.object({
  schemaVersion: z.literal(1),
  recordedAt: z.string().datetime(),
  events: z.array(ScheduledEventSchema),
  commands: z.array(GameCommandSchema),
  directorSnapshots: z.array(DirectorSnapshotSchema),
}).strict();

export type DirectorSnapshot = z.infer<typeof DirectorSnapshotSchema>;
export type RecordedSession = z.infer<typeof RecordedSessionSchema>;

// ---------------------------------------------------------------------------
// SessionBuilder — incrementally builds a RecordedSession
// ---------------------------------------------------------------------------

export class SessionBuilder {
  private events: ScheduledEvent[] = [];
  private commands: GameCommand[] = [];
  private directorSnapshots: DirectorSnapshot[] = [];
  private readonly recordedAt: string;

  constructor() {
    this.recordedAt = new Date().toISOString();
  }

  addEvent(timeMs: number, event: NormalizedLiveEvent): void {
    this.events.push({ timeMs, event });
  }

  addCommand(command: GameCommand): void {
    this.commands.push(command);
  }

  addDirectorSnapshot(snapshot: DirectorSnapshot): void {
    this.directorSnapshots.push(snapshot);
  }

  build(): RecordedSession {
    return {
      schemaVersion: 1,
      recordedAt: this.recordedAt,
      events: [...this.events],
      commands: [...this.commands],
      directorSnapshots: [...this.directorSnapshots],
    };
  }
}

// ---------------------------------------------------------------------------
// Save / Load
// ---------------------------------------------------------------------------

/**
 * Saves a RecordedSession to disk atomically (write to tmp, then rename).
 * Creates parent directories if they don't exist.
 */
export function saveSession(session: RecordedSession, path: string): void {
  // Validate before saving
  RecordedSessionSchema.parse(session);

  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Atomic write: write to a temp file in the same dir, then rename
  const tmpName = `.session_${randomBytes(8).toString('hex')}.tmp`;
  const tmpPath = join(dir, tmpName);

  try {
    writeFileSync(tmpPath, JSON.stringify(session, null, 2), 'utf8');
    renameSync(tmpPath, path);
  } catch (err) {
    // Clean up temp file on failure
    try {
      if (existsSync(tmpPath)) {
        unlinkSync(tmpPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw err;
  }
}

/**
 * Loads and validates a RecordedSession from disk.
 * Throws with a clear error if the file is missing, unparseable, or invalid.
 */
export function loadSession(path: string): RecordedSession {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err: unknown) {
    throw new Error(`Failed to read session file: ${path} — ${String(err)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    throw new Error(`Failed to parse session JSON: ${path} — ${String(err)}`);
  }

  const result = RecordedSessionSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid session schema: ${path} — ${issues}`);
  }

  return result.data;
}
