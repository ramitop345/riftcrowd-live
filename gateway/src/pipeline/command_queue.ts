/**
 * CommandQueue — bounded FIFO queue of GameCommands.
 *
 * Overflow: enqueue returns false when full (caller decides what to do).
 * dequeue and peek return null when empty.
 */

import type { GameCommand } from '@riftcrowd/shared';

// ---------------------------------------------------------------------------
// CommandQueue class
// ---------------------------------------------------------------------------

export class CommandQueue {
  private readonly queue: GameCommand[] = [];
  private _capacity: number;

  constructor(capacity: number = 500) {
    this._capacity = capacity;
  }

  /**
   * Enqueues a command. Returns true on success, false if the queue is full.
   */
  enqueue(cmd: GameCommand): boolean {
    if (this.queue.length >= this._capacity) {
      return false;
    }
    this.queue.push(cmd);
    return true;
  }

  /** Dequeues the oldest command. Returns null if empty. */
  dequeue(): GameCommand | null {
    return this.queue.shift() ?? null;
  }

  /** Returns the oldest command without removing it. Returns null if empty. */
  peek(): GameCommand | null {
    return this.queue[0] ?? null;
  }

  /** Number of commands in the queue. */
  get size(): number {
    return this.queue.length;
  }

  /** Whether the queue is empty. */
  get empty(): boolean {
    return this.queue.length === 0;
  }

  /** Whether the queue is at capacity. */
  get full(): boolean {
    return this.queue.length >= this._capacity;
  }

  /** Clears all commands from the queue. Returns the number of dropped commands. */
  clear(): number {
    const count = this.queue.length;
    this.queue.length = 0;
    return count;
  }

  /** Drains and returns all commands in FIFO order. */
  drain(): GameCommand[] {
    const items = [...this.queue];
    this.queue.length = 0;
    return items;
  }

  /** Current capacity. */
  get capacity(): number {
    return this._capacity;
  }

  /** Updates the capacity. Does not drop items if new capacity is smaller. */
  setCapacity(capacity: number): void {
    this._capacity = capacity;
  }
}
