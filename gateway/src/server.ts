/**
 * Gateway server entry point.
 *
 * Phase 8: graceful shutdown on SIGINT/SIGTERM, 127.0.0.1 bind by default.
 */

import { buildApp } from './app.js';
import { config } from './config.js';
import { Logger, createLogger } from './util/logger.js';

const pino = createLogger(config.logLevel);
const logger = new Logger(pino);

// FIX 1 (Phase 13): Only expose /mock/* routes when the gateway is running in
// mock provider mode. FIX 6 (Phase 14 review): derive from Zod-validated config
// instead of reading process.env directly.
const isMockProvider = config.liveProvider === 'mock';
const isTikfinity = config.liveProvider === 'tikfinity';

const app = buildApp({
  enableWs: true,
  enableDirector: true,
  enableMockRoutes: isMockProvider,
  enableGiftEconomy: true,
  enableFreeEngagement: true,
  enableViewerRoutes: true,
  enableTikfinity: isTikfinity,
  enableVFX: true,
  enableRunbook: true,
  enableDiagnostics: true,
});

let shuttingDown = false;

/**
 * Flushes the pipeline (command queue + event bus) and logs what's dropped.
 * Shared by signal handlers and the HTTP shutdown route.
 */
export function flushPipeline(): number {
  if (!app.pipeline) return 0;
  const queueDropped = app.pipeline.commandQueue.clear();
  app.pipeline.eventBus.clear();
  if (queueDropped > 0) {
    logger.warn('shutdown', `Command queue flushed: ${queueDropped} commands dropped`, { dropped: queueDropped });
    app.log.warn({ dropped: queueDropped }, `Command queue flushed: ${queueDropped} commands dropped`);
  }
  return queueDropped;
}

/**
 * Graceful shutdown: stop accepting new connections, drain in-flight requests,
 * flush event bus + command queue, then exit.
 *
 * The shutdown timeout timer is created HERE (not at module scope) so it only
 * fires when a shutdown signal is actually received.
 */
export async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info('shutdown', `Received ${signal}, starting graceful shutdown...`);
  app.log.info(`Received ${signal}, starting graceful shutdown...`);

  // Flush pipeline
  flushPipeline();

  // Start the shutdown timeout timer ONLY during shutdown
  const shutdownTimer = setTimeout(() => {
    logger.error('shutdown', 'Shutdown timeout exceeded, forcing exit');
    app.log.error('Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, config.shutdownTimeoutMs);
  shutdownTimer.unref();

  try {
    // Fastify close: stops accepting new connections and waits for in-flight requests
    await app.close();
    logger.info('shutdown', 'Graceful shutdown complete');
    app.log.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('shutdown', 'Error during graceful shutdown', { error: String(error) });
    app.log.error(error, 'Error during graceful shutdown');
    process.exit(1);
  }
}

// Register signal handlers
process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});

try {
  logger.info('gateway', `Gateway starting on ${config.host}:${config.gatewayPort}`);
  await app.listen({ host: config.host, port: config.gatewayPort });
  logger.info('gateway', `Gateway listening on ${config.host}:${config.gatewayPort}`);
  app.log.info(`Gateway listening on ${config.host}:${config.gatewayPort}`);
} catch (error) {
  logger.error('gateway', 'Gateway failed to start', { error: String(error) });
  app.log.error(error, 'Gateway failed to start');
  process.exit(1);
}
