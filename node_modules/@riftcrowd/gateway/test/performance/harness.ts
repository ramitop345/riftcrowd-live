/**
 * Phase 17 — Performance Test Harness.
 *
 * Helpers for running extended mock sessions and collecting metrics.
 * Used by soak, burst, reconnect, and other performance tests.
 */

import type { NormalizedLiveEvent } from '@riftcrowd/shared';
import { Pipeline, type ProcessResult } from '../../src/pipeline/pipeline.js';
import { VFXOrchestrator } from '../../src/vfx/vfx_orchestrator.js';
import { VFX_DEFAULTS, type VFXConfig } from '../../src/vfx/vfx_config.js';
import { CommandPool } from '../../src/pooling/command_pool.js';
import { WSMessageBuffer } from '../../src/pooling/ws_message_buffer.js';

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export interface SessionMetrics {
  /** Duration of the session in ms. */
  durationMs: number;
  /** Total events emitted. */
  eventsEmitted: number;
  /** Total events processed by pipeline. */
  eventsProcessed: number;
  /** Total commands produced. */
  commandsProduced: number;
  /** Total events dropped (malformed, rate-limited, deduped). */
  eventsDropped: number;
  /** Peak command queue length. */
  peakQueueLength: number;
  /** Peak VFX pool active count. */
  peakVFXActive: number;
  /** Peak WS message buffer size. */
  peakWSBufferSize: number;
  /** Memory usage at start (heap used in MB). */
  memoryStartMB: number;
  /** Memory usage at end (heap used in MB). */
  memoryEndMB: number;
  /** Memory growth in MB. */
  memoryGrowthMB: number;
  /** Event processing rate (events/sec). */
  eventsPerSecond: number;
  /** Number of unhandled rejections caught. */
  unhandledRejections: number;
  /** Pipeline stats at end. */
  pipelineStats: ReturnType<Pipeline['getStats']>;
  /** VFX pool stats at end. */
  vfxStats: ReturnType<VFXOrchestrator['getStats']>;
  /** Command pool stats at end. */
  commandPoolStats: ReturnType<CommandPool['getStats']>;
  /** WS buffer stats at end. */
  wsBufferStats: ReturnType<WSMessageBuffer['getStats']>;
  /** Per-round event counts (if rounds tracked). */
  roundsCompleted: number;
}

// ---------------------------------------------------------------------------
// Event generators
// ---------------------------------------------------------------------------

let eventCounter = 0;

