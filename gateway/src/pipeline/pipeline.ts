/**
 * Pipeline — orchestrates the event-to-command flow:
 *
 *   raw_event → normalize → dedupe → rate limit → rules → enqueue
 *
 * Malformed events never reach the rules engine (acceptance gate).
 * Returns a ProcessResult for each raw event for testability.
 */

import type { GameCommand, NormalizedLiveEvent } from '@riftcrowd/shared';
import { EventBus, type PipelineError } from './event_bus.js';
import { normalizeProviderEvent } from './normalizer.js';
import { DedupeStore } from './dedupe_store.js';
import { RateLimiter } from './rate_limiter.js';
import { CommandRulesEngine } from './command_rules.js';
import { CommandQueue } from './command_queue.js';
import { Logger, createLogger } from '../util/logger.js';

// ---------------------------------------------------------------------------
// ProcessResult
// ---------------------------------------------------------------------------

export interface ProcessResult {
  /** Commands produced by this event. */
  commands: GameCommand[];
  /** Whether the event was dropped (malformed, duplicate, rate-limited, or queue full). */
  dropped: boolean;
  /** Reason for dropping (if any). */
  reason?: string;
}

// ---------------------------------------------------------------------------
// PipelineStats
// ---------------------------------------------------------------------------

export interface PipelineStats {
  processed: number;
  normalized: number;
  deduped: number;
  rateLimited: number;
  rulesTriggered: number;
  queued: number;
  dropped: number;
  queueOverflow: number;
}

// ---------------------------------------------------------------------------
// Pipeline class
// ---------------------------------------------------------------------------

export class Pipeline {
  readonly eventBus: EventBus;
  readonly dedupeStore: DedupeStore;
  readonly rateLimiter: RateLimiter;
  readonly rulesEngine: CommandRulesEngine;
  readonly commandQueue: CommandQueue;

  private stats: PipelineStats = {
    processed: 0,
    normalized: 0,
    deduped: 0,
    rateLimited: 0,
    rulesTriggered: 0,
    queued: 0,
    dropped: 0,
    queueOverflow: 0,
  };

  private readonly onWarn: (msg: string, fields?: Record<string, unknown>) => void;

  /** FIX 8: structured logger for pipeline events. */
  private readonly logger: Logger;

  constructor(opts: {
    eventBusCapacity?: number;
    dedupeCapacity?: number;
    rateLimitPerViewer?: number;
    rateLimitBurst?: number;
    rateLimitGlobal?: number;
    commandQueueCapacity?: number;
    onWarn?: (msg: string, fields?: Record<string, unknown>) => void;
  } = {}) {
    this.onWarn = opts.onWarn ?? (() => {});
    this.logger = new Logger(createLogger('info'));

    this.eventBus = new EventBus(opts.eventBusCapacity ?? 1000, this.onWarn);
    this.dedupeStore = new DedupeStore(opts.dedupeCapacity ?? 10_000);
    this.rateLimiter = new RateLimiter(
      opts.rateLimitPerViewer ?? 10,
      opts.rateLimitBurst ?? 50,
      opts.rateLimitGlobal ?? 1000,
    );
    this.rulesEngine = new CommandRulesEngine();
    this.commandQueue = new CommandQueue(opts.commandQueueCapacity ?? 500);
  }

