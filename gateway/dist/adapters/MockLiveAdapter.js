/**
 * Mock provider adapter. Transitions connection states honestly but emits no events yet:
 * scripted scenario playback arrives in Phase 9. It never fabricates success beyond what
 * actually happened.
 */
export class MockLiveAdapter {
    id = 'mock';
    status = 'disconnected';
    eventCallback;
    statusCallback;
    async connect() {
        this.setStatus('connected');
    }
    async disconnect() {
        this.setStatus('disconnected');
    }
    getStatus() {
        return this.status;
    }
    onEvent(callback) {
        // Stored for Phase 9 scripted scenarios; no events are generated in Phase 1.
        this.eventCallback = callback;
    }
    onStatus(callback) {
        this.statusCallback = callback;
    }
    /** Reserved for Phase 9 scenario playback so the stored callback is exercised honestly. */
    emitEvent(event) {
        this.eventCallback?.(event);
    }
    setStatus(status) {
        this.status = status;
        this.statusCallback?.(status);
    }
}
