/**
 * MockLiveAdapter — scenario-driven live event producer (Phase 9).
 *
 * Plays back a Scenario's events at their scheduled timestamps using a TestClock.
 * Optionally integrates with a Pipeline (processes events) and MatchDirector
 * (feeds chat events, advances time for state transitions).
 *
 * Disconnect/reconnect semantics: events with user.id === '__system__' and
 * comment === '__disconnect__' or '__reconnect__' toggle isConnected() state
 * and are NOT forwarded to the pipeline.
 */
// ---------------------------------------------------------------------------
// System event markers
// ---------------------------------------------------------------------------
const SYSTEM_VIEWER_ID = '__system__';
const DISCONNECT_MARKER = '__disconnect__';
const RECONNECT_MARKER = '__reconnect__';
function isSystemEvent(event) {
    return event?.user?.id === SYSTEM_VIEWER_ID;
}
function isDisconnectMarker(event) {
    return isSystemEvent(event) && event?.comment === DISCONNECT_MARKER;
}
function isReconnectMarker(event) {
    return isSystemEvent(event) && event?.comment === RECONNECT_MARKER;
}
export class MockLiveAdapter {
    scenario;
    clock;
    handler;
    connected = false;
    running = false;
    pendingEvents = [];
    unsubClock;
    // Integration
    pipeline;
    director;
    // Observability
    _emittedEvents = [];
    _commands = [];
    _directorStates = [];
    _results = [];
    _lastAdvanceTimeMs = 0;
    constructor(opts) {
        this.scenario = opts.scenario;
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
        this._directorStates = [];
        this._results = [];
        this._lastAdvanceTimeMs = this.clock.now();
        // Sort events by time (stable sort preserves order for same-time events)
        this.pendingEvents = [...this.scenario.events].sort((a, b) => a.timeMs - b.timeMs);
        // Record initial director state
        if (this.director) {
            this._directorStates.push(this.director.state);
        }
        // Subscribe to clock advances
        this.unsubClock = this.clock.onAdvance(() => this.onClockAdvance());
        // Process any events at time 0
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
    /** Returns all events emitted so far. */
    get emittedEvents() {
        return this._emittedEvents;
    }
    /** Returns all commands produced (from pipeline integration). */
    get commands() {
        return this._commands;
    }
    /** Returns director state transitions recorded. */
    get directorStates() {
        return this._directorStates;
    }
    /** Returns process results from the pipeline. */
    get results() {
        return this._results;
    }
    /** Returns the number of pending (not yet emitted) events. */
    get pendingCount() {
        return this.pendingEvents.length;
    }
    /** Whether the adapter is currently running (started and not stopped). */
    get isRunning() {
        return this.running;
    }
    // -------------------------------------------------------------------------
    // Internal: clock advance handler
    // -------------------------------------------------------------------------
    onClockAdvance() {
        if (!this.running)
            return;
        const currentTime = this.clock.now();
        // Calculate delta for director time advancement
        const deltaMs = currentTime - this._lastAdvanceTimeMs;
        this._lastAdvanceTimeMs = currentTime;
        // Collect events at or before current time
        const toEmit = [];
        while (this.pendingEvents.length > 0 && this.pendingEvents[0].timeMs <= currentTime) {
            toEmit.push(this.pendingEvents.shift());
        }
        // Process each event
        for (const scheduled of toEmit) {
            const event = scheduled.event;
            // Skip null/invalid events entirely (malformed scenario null_input/array_input)
            if (!event || typeof event !== 'object')
                continue;
            // Handle system markers
            if (isDisconnectMarker(event)) {
                this.connected = false;
                continue;
            }
            if (isReconnectMarker(event)) {
                this.connected = true;
                continue;
            }
            if (isSystemEvent(event)) {
                continue; // Other system events are skipped
            }
            // Skip if disconnected
            if (!this.connected)
                continue;
            // Emit to handler
            this._emittedEvents.push(event);
            this.handler?.(event);
            // Pipeline integration
            if (this.pipeline) {
                const result = this.pipeline.process(event);
                this._results.push(result);
                for (const cmd of result.commands) {
                    this._commands.push(cmd);
                }
            }
            // Director integration (FIX 1: guard against malformed chat events)
            if (this.director && event.type === 'chat' && typeof event.user?.id === 'string') {
                try {
                    this.director.handleChatEvent(event);
                }
                catch {
                    // Malformed event — director rejects it; log at debug level
                }
            }
        }
        // FIX 2: capture director state before AND after advanceTime
        const captureDirectorState = () => {
            if (!this.director)
                return;
            const s = this.director.state;
            if (s !== this._directorStates[this._directorStates.length - 1]) {
                this._directorStates.push(s);
            }
        };
        captureDirectorState(); // mid-state
        if (this.director && deltaMs > 0) {
            this.director.advanceTime(Math.ceil(deltaMs / 1000));
            captureDirectorState(); // post-state
        }
    }
    /**
     * Runs the entire scenario by advancing the clock in increments until
     * all events are emitted and the scenario duration has elapsed.
     *
     * @param stepMs — clock advance increment per iteration (default 5000).
     * @returns summary with event count, command count, and director states.
     */
    runToEnd(stepMs = 5000) {
        const maxTime = this.scenario.durationMs;
        while (this.clock.now() <= maxTime && (this.pendingEvents.length > 0 || this.clock.now() < maxTime)) {
            this.clock.advance(stepMs);
            if (this.pendingEvents.length === 0 && this.clock.now() >= maxTime)
                break;
            // Safety: prevent infinite loop
            if (this.clock.now() > maxTime + stepMs * 10)
                break;
        }
        // Final advance to process any remaining time
        this.clock.advance(stepMs);
        return {
            eventsEmitted: this._emittedEvents.length,
            commandsProduced: this._commands.length,
            directorStates: [...this._directorStates],
        };
    }
}
