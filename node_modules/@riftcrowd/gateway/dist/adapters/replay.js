/**
 * ReplayAdapter — replays a RecordedSession as a LiveAdapter.
 *
 * Takes a RecordedSession and a TestClock, emits events at their recorded
 * timestamps (relative to session start). Deterministic: same session →
 * same event sequence → same commands.
 */
export class ReplayAdapter {
    session;
    clock;
    handler;
    connected = false;
    running = false;
    pendingEvents = [];
    unsubClock;
    pipeline;
    director;
    _emittedEvents = [];
    _commands = [];
    _lastAdvanceTimeMs = 0;
    constructor(opts) {
        this.session = opts.session;
        this.clock = opts.clock;
        this.pipeline = opts.pipeline;
        this.director = opts.director;
    }
    async start() {
        if (this.running)
            return;
        this.running = true;
        this.connected = true;
        this._emittedEvents = [];
        this._commands = [];
        this._lastAdvanceTimeMs = this.clock.now();
        // Use session events as scheduled events
        this.pendingEvents = [...this.session.events].sort((a, b) => a.timeMs - b.timeMs);
        this.unsubClock = this.clock.onAdvance(() => this.onClockAdvance());
        this.onClockAdvance();
    }
    async stop() {
        this.running = false;
        this.connected = false;
        this.pendingEvents = [];
        if (this.unsubClock) {
            this.unsubClock();
            this.unsubClock = undefined;
        }
    }
    onEvent(handler) {
        this.handler = handler;
    }
    isConnected() {
        return this.connected;
    }
    get emittedEvents() {
        return this._emittedEvents;
    }
    get commands() {
        return this._commands;
    }
    get pendingCount() {
        return this.pendingEvents.length;
    }
    /**
     * Runs the entire replay by advancing the clock until all events are emitted.
     */
    runToEnd(stepMs = 5000) {
        // Find the max event time
        const maxTime = this.session.events.reduce((max, e) => Math.max(max, e.timeMs), 0);
        while (this.pendingEvents.length > 0 || this.clock.now() < maxTime) {
            this.clock.advance(stepMs);
            if (this.pendingEvents.length === 0 && this.clock.now() >= maxTime + stepMs)
                break;
            if (this.clock.now() > maxTime + stepMs * 10)
                break;
        }
        this.clock.advance(stepMs);
        return {
            eventsEmitted: this._emittedEvents.length,
            commandsProduced: this._commands.length,
        };
    }
    onClockAdvance() {
        if (!this.running)
            return;
        const currentTime = this.clock.now();
        const deltaMs = currentTime - this._lastAdvanceTimeMs;
        this._lastAdvanceTimeMs = currentTime;
        const toEmit = [];
        while (this.pendingEvents.length > 0 && this.pendingEvents[0].timeMs <= currentTime) {
            toEmit.push(this.pendingEvents.shift());
        }
        for (const scheduled of toEmit) {
            if (!scheduled.event || typeof scheduled.event !== 'object')
                continue;
            if (!this.connected)
                continue;
            this._emittedEvents.push(scheduled.event);
            this.handler?.(scheduled.event);
            if (this.pipeline) {
                const result = this.pipeline.process(scheduled.event);
                for (const cmd of result.commands) {
                    this._commands.push(cmd);
                }
            }
            if (this.director && scheduled.event.type === 'chat' && typeof scheduled.event.user?.id === 'string') {
                try {
                    this.director.handleChatEvent(scheduled.event);
                }
                catch {
                    // Malformed event — director rejects it; log at debug level
                }
            }
        }
        if (this.director && deltaMs > 0) {
            this.director.advanceTime(Math.ceil(deltaMs / 1000));
        }
    }
}
