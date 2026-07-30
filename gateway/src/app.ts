import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

import { config } from './config.js';

export interface BuildAppOptions {
  /** Set to false in tests to silence request logging. Defaults to true. */
  logger?: boolean;
}

/**
 * Creates the Fastify instance with all routes and plugins registered. Does not listen;
 * the caller (server.ts or a test via app.inject) decides how requests arrive.
 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger === false ? false : { level: config.logLevel },
  });

  // Dev-only permissive CORS; everything binds to localhost so exposure is limited.
  void app.register(cors, { origin: true });

  app.get('/health', () => ({
    status: 'ok',
    provider: config.liveProvider,
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  }));

  return app;
}
