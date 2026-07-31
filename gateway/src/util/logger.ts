/**
 * Structured logging helpers for the gateway.
 *
 * Wraps pino (Fastify's default logger) with typed component-tagged helpers.
 * Each log entry includes: timestamp, level, msg, component, and optional fields.
 */

import pino, { type Logger as PinoLogger } from 'pino';

/** Components that can tag log entries for filtering and search. */
export type LogComponent =
  | 'gateway'
  | 'pipeline'
  | 'event_bus'
  | 'normalizer'
  | 'dedupe'
  | 'rate_limiter'
  | 'rules'
  | 'command_queue'
  | 'director'
  | 'viewer'
  | 'routes'
  | 'shutdown';

/**
 * Creates a pino logger instance configured for JSON output.
 *
 * @param level — minimum log level (default 'info').
 * @returns a pino Logger.
 */
export function createLogger(level: string = 'info'): PinoLogger {
  return pino({
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

/**
 * Typed log helpers wrapping pino. Each method adds a `component` field to
 * the log entry, making it easy to filter logs by subsystem.
 */
export class Logger {
  private readonly inner: PinoLogger;

  constructor(inner: PinoLogger) {
    this.inner = inner;
  }

  debug(component: LogComponent, msg: string, fields?: Record<string, unknown>): void {
    this.inner.debug({ component, ...fields }, msg);
  }

  info(component: LogComponent, msg: string, fields?: Record<string, unknown>): void {
    this.inner.info({ component, ...fields }, msg);
  }

  warn(component: LogComponent, msg: string, fields?: Record<string, unknown>): void {
    this.inner.warn({ component, ...fields }, msg);
  }

  error(component: LogComponent, msg: string, fields?: Record<string, unknown>): void {
    this.inner.error({ component, ...fields }, msg);
  }

  fatal(component: LogComponent, msg: string, fields?: Record<string, unknown>): void {
    this.inner.fatal({ component, ...fields }, msg);
  }

  /** Expose the underlying pino instance for Fastify integration. */
  get pino(): PinoLogger {
    return this.inner;
  }
}