function makeId(): string {
  eventCounter++;
  return `evt_perf_${String(eventCounter).padStart(8, '0')}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

function makeHash(): string {
  return 'sha256:' + 'a'.repeat(64);
}

export function generateChatEvent(viewerId?: string): NormalizedLiveEvent {
  return {
    schemaVersion: 1,
    id: makeId(),
    provider: 'mock',
    type: 'chat',
    receivedAt: isoNow(),
    user: {
      id: viewerId ?? `viewer_${Math.floor(Math.random() * 1000)}`,
      handle: '@test',
      displayName: 'TestViewer',
    },
    comment: `hello ${eventCounter}`,
    rawHash: makeHash(),
  };
}

export function generateLikeEvent(viewerId?: string): NormalizedLiveEvent {
  return {
    schemaVersion: 1,
    id: makeId(),
    provider: 'mock',
    type: 'like',
    receivedAt: isoNow(),
    user: {
      id: viewerId ?? `viewer_${Math.floor(Math.random() * 1000)}`,
      handle: '@test',
      displayName: 'TestViewer',
    },
    likeCount: Math.floor(Math.random() * 50) + 1,
    rawHash: makeHash(),
  };
}

export function generateFollowEvent(viewerId?: string): NormalizedLiveEvent {
  return {
    schemaVersion: 1,
    id: makeId(),
    provider: 'mock',
    type: 'follow',
    receivedAt: isoNow(),
    user: {
      id: viewerId ?? `viewer_${Math.floor(Math.random() * 1000)}`,
      handle: '@test',
      displayName: 'TestViewer',
    },
    rawHash: makeHash(),
  };
}

export function generateGiftEvent(viewerId?: string, repeatCount?: number): NormalizedLiveEvent {
  return {
    schemaVersion: 1,
    id: makeId(),
    provider: 'mock',
    type: 'gift',
    receivedAt: isoNow(),
    user: {
      id: viewerId ?? `viewer_${Math.floor(Math.random() * 1000)}`,
      handle: '@test',
      displayName: 'TestViewer',
    },
    gift: {
      id: 'gift_rose',
      name: 'Rose',
      repeatCount: repeatCount ?? Math.floor(Math.random() * 10) + 1,
      streakId: `streak_${eventCounter}`,
      streakEnded: true,
      providerValue: 1,
    },
    rawHash: makeHash(),
  };
}

export function generateShareEvent(viewerId?: string): NormalizedLiveEvent {
  return {
    schemaVersion: 1,
    id: makeId(),
    provider: 'mock',
    type: 'share',
    receivedAt: isoNow(),
    user: {
      id: viewerId ?? `viewer_${Math.floor(Math.random() * 1000)}`,
      handle: '@test',
      displayName: 'TestViewer',
    },
    rawHash: makeHash(),
  };
}

/** Generate a random event based on weighted distribution. */
export function generateRandomEvent(): NormalizedLiveEvent {
  const r = Math.random();
  if (r < 0.4) return generateChatEvent();
  if (r < 0.6) return generateLikeEvent();
  if (r < 0.75) return generateFollowEvent();
  if (r < 0.9) return generateGiftEvent();
  return generateShareEvent();
}

/** Reset the global event counter (call before each test). */
export function resetPerfEventCounter(): void {
  eventCounter = 0;
}

// ---------------------------------------------------------------------------
// Extended session runner
// ---------------------------------------------------------------------------

export interface ExtendedSessionOptions {
  /** Duration of the session in ms. Default: 5000. */
  durationMs?: number;
  /** Events per second to emit. Default: 20. */
  eventRate?: number;
  /** VFX config overrides. */
  vfxConfig?: Partial<VFXConfig>;
  /** Pipeline command queue capacity. Default: 500. */
  commandQueueCapacity?: number;
  /** Whether to use VFX orchestrator. Default: true. */
  useVFX?: boolean;
  /** Custom event generator. */
  eventGenerator?: () => NormalizedLiveEvent;
}

/**
 * Runs an extended mock session with the pipeline and optional VFX orchestrator.
 * Emits events at the specified rate for the specified duration and collects metrics.
 */
export async function runExtendedSession(
  options: ExtendedSessionOptions = {},
): Promise<SessionMetrics> {
  const {
    durationMs = 5000,
    eventRate = 20,
    vfxConfig,
    commandQueueCapacity = 500,
    useVFX = true,
    eventGenerator = generateRandomEvent,
  } = options;

  resetPerfEventCounter();

  // Set up pipeline
  const pipeline = new Pipeline({
    commandQueueCapacity,
    eventBusCapacity: 2000,
    rateLimitGlobal: 100000,
    rateLimitPerViewer: 10000,
    rateLimitBurst: 50000,
  });

  // Set up VFX orchestrator
  const vfxCfg: VFXConfig = {
    ...VFX_DEFAULTS,
    ...vfxConfig,
    pool: { ...VFX_DEFAULTS.pool, ...(vfxConfig?.pool ?? {}) },
    safeZone: { ...VFX_DEFAULTS.safeZone, ...(vfxConfig?.safeZone ?? {}) },
  };
  const vfx = useVFX ? new VFXOrchestrator(vfxCfg) : null;

  // Set up pooling
  const commandPool = new CommandPool(5000);
  const wsBuffer = new WSMessageBuffer(1000);

  // Metrics tracking
  let eventsEmitted = 0;
  let commandsProduced = 0;
  let eventsDropped = 0;
  let peakQueueLength = 0;
  let peakVFXActive = 0;
  let peakWSBufferSize = 0;
  let unhandledRejections = 0;
  let roundsCompleted = 0;

  // Track unhandled rejections
  const rejectionHandler = (): void => {
    unhandledRejections++;
  };
  process.on('unhandledRejection', rejectionHandler);

  const memStart = process.memoryUsage();
  const startTime = Date.now();

  // Emit events at the specified rate
  const intervalMs = 1000 / eventRate;
  const totalEvents = Math.floor(durationMs / intervalMs);

  return new Promise<SessionMetrics>((resolve) => {
    let eventIndex = 0;

    const emitInterval = setInterval(() => {
      if (eventIndex >= totalEvents) {
        clearInterval(emitInterval);

        // Collect final metrics
        const endTime = Date.now();
        const memEnd = process.memoryUsage();
        const actualDuration = endTime - startTime;

        process.removeListener('unhandledRejection', rejectionHandler);

        const pipelineStats = pipeline.getStats();
        const vfxStats = vfx ? vfx.getStats() : { active: 0, idle: 0, dropped: 0, perType: { particle: { active: 0, idle: 0 }, flash: { active: 0, idle: 0 }, trail: { active: 0, idle: 0 }, overlay: { active: 0, idle: 0 } } };
        const cmdPoolStats = commandPool.getStats();
        const wsBufStats = wsBuffer.getStats();

        resolve({
          durationMs: actualDuration,
          eventsEmitted,
          eventsProcessed: pipelineStats.processed,
          commandsProduced,
          eventsDropped,
          peakQueueLength,
          peakVFXActive,
          peakWSBufferSize,
          memoryStartMB: Math.round(memStart.heapUsed / 1024 / 1024),
          memoryEndMB: Math.round(memEnd.heapUsed / 1024 / 1024),
          memoryGrowthMB: Math.round((memEnd.heapUsed - memStart.heapUsed) / 1024 / 1024),
          eventsPerSecond: eventsEmitted > 0 ? Math.round(eventsEmitted / (actualDuration / 1000)) : 0,
          unhandledRejections,
          pipelineStats,
          vfxStats,
          commandPoolStats: cmdPoolStats,
          wsBufferStats: wsBufStats,
          roundsCompleted,
        });
        return;
      }

      // Emit an event
      const event = eventGenerator();
      eventsEmitted++;

      // Process through pipeline
      const result: ProcessResult = pipeline.process(event);

      if (result.dropped) {
        eventsDropped++;
      }

      // Process through VFX if enabled
      if (vfx && !result.dropped) {
        const vfxResult = vfx.triggerVFX(event);
        if (vfxResult.commands.length > 0) {
          commandsProduced += vfxResult.commands.length;
        }
      }

      commandsProduced += result.commands.length;

      // Track pool/buffer usage
      for (const cmd of result.commands) {
        const pooled = commandPool.acquire(cmd);
        if (pooled) {
          wsBuffer.enqueue(cmd);
          // Simulate quick release
          commandPool.release(pooled);
        }
      }

      // FIX 4/10: Track rounds — increment every 100 events processed
      if (eventsEmitted > 0 && eventsEmitted % 100 === 0) {
        roundsCompleted++;
      }

      // Update peaks
      peakQueueLength = Math.max(peakQueueLength, pipeline.commandQueue.size);
      if (vfx) {
        const stats = vfx.getStats();
        peakVFXActive = Math.max(peakVFXActive, stats.active);
      }
      peakWSBufferSize = Math.max(peakWSBufferSize, wsBuffer.size);

      // Drain command queue periodically
      pipeline.commandQueue.clear();

      eventIndex++;
    }, intervalMs);
  });
}
