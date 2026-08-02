/**
 * Phase 17 — WSMessageBuffer.
 *
 * Bounded ring buffer for outbound WebSocket messages. When full, the oldest
 * message is dropped to make room. Tracks dropped count for observability.
 *
 * Cap: 1000 (configurable). Policy: drop-oldest on overflow.
 */
// ---------------------------------------------------------------------------
// WSMessageBuffer
// ---------------------------------------------------------------------------
export class WSMessageBuffer {
    buffer = [];
    nextSeq = 0;
    dropped = 0;
    totalEnqueued = 0;
    totalDequeued = 0;
    _capacity;
    constructor(capacity = 1000) {
        this._capacity = capacity;
    }
    /**
     * Enqueue a message. If buffer is full, drops the oldest message.
     * Returns the sequence number assigned.
     */
    enqueue(payload) {
        const seq = this.nextSeq++;
        this.totalEnqueued++;
        if (this.buffer.length >= this._capacity) {
            this.buffer.shift();
            this.dropped++;
        }
        this.buffer.push({
            sequenceNumber: seq,
            payload,
            bufferedAt: Date.now(),
        });
        return seq;
    }
    /** Dequeue the oldest message. Returns null if empty. */
    dequeue() {
        const msg = this.buffer.shift();
        if (msg) {
            this.totalDequeued++;
        }
        return msg ?? null;
    }
    /** Peek at the oldest message without removing it. */
    peek() {
        return this.buffer[0] ?? null;
    }
    /** Drain all messages in FIFO order. */
    drain() {
        const items = [...this.buffer];
        this.totalDequeued += items.length;
        this.buffer.length = 0;
        return items;
    }
    /** Get buffer statistics. */
    getStats() {
        return {
            size: this.buffer.length,
            dropped: this.dropped,
            totalEnqueued: this.totalEnqueued,
            totalDequeued: this.totalDequeued,
            capacity: this._capacity,
        };
    }
    /** Current number of buffered messages. */
    get size() {
        return this.buffer.length;
    }
    /** Whether the buffer is empty. */
    get empty() {
        return this.buffer.length === 0;
    }
    /** Whether the buffer is at capacity. */
    get full() {
        return this.buffer.length >= this._capacity;
    }
    /** Current capacity. */
    get capacity() {
        return this._capacity;
    }
    /** Update capacity. Does not drop existing messages if new capacity is smaller. */
    setCapacity(capacity) {
        this._capacity = capacity;
    }
    /** Clear all messages. Returns count of dropped messages. */
    clear() {
        const count = this.buffer.length;
        this.dropped += count;
        this.buffer.length = 0;
        return count;
    }
}
