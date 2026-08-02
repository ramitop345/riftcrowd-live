/**
 * CommandQueue — bounded FIFO queue of GameCommands.
 *
 * Overflow: enqueue returns false when full (caller decides what to do).
 * dequeue and peek return null when empty.
 */
// ---------------------------------------------------------------------------
// CommandQueue class
// ---------------------------------------------------------------------------
export class CommandQueue {
    queue = [];
    _capacity;
    constructor(capacity = 500) {
        this._capacity = capacity;
    }
    /**
     * Enqueues a command. Returns true on success, false if the queue is full.
     */
    enqueue(cmd) {
        if (this.queue.length >= this._capacity) {
            return false;
        }
        this.queue.push(cmd);
        return true;
    }
    /** Dequeues the oldest command. Returns null if empty. */
    dequeue() {
        return this.queue.shift() ?? null;
    }
    /** Returns the oldest command without removing it. Returns null if empty. */
    peek() {
        return this.queue[0] ?? null;
    }
    /** Number of commands in the queue. */
    get size() {
        return this.queue.length;
    }
    /** Whether the queue is empty. */
    get empty() {
        return this.queue.length === 0;
    }
    /** Whether the queue is at capacity. */
    get full() {
        return this.queue.length >= this._capacity;
    }
    /** Clears all commands from the queue. Returns the number of dropped commands. */
    clear() {
        const count = this.queue.length;
        this.queue.length = 0;
        return count;
    }
    /** Drains and returns all commands in FIFO order. */
    drain() {
        const items = [...this.queue];
        this.queue.length = 0;
        return items;
    }
    /** Current capacity. */
    get capacity() {
        return this._capacity;
    }
    /** Updates the capacity. Does not drop items if new capacity is smaller. */
    setCapacity(capacity) {
        this._capacity = capacity;
    }
}
