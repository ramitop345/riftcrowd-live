/**
 * TestClock — deterministic clock for reproducible scenario playback.
 *
 * Provides `now()`, `advance(ms)`, and `setTime(ms)`. The MockLiveAdapter and
 * ReplayAdapter use TestClock instead of Date.now() so scenarios produce
 * identical event sequences across runs.
 *
 * Subscribers register via `onAdvance(callback)` and are notified after every
 * time change, allowing the adapter to emit pending events.
 */
export class TestClock {
    currentTimeMs;
    handlers = [];
    /**
     * @param initialMs — starting time in ms since epoch. Defaults to 0.
     */
    constructor(initialMs = 0) {
        this.currentTimeMs = initialMs;
    }
    /** Returns the current clock time in ms. */
    now() {
        return this.currentTimeMs;
    }
    /**
     * Advances the clock by `ms` milliseconds and notifies all handlers.
     * Negative values are clamped to 0 (time never goes backward).
     */
    advance(ms) {
        const delta = Math.max(0, ms);
        this.currentTimeMs += delta;
        this.notifyHandlers();
    }
    /**
     * Sets the clock to an absolute time and notifies all handlers.
     * If `ms` is less than the current time, the clock is set to the current time (no rewind).
     */
    setTime(ms) {
        this.currentTimeMs = Math.max(this.currentTimeMs, ms);
        this.notifyHandlers();
    }
    /** Resets the clock to the given time (can go backward). Useful for test setup. Notifies handlers. */
    reset(ms = 0) {
        this.currentTimeMs = ms;
        this.notifyHandlers();
    }
    /**
     * Registers a handler called after every advance or setTime.
     * Returns an unsubscribe function.
     */
    onAdvance(handler) {
        this.handlers.push(handler);
        return () => {
            const idx = this.handlers.indexOf(handler);
            if (idx >= 0)
                this.handlers.splice(idx, 1);
        };
    }
    /** Removes all registered handlers. */
    clearHandlers() {
        this.handlers.length = 0;
    }
    notifyHandlers() {
        const time = this.currentTimeMs;
        for (const handler of [...this.handlers]) {
            handler(time);
        }
    }
}
