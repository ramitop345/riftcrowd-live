import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment contract for the gateway. Every value has a safe localhost default so the
 * gateway boots in mock mode with no .env file present.
 *
 * Phase 8 adds pipeline configuration (dedupe, rate limits, queue sizes, event bus).
 * Phase 14 adds TikFinity provider configuration.
 */
const EnvSchema = z.object({
  HOST: z.string().min(1).default('127.0.0.1'),
  GATEWAY_PORT: z.coerce.number().int().positive().default(8787),
  GAME_WS_PORT: z.coerce.number().int().positive().default(8788),
  LOCAL_SESSION_TOKEN: z.string().min(1).default('change-me'),
  LIVE_PROVIDER: z.enum(['mock', 'tikfinity']).default('mock'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(10_000),

  // Pipeline configuration
  PIPELINE_DEDUPE_CAPACITY: z.coerce.number().int().positive().default(10_000),
  PIPELINE_RATE_LIMIT_PER_VIEWER: z.coerce.number().int().positive().default(10),
  PIPELINE_RATE_LIMIT_BURST: z.coerce.number().int().positive().default(50),
  PIPELINE_RATE_LIMIT_GLOBAL: z.coerce.number().int().positive().default(1000),
  PIPELINE_COMMAND_QUEUE_CAPACITY: z.coerce.number().int().positive().default(500),
  PIPELINE_EVENT_BUS_CAPACITY: z.coerce.number().int().positive().default(1000),

  // Phase 10: WebSocket configuration
  WS_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  WS_HEARTBEAT_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  WS_RETRY_BUFFER_CAPACITY: z.coerce.number().int().positive().default(1000),
  WS_MAX_RECONNECT_BACKOFF_MS: z.coerce.number().int().positive().default(30000),
  WS_IDEMPOTENCY_WINDOW_SIZE: z.coerce.number().int().positive().default(500),

  // Phase 14: TikFinity provider configuration
  // FIX 7: validate WebSocket protocol scheme
  TIKFINITY_URL: z.string().min(1).regex(/^wss?:\/\//, 'Must start with ws:// or wss://').default('ws://127.0.0.1:23184/ws'),
  TIKFINITY_TOKEN: z.string().optional(),
  TIKFINITY_RECONNECT_MS: z.coerce.number().int().positive().default(5000),
  TIKFINITY_HEARTBEAT_MS: z.coerce.number().int().positive().default(30000),
});

const env = EnvSchema.parse(process.env);

/** Validated, immutable gateway configuration derived from the environment. */
export const config = {
  host: env.HOST,
  gatewayPort: env.GATEWAY_PORT,
  gameWsPort: env.GAME_WS_PORT,
  localSessionToken: env.LOCAL_SESSION_TOKEN,
  liveProvider: env.LIVE_PROVIDER,
  logLevel: env.LOG_LEVEL,
  shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
  pipeline: {
    dedupeCapacity: env.PIPELINE_DEDUPE_CAPACITY,
    rateLimitPerViewer: env.PIPELINE_RATE_LIMIT_PER_VIEWER,
    rateLimitBurst: env.PIPELINE_RATE_LIMIT_BURST,
    rateLimitGlobal: env.PIPELINE_RATE_LIMIT_GLOBAL,
    commandQueueCapacity: env.PIPELINE_COMMAND_QUEUE_CAPACITY,
    eventBusCapacity: env.PIPELINE_EVENT_BUS_CAPACITY,
  },
  ws: {
    heartbeatIntervalMs: env.WS_HEARTBEAT_INTERVAL_MS,
    heartbeatTimeoutMs: env.WS_HEARTBEAT_TIMEOUT_MS,
    retryBufferCapacity: env.WS_RETRY_BUFFER_CAPACITY,
    maxReconnectBackoffMs: env.WS_MAX_RECONNECT_BACKOFF_MS,
    idempotencyWindowSize: env.WS_IDEMPOTENCY_WINDOW_SIZE,
  },
  tikfinity: {
    url: env.TIKFINITY_URL,
    token: env.TIKFINITY_TOKEN,
    reconnectMs: env.TIKFINITY_RECONNECT_MS,
    heartbeatMs: env.TIKFINITY_HEARTBEAT_MS,
    enabled: env.LIVE_PROVIDER === 'tikfinity',
  },
} as const;

export type GatewayConfig = typeof config;

/**
 * Returns a sanitized copy of the config suitable for exposing via HTTP.
 * Secrets (LOCAL_SESSION_TOKEN) are stripped.
 */
export function sanitizeConfig(cfg: GatewayConfig): Record<string, unknown> {
  return {
    host: cfg.host,
    gatewayPort: cfg.gatewayPort,
    gameWsPort: cfg.gameWsPort,
    liveProvider: cfg.liveProvider,
    logLevel: cfg.logLevel,
    shutdownTimeoutMs: cfg.shutdownTimeoutMs,
    pipeline: { ...cfg.pipeline },
    ws: { ...cfg.ws },
    tikfinity: cfg.tikfinity
      ? {
          url: cfg.tikfinity.url,
          reconnectMs: cfg.tikfinity.reconnectMs,
          heartbeatMs: cfg.tikfinity.heartbeatMs,
          enabled: cfg.tikfinity.enabled,
          token: cfg.tikfinity.token ? '***REDACTED***' : undefined,
        }
      : undefined,
    localSessionToken: '***REDACTED***',
  };
}

/**
 * Applies a partial runtime config update to a mutable pipeline config object.
 * Only rate limits, dedupe capacity, and log level are runtime-reloadable.
 * Returns an array of validation errors (empty on success).
 */
export interface RuntimeConfigUpdate {
  rateLimitPerViewer?: number;
  rateLimitBurst?: number;
  rateLimitGlobal?: number;
  dedupeCapacity?: number;
  commandQueueCapacity?: number;
  eventBusCapacity?: number;
  logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
}

const RuntimeConfigSchema = z
  .object({
    rateLimitPerViewer: z.number().int().positive().optional(),
    rateLimitBurst: z.number().int().positive().optional(),
    rateLimitGlobal: z.number().int().positive().optional(),
    dedupeCapacity: z.number().int().positive().optional(),
    commandQueueCapacity: z.number().int().positive().optional(),
    eventBusCapacity: z.number().int().positive().optional(),
    logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
  })
  .strict();

export function validateRuntimeConfigUpdate(
  update: unknown,
): { ok: true; value: RuntimeConfigUpdate } | { ok: false; errors: string[] } {
  const result = RuntimeConfigSchema.safeParse(update);
  if (result.success) {
    return { ok: true, value: result.data as RuntimeConfigUpdate };
  }
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  };
}
