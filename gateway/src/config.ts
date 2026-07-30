import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment contract for the gateway. Every value has a safe localhost default so the
 * gateway boots in mock mode with no .env file present.
 */
const EnvSchema = z.object({
  HOST: z.string().min(1).default('127.0.0.1'),
  GATEWAY_PORT: z.coerce.number().int().positive().default(8787),
  GAME_WS_PORT: z.coerce.number().int().positive().default(8788),
  LOCAL_SESSION_TOKEN: z.string().min(1).default('change-me'),
  LIVE_PROVIDER: z.enum(['mock']).default('mock'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
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
} as const;

export type GatewayConfig = typeof config;
