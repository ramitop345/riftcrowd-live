/**
 * Phase 17 — WSMessageBuffer.
 *
 * Bounded ring buffer for outbound WebSocket messages. When full, the oldest
 * message is dropped to make room. Tracks dropped count for observability.
 *
 * Cap: 1000 (configurable). Policy: drop-oldest on overflow.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BufferedMessage {
  /** Buffer-assigned sequence number. */
  sequenceNumber: number;
  /** The message payload (already serialized). */
  payload: unknown;
  /** Timestamp when buffered. */
  bufferedAt: number;
}

export interface WSMessageBufferStats {
  /** Current number of buffered messages. */
  size: number;
  /** Total messages dropped due to buffer overflow. */
  dropped: number;
  /** Total messages enqueued. */
  totalEnqueued: number;
  /** Total messages dequeued (consumed). */
  totalDequeued: number;
  /** Current capacity. */
  capacity: number;
}

// ---------------------------------------------------------------------------
// WSMessageBuffer
// ---------------------------------------------------------------------------

export class WSMessageBuffer {
  private readonly buffer: BufferedMessage[] = [];
  private nextSeq = 0;
  private dropped = 0;
  private totalEnqueued = 0;
  private totalDequeued = 0;
  private _capacity: number;

  constructor(capacity: number = 1000) {
    this._capacity = capacity;
  }

  /**
   * Enqueue a message. If buffer is full, drops the oldest message.
   * Returns the sequence number assigned.
   */
  enqueue(payload: unknown): number {
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
  dequeue(): BufferedMessage | null {
    const msg = this.buffer.shift();
    if (msg) {
      this.totalDequeued++;
    }
    return msg ?? null;
  }

  /** Peek at the oldest message without removing it. */
  peek(): BufferedMessage | null {
    return this.buffer[0] ?? null;
  }

  /** Drain all messages in FIFO order. */
  drain(): BufferedMessage[] {
    const items = [...this.buffer];
    this.totalDequeued += items.length;
    this.buffer.length = 0;
    return items;
  }

  /** Get buffer statistics. */
  getStats(): WSMessageBufferStats {
    return {
      size: this.buffer.length,
      dropped: this.dropped,
      totalEnqueued: this.totalEnqueued,
      totalDequeued: this.totalDequeued,
      capacity: this._capacity,
    };
  }

  /** Current number of buffered messages. */
  get size(): number {
    return this.buffer.length;
  }

  /** Whether the buffer is empty. */
  get empty(): boolean {
    return this.buffer.length === 0;
  }

  /** Whether the buffer is at capacity. */
  get full(): boolean {
    return this.buffer.length >= this._capacity;
  }

  /** Current capacity. */
  get capacity(): number {
    return this._capacity;
  }

  /** Update capacity. Does not drop existing messages if new capacity is smaller. */
  setCapacity(capacity: number): void {
    this._capacity = capacity;
  }

  /** Clear all messages. Returns count of dropped messages. */
  clear(): number {
    const count = this.buffer.length;
    this.dropped += count;
    this.buffer.length = 0;
    return count;
  }
}
