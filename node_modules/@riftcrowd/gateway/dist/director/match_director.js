/**
 * MatchDirector — orchestrates the round lifecycle for RiftCrowd LIVE.
 *
 * State machine: IDLE → MODE_VOTE → FACTION_LOBBY → BATTLE_OPENING →
 * BATTLE_CRISIS → BATTLE_FINAL_SURGE → BATTLE_SUDDEN_DEATH → BATTLE_ENDED →
 * RESULTS → MODE_VOTE (next round).
 *
 * Mode vote keywords (case-insensitive):
 *   1 / countries  → countries
 *   2 / animals    → animals
 *   3 / clubs      → fan_crews_original
 *   4 / cities     → cities
 *
 * Tie-breaking: highest vote count wins; tie → least-recently-played (LRU);
 * first round with no history → alphabetical mode id.
 */
import { CONTENT_PACK_MODES, matchJoinKeyword } from '@riftcrowd/shared';
import { MockSimulation } from './mock_simulation.js';
import { defaultStats, loadStats, recordRound, saveStats } from './session_stats.js';
import { ViewerRegistry } from '../viewer/viewer_registry.js';
import { CommandParser } from '../viewer/command_parser.js';
import { ChampionSpawner } from '../viewer/champion_spawner.js';
import { ContributionTracker } from '../viewer/contribution_tracker.js';
// ---------------------------------------------------------------------------
// Director state enum
// ---------------------------------------------------------------------------
export const DIRECTOR_STATES = [
    'IDLE',
    'MODE_VOTE',
    'FACTION_LOBBY',
    'BATTLE_OPENING',
    'BATTLE_CRISIS',
    'BATTLE_FINAL_SURGE',
    'BATTLE_SUDDEN_DEATH',
    'BATTLE_ENDED',
    'RESULTS',
];
/** Battle sub-states (states where MockSimulation ticks). */
const BATTLE_STATES = new Set([
    'BATTLE_OPENING',
    'BATTLE_CRISIS',
    'BATTLE_FINAL_SURGE',
    'BATTLE_SUDDEN_DEATH',
]);
/** Map from MockSimulation stage string to DirectorState. */
const STAGE_TO_STATE = {
    opening: 'BATTLE_OPENING',
    crisis: 'BATTLE_CRISIS',
    final_surge: 'BATTLE_FINAL_SURGE',
    sudden_death: 'BATTLE_SUDDEN_DEATH',
    ended: 'BATTLE_ENDED',
};
// ---------------------------------------------------------------------------
// Mode vote keyword mapping
// ---------------------------------------------------------------------------
const MODE_VOTE_KEYWORDS = {
    '1': 'countries',
    countries: 'countries',
    '2': 'animals',
    animals: 'animals',
    '3': 'fan_crews_original',
    clubs: 'fan_crews_original',
    '4': 'cities',
    cities: 'cities',
};
/** All valid mode IDs that can be voted on. */
const VOTEABLE_MODES = ['countries', 'animals', 'fan_crews_original', 'cities'];
// ---------------------------------------------------------------------------
// Mock faction data for faction lobby (when no pack is loaded, use synthetic factions)
// ---------------------------------------------------------------------------
/** Synthetic faction IDs used when no content pack is loaded. Exported for reuse in app.ts. */
export const SYNTHETIC_FACTIONS = ['faction_alpha', 'faction_beta'];
// ---------------------------------------------------------------------------
// MatchDirector class
// ---------------------------------------------------------------------------
export class MatchDirector {
    state = 'IDLE';
    currentMode = null;
    currentModeId = null;
    selectedFactions = new Map();
    mockSimulation = null;
    timerSeconds = 0;
    roundSeed;
    paused = false;
    stats;
    lastAnnouncement = null;
    // Phase 7: Viewer identity and participation services
    viewerRegistry;
    commandParser;
    championSpawner;
    contributionTracker;
    opts;
    voteMap = new Map();
    factionJoins = new Map();
    battleStageTicks = 0;
    lastSnapshot = null;
    restartCounter = 0;
    /** The current content pack for faction keyword matching. Set via setCurrentPack(). */
    currentPack = null;
    constructor(opts) {
        this.opts = opts;
        this.roundSeed = Date.now();
        this.stats = defaultStats();
        // Initialize viewer services with defaults or provided config
        const displayNameMax = opts.viewerConfig?.displayNameMaxLength ?? 64;
        const chatMax = opts.viewerConfig?.chatCommandMaxLength ?? 200;
        const contributionCap = opts.viewerConfig?.contributionCategoryCap ?? 1_000_000;
        const strategyKw = opts.viewerConfig?.strategyKeywords ?? ['focus', 'defend', 'push', 'retreat'];
        this.viewerRegistry = new ViewerRegistry(displayNameMax);
        this.commandParser = new CommandParser({
            chatCommandMaxLength: chatMax,
            strategyKeywords: strategyKw,
            syntheticFactionIds: SYNTHETIC_FACTIONS,
        });
        this.championSpawner = new ChampionSpawner();
        this.contributionTracker = new ContributionTracker(contributionCap);
    }
    /** Sets the current content pack for faction keyword matching in handleChatEvent. */
    setCurrentPack(pack) {
        this.currentPack = pack;
    }
    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------
    /** Loads stats from disk and transitions to MODE_VOTE. */
    start() {
        this.stats = loadStats(this.opts.sessionStatsPath);
        this.transitionTo('MODE_VOTE');
    }
    /**
     * Advances the director clock by deltaSeconds.
     * Decrements timer; when it hits 0, transitions to the next stage.
     * Also ticks MockSimulation during BATTLE_* states.
     */
    advanceTime(deltaSeconds) {
        if (this.paused || this.state === 'IDLE')
            return;
        this.timerSeconds = Math.max(0, this.timerSeconds - deltaSeconds);
        // During battle states, advance the mock sim
        if (BATTLE_STATES.has(this.state) && this.mockSimulation) {
            const ticksToRun = Math.max(1, Math.round(deltaSeconds * 20));
            for (let i = 0; i < ticksToRun; i++) {
                this.lastSnapshot = this.mockSimulation.tick();
                this.battleStageTicks++;
                // Check stage transitions from mock sim
                const simStage = this.mockSimulation.stage;
                const targetState = STAGE_TO_STATE[simStage];
                if (targetState && targetState !== this.state) {
                    if (targetState === 'BATTLE_ENDED') {
                        this.handleBattleEnded();
                    }
                    else {
                        this.transitionTo(targetState);
                    }
                    break;
                }
                if (this.mockSimulation.is_round_over()) {
                    this.handleBattleEnded();
                    break;
                }
            }
        }
        // Timer-based transitions
        if (this.timerSeconds <= 0) {
            this.handleTimerExpiry();
        }
    }
    // -------------------------------------------------------------------------
    // Mode voting
    // -------------------------------------------------------------------------
    /**
     * Records a viewer's mode vote. First vote per viewer wins; duplicates ignored.
     * Extracts the first token from rawComment and matches to mode keywords (case-insensitive).
     * @param rawComment — capped at 200 chars (matching shared lib's matchJoinKeyword cap).
     *   Excess characters are ignored, not truncated.
     */
    handleModeVote(viewerId, rawComment) {
        if (this.state !== 'MODE_VOTE')
            return;
        if (this.voteMap.has(viewerId))
            return;
        const capped = rawComment.slice(0, 200);
        const token = capped.trim().split(/\s+/)[0]?.toLowerCase();
        if (!token)
            return;
        const mode = MODE_VOTE_KEYWORDS[token];
        if (mode) {
            this.voteMap.set(viewerId, mode);
        }
    }
    // -------------------------------------------------------------------------
    // Faction joining
    // -------------------------------------------------------------------------
    /**
     * Records a viewer's faction join using a pre-resolved factionId.
     * Called from handleChatEvent where the CommandParser has already resolved the faction.
     * Allowed during FACTION_LOBBY and all battle states — viewers join
     * mid-battle by typing red/blue, which also unlocks their gift techniques.
     * One switch allowed; subsequent joins after the switch are ignored.
     */
    recordFactionJoin(viewerId, factionId) {
        if (this.state !== 'FACTION_LOBBY' && !BATTLE_STATES.has(this.state))
            return;
        // Phase 7: reject hidden viewers
        const profile = this.viewerRegistry.get(viewerId);
        if (profile?.isHidden)
            return;
        const existing = this.factionJoins.get(viewerId);
        if (!existing) {
            // First join
            this.factionJoins.set(viewerId, { factionId, switched: false });
            this.selectedFactions.set(viewerId, factionId);
            if (profile) {
                profile.factionId = factionId;
            }
        }
        else if (existing.factionId === factionId) {
            // Repeat join of the same team (every red/blue comment adds a new
            // character) — no bookkeeping change.
        }
        else if (!existing.switched) {
            // One switch allowed
            existing.factionId = factionId;
            existing.switched = true;
            this.selectedFactions.set(viewerId, factionId);
            if (profile) {
                profile.factionId = factionId;
                profile.switchCount++;
            }
        }
        // else: subsequent joins ignored
    }
    /**
     * Records a viewer's faction join using raw comment text.
     * Matches against SYNTHETIC_FACTIONS only (for backward-compat / direct API calls).
     * When called from handleChatEvent, prefer recordFactionJoin with the resolved factionId.
     * @param rawComment — capped at 200 chars (matching shared lib's matchJoinKeyword cap).
     *   Excess characters are ignored, not truncated.
     */
    handleFactionJoin(viewerId, rawComment) {
        if (this.state !== 'FACTION_LOBBY' && !BATTLE_STATES.has(this.state))
            return;
        // Phase 7: reject hidden viewers
        const profile = this.viewerRegistry.get(viewerId);
        if (profile?.isHidden)
            return;
        // Extract first token (case-insensitive keyword match, same rule as matchJoinKeyword)
        const capped = rawComment.slice(0, 200);
        const keyword = capped.trim().toLowerCase().split(/\s+/, 1)[0];
        if (!keyword)
            return;
        // Match keyword against synthetic factions (case-insensitive)
        const matchedFaction = SYNTHETIC_FACTIONS.find((f) => f.toLowerCase() === keyword.toLowerCase());
        // Also try to resolve via loaded content pack
        let resolvedFaction = matchedFaction;
        if (!resolvedFaction && this.currentPack) {
            resolvedFaction = matchJoinKeyword(this.currentPack, rawComment) ?? undefined;
        }
        if (!resolvedFaction)
            return;
        this.recordFactionJoin(viewerId, resolvedFaction);
    }
    // -------------------------------------------------------------------------
    // Phase 7: Chat event handling
    // -------------------------------------------------------------------------
    /**
     * Handles a normalized chat event from a viewer.
     *
     * 1. Gets or creates the viewer profile in the registry.
     * 2. Parses the command (mode vote / faction join / strategy / unrecognized).
     * 3. Dispatches to the appropriate handler.
     * 4. Records engagement contribution for any chat event.
     *
     * @param event — a NormalizedLiveEvent of type 'chat'.
     * @returns the parsed command (for testing/observability).
     */
    handleChatEvent(event) {
        // Get or create viewer profile (deduplication handled by registry)
        const profile = this.viewerRegistry.getOrCreate(event.user.id, event.user.handle, event.user.displayName);
        // Parse the command
        const cmd = this.commandParser.parse(event, this.currentPack);
        // Dispatch based on command kind
        switch (cmd.kind) {
            case 'mode_vote':
                this.handleModeVote(cmd.viewerId, event.comment ?? '');
                break;
            case 'join_faction': {
                // Use the already-resolved cmd.factionId (works for both synthetic and pack factions)
                this.recordFactionJoin(cmd.viewerId, cmd.factionId);
                // Attempt champion spawn (once per viewer per round)
                // Only spawn if the join was actually recorded (state == FACTION_LOBBY and not hidden)
                if (!profile.isHidden && this.selectedFactions.has(cmd.viewerId)) {
                    const spawnCmd = this.championSpawner.spawnIfNew(cmd.viewerId, profile.displayName, cmd.factionId, cmd.eventId);
                    if (spawnCmd) {
                        // In Phase 8+, this would be enqueued to the Godot sim
                        // For now, we just track that it was spawned
                    }
                }
                break;
            }
            case 'strategy':
                // Strategy commands are recorded but no-op until Phase 8+ mechanics
                break;
            case 'unrecognized':
                // No-op for unrecognized commands
                break;
        }
        // Record engagement contribution for any chat event
        this.contributionTracker.recordEngagement(event.user.id, 1);
        return cmd;
    }
    // -------------------------------------------------------------------------
    // Phase 7: Moderation
    // -------------------------------------------------------------------------
    /**
     * Hides a viewer (moderation). Hidden viewers cannot join factions.
     * @param viewerId — the viewer to hide.
     */
    hideViewer(viewerId) {
        this.viewerRegistry.hide(viewerId);
    }
    /**
     * Unhides a previously hidden viewer.
     * @param viewerId — the viewer to unhide.
     */
    unhideViewer(viewerId) {
        this.viewerRegistry.unhide(viewerId);
    }
    // -------------------------------------------------------------------------
    // Mock simulation ticking
    // -------------------------------------------------------------------------
    /**
     * Ticks the MockSimulation if in any BATTLE_* state.
     * Returns the latest snapshot or null.
     */
    advanceMockSimTick() {
        if (!BATTLE_STATES.has(this.state) || !this.mockSimulation)
            return null;
        this.lastSnapshot = this.mockSimulation.tick();
        this.battleStageTicks++;
        return this.lastSnapshot;
    }
    // -------------------------------------------------------------------------
    // Creator commands
    // -------------------------------------------------------------------------
    /**
     * Skip to the next stage immediately.
     * During BATTLE_* states, unconditionally advances to the next battle sub-stage
     * (and syncs the mock sim stage accordingly).
     * In BATTLE_ENDED state, skip is a no-op — the state transitions to RESULTS
     * automatically via the timer (which is 0), so skip is not meaningful here.
     */
    skipStage() {
        if (this.state === 'IDLE')
            return;
        // BATTLE_ENDED: no-op — auto-transitions to RESULTS via timer=0
        if (this.state === 'BATTLE_ENDED')
            return;
        // Battle sub-state skip: unconditionally advance to next sub-stage
        if (BATTLE_STATES.has(this.state)) {
            this.forceAdvanceBattleStage();
            return;
        }
        this.timerSeconds = 0;
        this.handleTimerExpiry();
    }
    /** Pause timers and mock sim. */
    pause() {
        this.paused = true;
    }
    /** Resume timers and mock sim. */
    resume() {
        this.paused = false;
    }
    /** Force RESULTS with current winner if any. */
    forceEnd() {
        if (this.state === 'IDLE' || this.state === 'RESULTS')
            return;
        this.handleBattleEnded();
    }
    /** Force MODE_VOTE with fresh seed. */
    restart() {
        this.restartCounter++;
        this.roundSeed = Date.now() + this.restartCounter * 1000003;
        this.voteMap.clear();
        this.factionJoins.clear();
        this.selectedFactions.clear();
        this.mockSimulation = null;
        this.lastSnapshot = null;
        this.battleStageTicks = 0;
        this.paused = false;
        // Phase 7: reset per-round viewer state
        this.championSpawner.resetRound();
        this.contributionTracker.resetRound();
        this.transitionTo('MODE_VOTE');
    }
    // -------------------------------------------------------------------------
    // State query
    // -------------------------------------------------------------------------
    /** Returns a snapshot of the director's current state. */
    get_state() {
        return {
            state: this.state,
            timerSeconds: this.timerSeconds,
            currentMode: this.currentMode,
            currentModeId: this.currentModeId,
            selectedFactions: new Map(this.selectedFactions),
            stats: { ...this.stats },
            lastAnnouncement: this.lastAnnouncement,
        };
    }
    // -------------------------------------------------------------------------
    // Private: timer expiry handler
    // -------------------------------------------------------------------------
    handleTimerExpiry() {
        switch (this.state) {
            case 'MODE_VOTE':
                this.resolveModeVote();
                this.transitionTo('FACTION_LOBBY');
                break;
            case 'FACTION_LOBBY':
                this.finalizeFactions();
                this.startBattle();
                this.transitionTo('BATTLE_OPENING');
                break;
            case 'BATTLE_OPENING':
            case 'BATTLE_CRISIS':
            case 'BATTLE_FINAL_SURGE':
            case 'BATTLE_SUDDEN_DEATH':
                // Battle stage transitions are driven by mock sim, not timer.
                // But if timer expires, force advance.
                this.forceAdvanceBattleStage();
                break;
            case 'BATTLE_ENDED':
                this.transitionTo('RESULTS');
                break;
            case 'RESULTS': {
                this.recordAndSaveRound();
                this.roundSeed = Date.now() + this.stats.roundsPlayed;
                // FIX 2: Capture faction participants BEFORE clearing
                const participants = [...this.factionJoins.keys()];
                this.voteMap.clear();
                this.factionJoins.clear();
                this.selectedFactions.clear();
                this.mockSimulation = null;
                this.lastSnapshot = null;
                this.battleStageTicks = 0;
                this.paused = false;
                // Phase 7: reset per-round viewer state (profiles persist across rounds)
                this.championSpawner.resetRound();
                this.contributionTracker.resetRound();
                // FIX 2: Increment roundsParticipated for captured participants
                for (const viewerId of participants) {
                    const p = this.viewerRegistry.get(viewerId);
                    if (p)
                        p.roundsParticipated++;
                }
                // FIX 4: Reset per-round profile fields (factionId, switchCount)
                for (const p of this.viewerRegistry.list()) {
                    p.factionId = undefined;
                    p.switchCount = 0;
                }
                this.transitionTo('MODE_VOTE');
                break;
            }
            default:
                break;
        }
    }
    // -------------------------------------------------------------------------
    // Private: mode vote resolution
    // -------------------------------------------------------------------------
    resolveModeVote() {
        // Tally votes
        const voteCounts = {};
        for (const mode of this.voteMap.values()) {
            voteCounts[mode] = (voteCounts[mode] ?? 0) + 1;
        }
        let winner;
        let tieBrokenBy = 'vote_count';
        if (Object.keys(voteCounts).length === 0) {
            // No votes → LRU / alphabetical fallback
            winner = this.pickLRUOrAlphabetical();
            tieBrokenBy = 'no_votes_lru';
        }
        else {
            // Find max vote count
            const maxVotes = Math.max(...Object.values(voteCounts));
            const tied = Object.entries(voteCounts)
                .filter(([, count]) => count === maxVotes)
                .map(([mode]) => mode);
            if (tied.length === 1) {
                winner = tied[0];
            }
            else {
                // Tie-breaking: LRU (mode with smallest index in recentModes, or not in recentModes at all)
                winner = this.breakTie(tied);
                tieBrokenBy = tied.length > 1 ? 'lru_tiebreak' : 'vote_count';
            }
        }
        this.currentMode = winner;
        this.currentModeId = winner;
        this.announce({
            kind: 'mode_selected',
            message: `Mode selected: ${winner}`,
            data: { modeId: winner, voteCounts, tieBrokenBy },
        });
    }
    /** Breaks a tie among modes using LRU then alphabetical fallback. */
    breakTie(modes) {
        const recent = this.stats.recentModes;
        // Score each mode: index in recentModes (lower = more recent = worse for LRU).
        // Modes NOT in recentModes get score = Infinity (least recently played = best).
        const scored = modes.map((mode) => {
            const idx = recent.indexOf(mode);
            return { mode, score: idx === -1 ? Number.MAX_SAFE_INTEGER : idx };
        });
        // Sort by score descending (least recently played first), then alphabetical
        scored.sort((a, b) => {
            if (b.score !== a.score)
                return b.score - a.score;
            return a.mode.localeCompare(b.mode);
        });
        return scored[0].mode;
    }
    /** Picks the least-recently-played mode, or alphabetical on no history. */
    pickLRUOrAlphabetical() {
        const recent = this.stats.recentModes;
        if (recent.length === 0) {
            // First round, no history → alphabetical
            return [...VOTEABLE_MODES].sort()[0];
        }
        // Find the voteable mode that appears latest (or not at all) in recentModes
        return this.breakTie(VOTEABLE_MODES);
    }
    // -------------------------------------------------------------------------
    // Private: faction finalization
    // -------------------------------------------------------------------------
    finalizeFactions() {
        // If no faction joins, create 2 empty factions with mock players
        if (this.factionJoins.size === 0) {
            this.selectedFactions.set('mock_viewer_1', SYNTHETIC_FACTIONS[0]);
            this.selectedFactions.set('mock_viewer_2', SYNTHETIC_FACTIONS[1]);
        }
    }
    // -------------------------------------------------------------------------
    // Private: battle start
    // -------------------------------------------------------------------------
    // TODO(Phase 8): replace MockSimulation with Godot SimWorld bridge via enqueue_command
    startBattle() {
        this.mockSimulation = new MockSimulation(this.roundSeed, this.opts.battleConfig);
        this.battleStageTicks = 0;
    }
    // -------------------------------------------------------------------------
    // Private: force advance battle stage (when timer expires but sim hasn't transitioned)
    // -------------------------------------------------------------------------
    /**
     * Force-advances to the next battle sub-stage regardless of mock sim state.
     * Syncs the mock sim's internal stage to match the director's new state.
     */
    forceAdvanceBattleStage() {
        const NEXT_BATTLE_STATE = {
            BATTLE_OPENING: 'BATTLE_CRISIS',
            BATTLE_CRISIS: 'BATTLE_FINAL_SURGE',
            BATTLE_FINAL_SURGE: 'BATTLE_SUDDEN_DEATH',
            BATTLE_SUDDEN_DEATH: 'BATTLE_ENDED',
        };
        const next = NEXT_BATTLE_STATE[this.state];
        if (!next)
            return;
        // Sync mock sim stage to match the new director state
        if (this.mockSimulation) {
            const STATE_TO_SIM_STAGE = {
                BATTLE_CRISIS: 'crisis',
                BATTLE_FINAL_SURGE: 'final_surge',
                BATTLE_SUDDEN_DEATH: 'sudden_death',
                BATTLE_ENDED: 'ended',
            };
            const simStage = STATE_TO_SIM_STAGE[next];
            if (simStage) {
                this.mockSimulation.forceStage(simStage);
            }
        }
        if (next === 'BATTLE_ENDED') {
            this.handleBattleEnded();
        }
        else {
            this.transitionTo(next);
        }
    }
    // -------------------------------------------------------------------------
    // Private: battle ended
    // -------------------------------------------------------------------------
    handleBattleEnded() {
        const snapshot = this.lastSnapshot;
        const winningFaction = snapshot && snapshot.winner >= 0
            ? SYNTHETIC_FACTIONS[snapshot.winner] ?? `faction_${snapshot.winner}`
            : SYNTHETIC_FACTIONS[0];
        this.announce({
            kind: 'round_ended',
            message: `Round ended: ${winningFaction} wins`,
            data: {
                winningFaction,
                dominion: snapshot?.dominion ?? [50, 50],
                fortressHealth: snapshot?.fortress_health ?? [1000, 1000],
                victoryType: snapshot?.victory_type ?? 'timeout',
            },
        });
        this.transitionTo('BATTLE_ENDED');
        // timerSeconds is already 0 (set by transitionTo → getTimerForState('BATTLE_ENDED')).
        // The next advanceTime() call will trigger handleTimerExpiry → RESULTS transition.
    }
    // -------------------------------------------------------------------------
    // Private: record and save round
    // -------------------------------------------------------------------------
    recordAndSaveRound() {
        const modeId = this.currentModeId ?? 'countries';
        const snapshot = this.lastSnapshot;
        const winningFaction = snapshot && snapshot.winner >= 0
            ? SYNTHETIC_FACTIONS[snapshot.winner] ?? `faction_${snapshot.winner}`
            : SYNTHETIC_FACTIONS[0];
        this.stats = recordRound(this.stats, modeId, winningFaction);
        saveStats(this.opts.sessionStatsPath, this.stats);
    }
    // -------------------------------------------------------------------------
    // Private: state transitions
    // -------------------------------------------------------------------------
    transitionTo(newState) {
        const from = this.state;
        this.state = newState;
        // Set timer for the new state
        this.timerSeconds = this.getTimerForState(newState);
        this.announce({
            kind: 'stage_changed',
            message: `Stage: ${from} → ${newState}`,
            data: { from, to: newState },
        });
    }
    getTimerForState(state) {
        switch (state) {
            case 'MODE_VOTE':
                return this.opts.modeVoteDuration;
            case 'FACTION_LOBBY':
                return this.opts.factionLobbyDuration;
            case 'BATTLE_OPENING':
                return this.opts.battleConfig.opening;
            case 'BATTLE_CRISIS':
                return this.opts.battleConfig.crisis;
            case 'BATTLE_FINAL_SURGE':
                return this.opts.battleConfig.finalSurge;
            case 'BATTLE_SUDDEN_DEATH':
                return this.opts.battleConfig.suddenDeath;
            case 'BATTLE_ENDED':
                return 0;
            case 'RESULTS':
                return this.opts.resultsDuration;
            default:
                return 0;
        }
    }
    // -------------------------------------------------------------------------
    // Private: announce
    // -------------------------------------------------------------------------
    announce(announcement) {
        this.lastAnnouncement = announcement;
        this.opts.onAnnouncement?.(announcement);
    }
}
// Re-export CONTENT_PACK_MODES for use in tests/commands
export { CONTENT_PACK_MODES };
