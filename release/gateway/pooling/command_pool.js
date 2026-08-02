/**
 * Phase 17 — CommandPool.
 *
 * Bounded pool for GameCommand objects. When the pool is full, LRU eviction
 * removes the oldest command (active or idle) to make room. Acquire returns
 * null if pool is exhausted and no eviction candidate exists.
 *
 * FIX 1: evictLRU() now searches ALL slots (active and idle) for the oldest
 * by lastUsed timestamp. When evicting an active slot, the consumer will see
 * a stale reference (slot removed from pool). setCapacity() trims excess slots.
 *
 * Cap: 5000 (configurable). Eviction: LRU by lastUsed timestamp.
 */
// ---------------------------------------------------------------------------
// CommandPool
// ---------------------------------------------------------------------------
export class CommandPool {
    slots = [];
    nextSlotId = 0;
    dropped = 0;
    evicted = 0;
    _capacity;
    constructor(capacity = 5000) {
        this._capacity = capacity;
    }
    /**
     * Acquire a slot for a command. Returns the pooled command or null if
     * the pool is full and no LRU eviction candidate exists.
     */
    acquire(cmd) {
        // Try to reuse an idle slot first (cheapest path — slot stays in array)
        let candidate = null;
        for (const slot of this.slots) {
            if (!slot.active) {
                candidate = slot;
                break;
            }
        }
        if (candidate) {
            candidate.command = cmd;
            candidate.active = true;
            candidate.cancelled = false;
            candidate.lastUsed = Date.now();
            return candidate;
        }
        // Pool full — try LRU eviction across ALL slots (active and idle)
        if (this.slots.length >= this._capacity) {
            const evictedSlot = this.evictLRU();
            if (evictedSlot) {
                // Evicted slot was removed from array and may still be referenced externally.
                // Allocate a NEW slot object to avoid invalidating the external reference.
                const newSlot = {
                    slotId: this.nextSlotId++,
                    command: cmd,
                    active: true,
                    lastUsed: Date.now(),
                    cancelled: false,
                };
                this.slots.push(newSlot);
                return newSlot;
            }
            // No eviction possible (should not happen when pool is non-empty)
            this.dropped++;
            return null;
        }
        // Allocate a new slot
        const slot = {
            slotId: this.nextSlotId++,
            command: cmd,
            active: true,
            lastUsed: Date.now(),
            cancelled: false,
        };
        this.slots.push(slot);
        return slot;
    }
    /** Release a pooled command back to idle state. */
    release(pooled) {
        const found = this.slots.find((s) => s.slotId === pooled.slotId);
        if (found && found.active && !found.cancelled) {
            found.active = false;
            found.lastUsed = Date.now();
        }
    }
    /**
     * FIX 1: LRU eviction searches ALL slots (active and idle) for the oldest
     * by lastUsed timestamp. When evicting an active slot, mark it as cancelled
     * so the consumer sees a stale reference.
     */
    evictLRU() {
        if (this.slots.length === 0)
            return null;
        let oldest = null;
        for (const slot of this.slots) {
            if (!oldest || slot.lastUsed < oldest.lastUsed ||
                (slot.lastUsed === oldest.lastUsed && slot.slotId < oldest.slotId)) {
                oldest = slot;
            }
        }
        if (oldest) {
            // If the oldest slot is still active, mark it as cancelled
            if (oldest.active) {
                oldest.cancelled = true;
            }
            const idx = this.slots.indexOf(oldest);
            if (idx !== -1)
                this.slots.splice(idx, 1);
            this.evicted++;
        }
        return oldest;
    }
    /** Get pool statistics. */
    getStats() {
        let active = 0;
        let idle = 0;
        for (const slot of this.slots) {
            if (slot.active)
                active++;
            else
                idle++;
        }
        return {
            active,
            idle,
            dropped: this.dropped,
            evicted: this.evicted,
            capacity: this._capacity,
        };
    }
    /** Current number of slots (active + idle). */
    get size() {
        return this.slots.length;
    }
    /** Current capacity. */
    get capacity() {
        return this._capacity;
    }
    /**
     * FIX 1: Update capacity. When reducing capacity, evict oldest slots
     * until size equals the new capacity.
     */
    setCapacity(capacity) {
        this._capacity = capacity;
        // Trim excess slots when reducing capacity
        while (this.slots.length > this._capacity) {
            const evictedSlot = this.evictLRU();
            if (!evictedSlot)
                break;
        }
    }
    /** Clear all slots. Returns count of active commands dropped. */
    clear() {
        let activeDropped = 0;
        for (const slot of this.slots) {
            if (slot.active)
                activeDropped++;
        }
        this.slots.length = 0;
        return activeDropped;
    }
}
