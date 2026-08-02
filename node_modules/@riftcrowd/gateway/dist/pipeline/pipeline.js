/**
 * Pipeline — orchestrates the event-to-command flow:
 *
 *   raw_event → normalize → dedupe → rate limit → rules → enqueue
 *
 * Malformed events never reach the rules engine (acceptance gate).
 * Returns a ProcessResult for each raw event for testability.
 */
import { EventBus } from './event_bus.js';
import { normalizeProviderEvent } from './normalizer.js';
import { DedupeStore } from './dedupe_store.js';
import { RateLimiter } from './rate_limiter.js';
import { CommandRulesEngine } from './command_rules.js';
import { CommandQueue } from './command_queue.js';
import { Logger, createLogger } from '../util/logger.js';
// ---------------------------------------------------------------------------
// Pipeline class
// ---------------------------------------------------------------------------
export class Pipeline {
    eventBus;
    dedupeStore;
    rateLimiter;
    rulesEngine;
    commandQueue;
    stats = {
        processed: 0,
        normalized: 0,
        deduped: 0,
        rateLimited: 0,
        rulesTriggered: 0,
        queued: 0,
        dropped: 0,
        queueOverflow: 0,
    };
    onWarn;
    /** FIX 8: structured logger for pipeline events. */
    logger;
    constructor(opts = {}) {
        this.onWarn = opts.onWarn ?? (() => { });
        this.logger = new Logger(createLogger('info'));
        this.eventBus = new EventBus(opts.eventBusCapacity ?? 1000, this.onWarn);
        this.dedupeStore = new DedupeStore(opts.dedupeCapacity ?? 10_000);
        this.rateLimiter = new RateLimiter(opts.rateLimitPerViewer ?? 10, opts.rateLimitBurst ?? 50, opts.rateLimitGlobal ?? 1000);
        this.rulesEngine = new CommandRulesEngine();
        this.commandQueue = new CommandQueue(opts.commandQueueCapacity ?? 500);
    }
    /**
     * Processes a single raw provider event through the full pipeline.
     *
     * @param rawEvent — untrusted input from a provider adapter.
     * @returns ProcessResult with produced commands and drop reason.
     */
    process(rawEvent) {
        this.stats.processed++;
        // 1. Publish raw event
        this.eventBus.publish('raw_event', rawEvent);
        // 2. Normalize
        const normalized = normalizeProviderEvent(rawEvent);
        if (!normalized.ok) {
            // Malformed — emit error, never reach rules engine
            this.stats.dropped++;
            const error = {
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
        const event = normalized.value;
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
        let allQueued = true;
        for (const cmd of commands) {
            const ok = this.commandQueue.enqueue(cmd);
            if (ok) {
                this.stats.queued++;
                this.eventBus.publish('command', cmd);
            }
            else {
                allQueued = false;
                this.stats.queueOverflow++;
                this.logger.warn('pipeline', `Command queue full, command ${cmd.id} dropped`, {
                    commandType: cmd.type,
                });
                this.onWarn(`Pipeline: command queue full, command ${cmd.id} dropped`, {
                    commandType: cmd.type,
                });
            }
        }
        if (!allQueued && commands.length > 0) {
            return {
                commands,
                dropped: true,
                reason: 'command queue overflow (some commands dropped)',
            };
        }
        return { commands, dropped: false };
    }
    /**
     * Processes a batch of raw events. Returns results for each.
     */
    processBatch(rawEvents) {
        return rawEvents.map((e) => this.process(e));
    }
    /** Returns accumulated pipeline stats. */
    getStats() {
        return { ...this.stats };
    }
    /** Resets stats counters. */
    resetStats() {
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
    applyRuntimeConfig(update) {
        if (update.rateLimitPerViewer !== undefined || update.rateLimitBurst !== undefined) {
            const cfg = this.rateLimiter.getConfig();
            this.rateLimiter.updatePerViewer(update.rateLimitPerViewer ?? cfg.rateLimitPerViewer, update.rateLimitBurst ?? cfg.rateLimitBurst);
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
