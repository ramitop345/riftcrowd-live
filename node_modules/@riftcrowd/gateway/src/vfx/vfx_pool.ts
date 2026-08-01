/**
 * Phase 15 — VFX Object Pool.
 *
 * Bounded object pool for VFX instances (particles, flashes, trails, overlays).
 * Per-type limits from config; LRU eviction when pool full.
 * acquire() returns null if pool exhausted (no crash, no leak).
 */

import type { VFXConfig } from './vfx_config.js';

// ---------------------------------------------------------------------------
// VFX types
// ---------------------------------------------------------------------------

export type VFXType = 'particle' | 'flash' | 'trail' | 'overlay';

export interface VFXParams {
  /** Position X in pixels. */
  x?: number;
  /** Position Y in pixels. */
  y?: number;
  /** Duration in milliseconds. */
  duration?: number;
  /** Color hex string. */
  color?: string;
  /** Intensity (0-1). */
  intensity?: number;
  /** Pattern hint for color-blind mode. */
  pattern?: string;
  /** Any extra params. */
  [key: string]: unknown;
}

export interface VFXInstance {
  /** Unique pool-assigned ID. */
  poolId: number;
  /** VFX type. */
  type: VFXType;
  /** Parameters at acquire time. */
  params: VFXParams;
  /** Whether this instance is currently active. */
  active: boolean;
  /** Timestamp when last acquired or released. */
  lastUsed: number;
}

export interface VFXPoolStats {
  active: number;
  idle: number;
  dropped: number;
  perType: Record<VFXType, { active: number; idle: number }>;
}

// ---------------------------------------------------------------------------
// VFXPool
// ---------------------------------------------------------------------------

export class VFXPool {
  private readonly instances: VFXInstance[] = [];
  private nextId = 0;
  private dropped = 0;
  private config: VFXConfig;

  constructor(config: VFXConfig) {
    this.config = config;
    this.preAllocate();
  }

  /** Pre-allocate idle instances up to per-type limits. */
  private preAllocate(): void {
    const { maxParticles, maxFlashes, maxTrails, maxOverlays } = this.config.pool;
    const types: Array<{ type: VFXType; count: number }> = [
      { type: 'particle', count: maxParticles },
      { type: 'flash', count: maxFlashes },
      { type: 'trail', count: maxTrails },
      { type: 'overlay', count: maxOverlays },
    ];
    for (const { type, count } of types) {
      for (let i = 0; i < count; i++) {
        this.instances.push({
          poolId: this.nextId++,
          type,
          params: {},
          active: false,
          lastUsed: 0,
        });
      }
    }
  }

  /**
   * Acquire a VFX instance from the pool.
   * Returns null if pool exhausted for the given type.
   * `dropped` counts the number of acquire() calls that could not be fulfilled, regardless of reason.
   */
  acquire(type: VFXType, params: VFXParams): VFXInstance | null {
    // Find an idle instance of the right type
    let candidate: VFXInstance | null = null;
    for (const inst of this.instances) {
      if (inst.type === type && !inst.active) {
        candidate = inst;
        break;
      }
    }

    if (!candidate) {
      // Try evicting oldest idle instance of the same type
      const evicted = this.evictLRU(type);
      if (evicted) {
        candidate = evicted;
        candidate.type = type;
        candidate.params = { ...params };
        candidate.active = true;
        candidate.lastUsed = Date.now();
        return candidate;
      }
      this.dropped++;
      return null;
    }

    candidate.active = true;
    candidate.params = { ...params };
    candidate.lastUsed = Date.now();
    return candidate;
  }

  /** Release a VFX instance back to the pool. */
  release(instance: VFXInstance): void {
    const found = this.instances.find((i) => i.poolId === instance.poolId);
    if (found && found.active) {
      found.active = false;
      found.params = {};
      found.lastUsed = Date.now();
    }
  }

  /**
   * LRU eviction: evict the oldest idle instance of a given type to make room.
   * Removes the instance from the pool and returns it, or null if none available.
   */
  evictLRU(type: VFXType): VFXInstance | null {
    let oldest: VFXInstance | null = null;
    for (const inst of this.instances) {
      if (inst.type === type && !inst.active) {
        if (!oldest || inst.lastUsed < oldest.lastUsed) {
          oldest = inst;
        }
      }
    }
    if (oldest) {
      const idx = this.instances.indexOf(oldest);
      if (idx !== -1) this.instances.splice(idx, 1);
    }
    return oldest;
  }

  /** Get pool statistics. */
  getStats(): VFXPoolStats {
    let active = 0;
    let idle = 0;
    const perType: Record<VFXType, { active: number; idle: number }> = {
      particle: { active: 0, idle: 0 },
      flash: { active: 0, idle: 0 },
      trail: { active: 0, idle: 0 },
      overlay: { active: 0, idle: 0 },
    };

    for (const inst of this.instances) {
      if (inst.active) {
        active++;
        perType[inst.type].active++;
      } else {
        idle++;
        perType[inst.type].idle++;
      }
    }

    return { active, idle, dropped: this.dropped, perType };
  }

  /**
   * Update config (for hot-reload).
   * Graceful transition: keep active instances alive, only re-allocate when
   * pool limits actually change.
   */
  updateConfig(config: VFXConfig): void {
    const oldLimits = this.config.pool;
    this.config = config;
    const newLimits = config.pool;

    // Check if any limits changed
    const limitsChanged =
      oldLimits.maxParticles !== newLimits.maxParticles ||
      oldLimits.maxFlashes !== newLimits.maxFlashes ||
      oldLimits.maxTrails !== newLimits.maxTrails ||
      oldLimits.maxOverlays !== newLimits.maxOverlays;

    if (!limitsChanged) {
      // No structural change needed — active instances stay alive
      return;
    }

    // Only tear down and re-allocate when limits actually change
    // Keep active instances alive until they naturally expire
    const activeInstances = this.instances.filter((i) => i.active);
    this.instances.length = 0;

    // Re-add active instances
    for (const inst of activeInstances) {
      this.instances.push(inst);
    }

    // Re-allocate idle instances up to new limits
    const types: Array<{ type: VFXType; count: number }> = [
      { type: 'particle', count: newLimits.maxParticles },
      { type: 'flash', count: newLimits.maxFlashes },
      { type: 'trail', count: newLimits.maxTrails },
      { type: 'overlay', count: newLimits.maxOverlays },
    ];
    for (const { type, count } of types) {
      let currentCount = 0;
      for (const inst of this.instances) {
        if (inst.type === type) currentCount++;
      }
      for (let i = currentCount; i < count; i++) {
        this.instances.push({
          poolId: this.nextId++,
          type,
          params: {},
          active: false,
          lastUsed: 0,
        });
      }
    }
  }

  /** Total capacity across all types. */
  get totalCapacity(): number {
    return (
      this.config.pool.maxParticles +
      this.config.pool.maxFlashes +
      this.config.pool.maxTrails +
      this.config.pool.maxOverlays
    );
  }

  /** Get current config. */
  getConfig(): VFXConfig {
    return this.config;
  }
}
