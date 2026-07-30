import { buildApp } from './app.js';
import { config } from './config.js';

const app = buildApp();

try {
  await app.listen({ host: config.host, port: config.gatewayPort });
  app.log.info(`Gateway listening on ${config.host}:${config.gatewayPort}`);
} catch (error) {
  app.log.error(error, 'Gateway failed to start');
  process.exit(1);
}
