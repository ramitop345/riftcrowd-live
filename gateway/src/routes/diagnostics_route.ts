/**
 * Phase 18 — Diagnostics export route.
 *
 * POST /diagnostics/export — collects config (redacted), recent logs, system info,
 * and health check results. Packages into a ZIP file and returns the file path.
 *
 * Token-protected.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWriteStream } from 'node:fs';
import { sanitizeConfig } from '../config.js';
import type { GatewayConfig } from '../config.js';
import archiver from 'archiver';

function getToken(): string | undefined {
  return process.env['LOCAL_SESSION_TOKEN'];
}

function validateToken(request: FastifyRequest, reply: FastifyReply): boolean {
  const token = getToken();
  if (!token) {
    reply.status(503).send({ error: 'Gateway commands not configured (LOCAL_SESSION_TOKEN unset)' });
    return false;
  }

  const authHeader = request.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Missing or malformed Authorization header' });
    return false;
  }

  const provided = authHeader.slice(7);
  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(token, 'utf8');
  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    reply.status(401).send({ error: 'Invalid token' });
    return false;
  }

  return true;
}

export interface RegisterDiagnosticsOptions {
  config: GatewayConfig;
  logDir?: string;
}

/** Collect system info (OS, Node version, memory). */
function collectSystemInfo(): Record<string, unknown> {
  return {
    os: process.platform,
    osRelease: process.release?.name ?? 'unknown',
    arch: process.arch,
    nodeVersion: process.version,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    cpuCount: undefined, // Avoid importing os module at module scope
    timestamp: new Date().toISOString(),
  };
}

/** Collect redacted config. */
function collectRedactedConfig(cfg: GatewayConfig): Record<string, unknown> {
  return sanitizeConfig(cfg);
}

/** Read recent log lines from log directory. */
function collectRecentLogs(logDir: string, maxLines: number = 1000): string[] {
  const lines: string[] = [];

  if (!existsSync(logDir)) {
    return ['No log directory found at: ' + logDir];
  }

  try {
    const files = readdirSync(logDir).filter((f) => f.endsWith('.log')).sort().reverse();

    for (const file of files.slice(0, 5)) {
      // Read last 5 log files
      try {
        const content = readFileSync(join(logDir, file), 'utf8');
        const fileLines = content.split('\n');
        lines.push(`=== ${file} ===`);
        lines.push(...fileLines.slice(-maxLines));
      } catch {
        lines.push(`Could not read: ${file}`);
      }
    }
  } catch {
    lines.push('Error reading log directory');
  }

  return lines.slice(-maxLines);
}

/** Health check results. */
function collectHealthCheck(): Record<string, unknown> {
  return {
    gateway: { ok: true, status: 'running' },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Creates a ZIP file containing diagnostic information.
 * Returns the path to the created ZIP file.
 */
async function createDiagnosticZip(logDir: string, cfg: GatewayConfig): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const zipDir = logDir;
  mkdirSync(zipDir, { recursive: true });
  const zipPath = join(zipDir, `diagnostics-${timestamp}.zip`);

  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      resolve(zipPath);
    });

    archive.on('error', (err: Error) => {
      reject(err);
    });

    archive.pipe(output);

    // Add config (redacted)
    const configJson = JSON.stringify(collectRedactedConfig(cfg), null, 2);
    archive.append(configJson, { name: 'config.json' });

    // Add system info
    const systemInfo = JSON.stringify(collectSystemInfo(), null, 2);
    archive.append(systemInfo, { name: 'system-info.json' });

    // Add recent logs
    const logs = collectRecentLogs(logDir);
    archive.append(logs.join('\n'), { name: 'recent-logs.txt' });

    // Add health check
    const healthCheck = JSON.stringify(collectHealthCheck(), null, 2);
    archive.append(healthCheck, { name: 'health-check.json' });

    void archive.finalize();
  });
}

export function registerDiagnosticsRoute(
  app: FastifyInstance,
  opts: RegisterDiagnosticsOptions,
): void {
  const { config: cfg } = opts;

  // Default log directory relative to gateway root
  const defaultLogDir = opts.logDir ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'logs');

  app.post('/diagnostics/export', async (request, reply) => {
    if (!validateToken(request, reply)) return;

    try {
      const zipPath = await createDiagnosticZip(defaultLogDir, cfg);
      reply.send({ ok: true, path: zipPath });
    } catch (err: unknown) {
      reply.status(500).send({ error: 'Failed to create diagnostic export', details: String(err) });
    }
  });

  // Also add GET version here since it's diagnostic info
  app.get('/diagnostics/info', () => {
    return {
      config: collectRedactedConfig(cfg),
      system: collectSystemInfo(),
      health: collectHealthCheck(),
    };
  });
}
