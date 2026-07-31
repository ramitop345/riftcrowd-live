/**
 * MockSimulation — pure-Node deterministic simulation that produces snapshots
 * matching the Phase 5 SimWorld (Godot) get_snapshot shape. No Godot dependency.
 *
 * Uses mulberry32 PRNG for deterministic results given the same seed.
 */

// ---------------------------------------------------------------------------
// Mulberry32 seeded PRNG (~20 lines)
// ---------------------------------------------------------------------------

/** Creates a mulberry32 PRNG function from a 32-bit integer seed. */
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Types matching Phase 5 SimWorld snapshot shape
// ---------------------------------------------------------------------------

export interface MockUnit {
  id: number;
  kind: string;
  faction: number;
  hp: number;
  max_hp: number;
  x: number;
  y: number;
  cooldown: number;
  dead: boolean;
  owner_id: string;
  spawned_at: number;
}

export interface MockProjectile {
  id: number;
  source_id: number;
  target_id: number;
  x: number;
  y: number;
  damage: number;
  ttl: number;
}

export interface MockSnapshot {
  tick: number;
  elapsed: number;
  stage: string;
  stage_time_left: number;
  dominion: [number, number];
  fortress_health: [number, number];
  capture_pressure: [number, number];
  winner: number;
  victory_type: string;
  units: MockUnit[];
  projectiles: MockProjectile[];
  events: string[];
  pool_stats: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Battle stages in order
// ---------------------------------------------------------------------------

export type BattleStage = 'opening' | 'crisis' | 'final_surge' | 'sudden_death' | 'ended';

const STAGE_ORDER: BattleStage[] = ['opening', 'crisis', 'final_surge', 'sudden_death', 'ended'];

export interface BattleConfig {
  /** Duration of opening stage in seconds */
  opening: number;
  /** Duration of crisis stage in seconds */
  crisis: number;
  /** Duration of final surge stage in seconds */
  finalSurge: number;
  /** Duration of sudden death stage in seconds */
  suddenDeath: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fixed tick rate (Hz) */
const TICK_RATE = 20;

/** Safety cap: maximum ticks per round to prevent infinite loops */
const MAX_TICKS_PER_ROUND = 100_000;

// ---------------------------------------------------------------------------
// MockSimulation class
// ---------------------------------------------------------------------------

export class MockSimulation {
  private readonly rng: () => number;
  private readonly stageDurations: Record<BattleStage, number>;
  private currentTick = 0;
  private currentStageIndex = 0;
  private stageTicks = 0;
  private readonly maxTicks: number;

  /** Whether the round has ended (stage === 'ended'). */
  public roundOver = false;

  constructor(seed: number, config: BattleConfig) {
    this.rng = mulberry32(seed);
    this.stageDurations = {
      opening: config.opening,
      crisis: config.crisis,
      final_surge: config.finalSurge,
      sudden_death: config.suddenDeath,
      ended: 0,
    };
    this.maxTicks = MAX_TICKS_PER_ROUND;
  }

  /** Returns the current stage name. */
  get stage(): BattleStage {
    return STAGE_ORDER[this.currentStageIndex] ?? 'ended';
  }

  /** Advances one fixed-step tick (1/20s) and returns the resulting snapshot. */
  tick(): MockSnapshot {
    this.currentTick++;
    this.stageTicks++;

    // Check stage transition
    const stageDurationSec = this.stageDurations[this.stage];
    const stageDurationTicks = stageDurationSec * TICK_RATE;

    if (this.stage !== 'ended' && stageDurationTicks > 0 && this.stageTicks >= stageDurationTicks) {
      this.advanceStage();
    }

    // Safety cap
    if (this.currentTick >= this.maxTicks && !this.roundOver) {
      this.roundOver = true;
      this.currentStageIndex = STAGE_ORDER.length - 1;
    }

    return this.buildSnapshot();
  }

  /** Whether the round is over. */
  is_round_over(): boolean {
    return this.roundOver;
  }

