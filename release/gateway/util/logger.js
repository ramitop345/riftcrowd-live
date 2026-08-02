/**
 * Structured logging helpers for the gateway.
 *
 * Wraps pino (Fastify's default logger) with typed component-tagged helpers.
 * Each log entry includes: timestamp, level, msg, component, and optional fields.
 */
import pino from 'pino';
/**
 * Creates a pino logger instance configured for JSON output.
 *
 * @param level — minimum log level (default 'info').
 * @returns a pino Logger.
 */
export function createLogger(level = 'info') {
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
    inner;
    constructor(inner) {
        this.inner = inner;
    }
    debug(component, msg, fields) {
        this.inner.debug({ component, ...fields }, msg);
    }
    info(component, msg, fields) {
        this.inner.info({ component, ...fields }, msg);
    }
    warn(component, msg, fields) {
        this.inner.warn({ component, ...fields }, msg);
    }
    error(component, msg, fields) {
        this.inner.error({ component, ...fields }, msg);
    }
    fatal(component, msg, fields) {
        this.inner.fatal({ component, ...fields }, msg);
    }
    /** Expose the underlying pino instance for Fastify integration. */
    get pino() {
        return this.inner;
    }
}
