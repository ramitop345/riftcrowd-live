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
// ---------------------------------------------------------------------------
// EventBus class
// ---------------------------------------------------------------------------
export class EventBus {
    handlers = new Map();
    queues = new Map();
    capacities = new Map();
    onWarn;
    constructor(defaultCapacity = 1000, onWarn) {
        this.onWarn = onWarn ?? (() => { });
        for (const topic of Object.keys({
            raw_event: 1,
            normalized_event: 1,
            command: 1,
            error: 1,
        })) {
            this.handlers.set(topic, new Set());
            this.queues.set(topic, []);
            this.capacities.set(topic, defaultCapacity);
        }
    }
    /** Sets the capacity for a specific topic. */
    setCapacity(topic, capacity) {
        this.capacities.set(topic, capacity);
    }
    /**
     * Publishes a payload to a topic. If the queue is at capacity, the oldest
     * entry is dropped and a warning is logged.
     *
     * FIX 9: for 'raw_event', only queues the payload if at least one subscriber
     * exists. Handlers are always notified regardless of subscriber count.
     */
    publish(topic, payload) {
        const queue = this.queues.get(topic);
        const capacity = this.capacities.get(topic);
        const handlers = this.handlers.get(topic);
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
                const result = handler(payload);
                if (result && typeof result.catch === 'function') {
                    result.catch((err) => {
                        this.onWarn(`EventBus handler error on '${topic}': ${String(err)}`, {
                            topic,
                        });
                    });
                }
            }
            catch (err) {
                this.onWarn(`EventBus handler error on '${topic}': ${String(err)}`, {
                    topic,
                });
            }
        }
    }
    /** Subscribes a handler to a topic. Returns an unsubscribe function. */
    subscribe(topic, handler) {
        const set = this.handlers.get(topic);
        set.add(handler);
        return () => {
            set.delete(handler);
        };
    }
    /** Unsubscribes a handler from a topic. */
    unsubscribe(topic, handler) {
        const set = this.handlers.get(topic);
        set.delete(handler);
    }
    /** Returns the number of queued items for a topic. */
    queueSize(topic) {
        return this.queues.get(topic).length;
    }
    /** Drains and returns all queued items for a topic. */
    drain(topic) {
        const queue = this.queues.get(topic);
        const items = [...queue];
        queue.length = 0;
        return items;
    }
    /** Clears all queues. */
    clear() {
        for (const queue of this.queues.values()) {
            queue.length = 0;
        }
    }
    /** Returns the number of subscribers for a topic. */
    subscriberCount(topic) {
        return this.handlers.get(topic).size;
    }
}