  /** Returns the current tick count. */
  get_tick(): number {
    return this.currentTick;
  }

  /**
   * Force the simulation to a specific stage (used by director skip).
   * Resets stage ticks so the forced stage behaves as freshly entered.
   */
  forceStage(stage: BattleStage): void {
    const idx = STAGE_ORDER.indexOf(stage);
    if (idx >= 0) {
      this.currentStageIndex = idx;
      this.stageTicks = 0;
      if (stage === 'ended') {
        this.roundOver = true;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private advanceStage(): void {
    this.currentStageIndex++;
    this.stageTicks = 0;
    if (this.stage === 'ended') {
      this.roundOver = true;
    }
  }

  private buildSnapshot(): MockSnapshot {
    const stage = this.stage;
    const stageDurationSec = this.stageDurations[stage];
    const stageElapsedSec = this.stageTicks / TICK_RATE;
    const stageTimeLeft = Math.max(0, stageDurationSec - stageElapsedSec);
    const elapsed = this.currentTick / TICK_RATE;

    // Synthetic dominion: oscillates based on rng
    const dominionBase = 50 + Math.floor((this.rng() - 0.5) * 20);
    const dominion: [number, number] = [dominionBase, 100 - dominionBase];

    // Fortress health degrades as battle progresses
    const degradation = Math.min(1, elapsed / 300);
    const fortress_health: [number, number] = [
      Math.max(0, Math.floor(1000 * (1 - degradation * (0.5 + this.rng() * 0.5)))),
      Math.max(0, Math.floor(1000 * (1 - degradation * (0.5 + this.rng() * 0.5)))),
    ];

    // Capture pressure
    const capture_pressure: [number, number] = [
      Math.floor(this.rng() * 100),
      Math.floor(this.rng() * 100),
    ];

    // Winner & victory_type only when ended
    let winner = -1;
    let victory_type = '';
    if (stage === 'ended') {
      winner = fortress_health[0] >= fortress_health[1] ? 0 : 1;
      const winnerHealth = winner === 0 ? fortress_health[0] : fortress_health[1];
      victory_type = winnerHealth <= 0 ? 'dominion' : 'fortress';
    }

    // Events
    const events: string[] = [];
    if (stage === 'crisis' && this.stageTicks === 1) {
      events.push('boss_spawned');
    }
    if (stage === 'ended' && this.stageTicks === 1) {
      events.push(`victory:${winner}:${victory_type}`);
    }

    // Synthetic units (1-2 placeholders per faction)
    const units: MockUnit[] = [
      this.makeUnit(1, 'striker', 0),
      this.makeUnit(2, 'striker', 1),
    ];

    // Synthetic projectiles (0-1 per tick)
    const projectiles: MockProjectile[] = [];
    if (this.rng() > 0.5) {
      projectiles.push({
        id: this.currentTick,
        source_id: 1,
        target_id: 2,
        x: this.rng() * 100,
        y: this.rng() * 100,
        damage: Math.floor(this.rng() * 50) + 10,
        ttl: 30,
      });
    }

    return {
      tick: this.currentTick,
      elapsed,
      stage,
      stage_time_left: stageTimeLeft,
      dominion,
      fortress_health,
      capture_pressure,
      winner,
      victory_type,
      units,
      projectiles,
      events,
      pool_stats: { units_active: units.length, projectiles_active: projectiles.length },
    };
  }

  private makeUnit(id: number, kind: string, faction: number): MockUnit {
    return {
      id,
      kind,
      faction,
      hp: 80 + Math.floor(this.rng() * 20),
      max_hp: 100,
      x: this.rng() * 100,
      y: this.rng() * 100,
      cooldown: Math.floor(this.rng() * 10),
      dead: false,
      owner_id: `viewer_${faction}_${id}`,
      spawned_at: Math.max(0, this.currentTick - Math.floor(this.rng() * 100)),
    };
  }
}
