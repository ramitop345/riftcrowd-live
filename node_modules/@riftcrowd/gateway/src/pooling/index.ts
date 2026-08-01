/**
 * Phase 17 — Object Pooling Module.
 *
 * Bounded pools and buffers for the gateway:
 * - CommandPool: bounded pool for GameCommand objects (max 5000, LRU eviction).
 * - WSMessageBuffer: bounded buffer for outbound WS messages (max 1000, drop oldest).
 * - HTTPRequestPool: bounded pool for in-flight HTTP requests (max 100, reject with 429).
 *
 * All pools are bounded, configurable, and report stats.
 */

export { CommandPool, type CommandPoolStats } from './command_pool.js';
export { WSMessageBuffer, type WSMessageBufferStats } from './ws_message_buffer.js';
export { HTTPRequestPool, type HTTPRequestPoolStats } from './http_request_pool.js';
