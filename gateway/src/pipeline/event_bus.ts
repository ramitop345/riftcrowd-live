/**
 * EventBus — typed pub/sub with bounded queues per topic.
 *
 * Topics: 'raw_event', 'normalized_event', 'command', 'error'.
 * Each topic has a configurable capacity; overflow drops oldest + warns.
 * Async handlers; errors in handlers are caught and logged (never crash the bus).
 *
 * **raw_event optimization (FIX 9):**
 * `raw_event` payloads are only queued when at least one subscriber exists
 * for that topic. In Phase 8 (no Phase 9 subscriber yet), this avoids
 * accumulating up to `capacity` unused raw_event objects in memory.
 */

import type { GameCommand, NormalizedLiveEvent } from '@riftcrowd/shared';

// ---------------------------------------------------------------------------
// Topic types
// ---------------------------------------------------------------------------

export interface PipelineError {
  source: string;
  message: string;
  raw?: unknown;
}

export type EventTopics = {
  raw_event: unknown;
  normalized_event: NormalizedLiveEvent;
  command: GameCommand;
  error: PipelineError;
};

export type TopicName = keyof EventTopics;

export type TopicHandler<T> = (payload: T) => void | Promise<void>;

// ---------------------------------------------------------------------------
// EventBus class
// ---------------------------------------------------------------------------

export class EventBus {
  private readonly handlers = new Map<TopicName, Set<TopicHandler<never>>>();
  private readonly queues = new Map<TopicName, unknown[]>();
  private readonly capacities = new Map<TopicName, number>();
  private readonly onWarn: (msg: string, fields?: Record<string, unknown>) => void;

  constructor(
    defaultCapacity: number = 1000,
    onWarn?: (msg: string, fields?: Record<string, unknown>) => void,
  ) {
    this.onWarn = onWarn ?? (() => {});
    for (const topic of Object.keys({
      raw_event: 1,
      normalized_event: 1,
      command: 1,
      error: 1,
    }) as TopicName[]) {
      this.handlers.set(topic, new Set());
      this.queues.set(topic, []);
      this.capacities.set(topic, defaultCapacity);
    }
  }

  /** Sets the capacity for a specific topic. */
  setCapacity(topic: TopicName, capacity: number): void {
    this.capacities.set(topic, capacity);
  }

  /**
   * Publishes a payload to a topic. If the queue is at capacity, the oldest
   * entry is dropped and a warning is logged.
   *
   * FIX 9: for 'raw_event', only queues the payload if at least one subscriber
   * exists. Handlers are always notified regardless of subscriber count.
   */
  publish<K extends TopicName>(topic: K, payload: EventTopics[K]): void {
    const queue = this.queues.get(topic)!;
    const capacity = this.capacities.get(topic)!;
    const handlers = this.handlers.get(topic)!;

    // FIX 9: only queue raw_event when subscribers exist to avoid wasted memory
    const shouldQueue = topic !== 'raw_event' || handlers.size > 0;

    if (shouldQueue) {
      if (queue.length >= capacity) {
        queue.shift(); // drop oldest
        this.onWarn(`EventBus overflow on '${topic}': dropped oldest entry`, {
          topic,
          capacity,
        });
      }

      queue.push(payload);
    }

    // Notify handlers
    for (const handler of handlers) {
      try {
        const result = (handler as TopicHandler<EventTopics[K]>)(payload);
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch((err: unknown) => {
            this.onWarn(`EventBus handler error on '${topic}': ${String(err)}`, {
              topic,
            });
          });
        }
      } catch (err: unknown) {
        this.onWarn(`EventBus handler error on '${topic}': ${String(err)}`, {
          topic,
        });
      }
    }
  }

  /** Subscribes a handler to a topic. Returns an unsubscribe function. */
  subscribe<K extends TopicName>(topic: K, handler: TopicHandler<EventTopics[K]>): () => void {
    const set = this.handlers.get(topic)!;
    set.add(handler as TopicHandler<never>);
    return () => {
      set.delete(handler as TopicHandler<never>);
    };
  }

  /** Unsubscribes a handler from a topic. */
  unsubscribe<K extends TopicName>(topic: K, handler: TopicHandler<EventTopics[K]>): void {
    const set = this.handlers.get(topic)!;
    set.delete(handler as TopicHandler<never>);
  }

  /** Returns the number of queued items for a topic. */
  queueSize(topic: TopicName): number {
    return this.queues.get(topic)!.length;
  }

  /** Drains and returns all queued items for a topic. */
  drain<K extends TopicName>(topic: K): EventTopics[K][] {
    const queue = this.queues.get(topic)!;
    const items = [...queue] as EventTopics[K][];
    queue.length = 0;
    return items;
  }

  /** Clears all queues. */
  clear(): void {
    for (const queue of this.queues.values()) {
      queue.length = 0;
    }
  }

  /** Returns the number of subscribers for a topic. */
  subscriberCount(topic: TopicName): number {
    return this.handlers.get(topic)!.size;
  }
}