  /**
   * Processes a single raw provider event through the full pipeline.
   *
   * @param rawEvent — untrusted input from a provider adapter.
   * @returns ProcessResult with produced commands and drop reason.
   */
  process(rawEvent: unknown): ProcessResult {
    this.stats.processed++;

    // 1. Publish raw event
    this.eventBus.publish('raw_event', rawEvent);

    // 2. Normalize
    const normalized = normalizeProviderEvent(rawEvent);

    if (!normalized.ok) {
      // Malformed — emit error, never reach rules engine
      this.stats.dropped++;
      const error: PipelineError = {
        source: 'normalizer',
        message: normalized.errors.join('; '),
        raw: rawEvent,
      };
      this.eventBus.publish('error', error);
      this.logger.warn('pipeline', 'Malformed event dropped', { errors: normalized.errors });
      this.onWarn(`Pipeline: malformed event dropped`, { errors: normalized.errors });
      return { commands: [], dropped: true, reason: `normalization failed: ${normalized.errors.join('; ')}` };
    }

    this.stats.normalized++;
    const event: NormalizedLiveEvent = normalized.value;

    // Publish normalized event
    this.eventBus.publish('normalized_event', event);

    // 3. Dedupe
    if (this.dedupeStore.seen(event.id, event.type)) {
      this.stats.deduped++;
      this.stats.dropped++;
      return { commands: [], dropped: true, reason: 'duplicate event' };
    }

    // 4. Rate limit
    if (!this.rateLimiter.allow(event.user.id)) {
      this.stats.rateLimited++;
      this.stats.dropped++;
      return { commands: [], dropped: true, reason: 'rate limited' };
    }

    // 5. Rules engine
    const commands = this.rulesEngine.evaluate(event);
    if (commands.length > 0) {
      this.stats.rulesTriggered++;
    }

    // 6. Enqueue commands
    // Real-time delivery to the game happens via the event bus and must
    // never be blocked by the inspection queue (GET /commands) being full —
    // nothing drains that queue during gameplay, so gating delivery on it
    // filled it up and silently dropped every later gift ("command queue
    // overflow"). The queue is now a bounded drop-oldest buffer of recent
    // commands for inspection only.
    for (const cmd of commands) {
      this.eventBus.publish('command', cmd);
      if (this.commandQueue.enqueue(cmd)) {
        this.stats.queued++;
      } else {
        this.commandQueue.dequeue();
        this.commandQueue.enqueue(cmd);
        this.stats.queueOverflow++;
      }
    }

    return { commands, dropped: false };
  }

  /**
   * Processes a batch of raw events. Returns results for each.
   */
  processBatch(rawEvents: unknown[]): ProcessResult[] {
    return rawEvents.map((e) => this.process(e));
  }

  /** Returns accumulated pipeline stats. */
  getStats(): PipelineStats {
    return { ...this.stats };
  }

  /** Resets stats counters. */
  resetStats(): void {
    this.stats = {
      processed: 0,
      normalized: 0,
      deduped: 0,
      rateLimited: 0,
      rulesTriggered: 0,
      queued: 0,
      dropped: 0,
      queueOverflow: 0,
    };
  }

  /**
   * Applies runtime configuration updates.
   * Only mutable fields are applied (rate limits, capacities).
   */
  applyRuntimeConfig(update: {
    rateLimitPerViewer?: number;
    rateLimitBurst?: number;
    rateLimitGlobal?: number;
    dedupeCapacity?: number;
    commandQueueCapacity?: number;
    eventBusCapacity?: number;
  }): void {
    if (update.rateLimitPerViewer !== undefined || update.rateLimitBurst !== undefined) {
      const cfg = this.rateLimiter.getConfig();
      this.rateLimiter.updatePerViewer(
        update.rateLimitPerViewer ?? cfg.rateLimitPerViewer,
        update.rateLimitBurst ?? cfg.rateLimitBurst,
      );
    }
    if (update.rateLimitGlobal !== undefined) {
      this.rateLimiter.updateGlobal(update.rateLimitGlobal);
    }
    if (update.dedupeCapacity !== undefined) {
      this.dedupeStore.setCapacity(update.dedupeCapacity);
    }
    if (update.commandQueueCapacity !== undefined) {
      this.commandQueue.setCapacity(update.commandQueueCapacity);
    }
    if (update.eventBusCapacity !== undefined) {
      this.eventBus.setCapacity('raw_event', update.eventBusCapacity);
      this.eventBus.setCapacity('normalized_event', update.eventBusCapacity);
      this.eventBus.setCapacity('command', update.eventBusCapacity);
      this.eventBus.setCapacity('error', update.eventBusCapacity);
    }
  }
}
