/**
 * ChampionSpawner — emits SPAWN_CHAMPION GameCommands for viewers who join
 * a faction, once per viewer per round.
 *
 * Dedup semantics: keyed on viewerId, not factionId. A viewer who switches
 * factions mid-lobby does NOT get a second champion spawn in the same round.
 */
import { createHash } from 'node:crypto';
import { COMMAND_SCHEMA_VERSION } from '@riftcrowd/shared';
// ---------------------------------------------------------------------------
// ChampionSpawner class
// ---------------------------------------------------------------------------
export class ChampionSpawner {
    spawned = new Set();
    spawnCounter = 0;
    /**
     * Attempts to spawn a champion for the given viewer.
     * Returns a SPAWN_CHAMPION GameCommand if this is the viewer's first join
     * this round; returns null if already spawned.
     *
     * @param viewerId — unique viewer identifier.
     * @param displayName — sanitized display name for the champion unit.
     * @param factionId — the faction the viewer joined.
     * @param eventId — the source event id (for traceability).
     */
    spawnIfNew(viewerId, displayName, factionId, eventId) {
        if (this.spawned.has(viewerId)) {
            return null;
        }
        this.spawned.add(viewerId);
        this.spawnCounter++;
        // Deterministic short id: sha1 hash prefix (40 hex chars) + counter suffix.
        // Fits within the 128-char GameCommandSchema.id bound regardless of input lengths.
        const hashInput = `${viewerId}:${this.spawnCounter}`;
        const shortHash = createHash('sha1').update(hashInput).digest('hex');
        const cmd = {
            schemaVersion: COMMAND_SCHEMA_VERSION,
            id: `champ_${shortHash}`,
            type: 'SPAWN_CHAMPION',
            createdAt: new Date().toISOString(),
            factionId,
            viewerId,
            displayName,
            sourceEventIds: [eventId],
        };
        return cmd;
    }
    /**
     * Clears the per-round spawned set. Called on round reset
     * (RESULTS → MODE_VOTE transition).
     */
    resetRound() {
        this.spawned.clear();
        this.spawnCounter = 0;
    }
    /** Number of champions spawned this round. */
    get spawnedCount() {
        return this.spawned.size;
    }
    /** Whether a viewer has already been spawned this round. */
    hasSpawned(viewerId) {
        return this.spawned.has(viewerId);
    }
}
