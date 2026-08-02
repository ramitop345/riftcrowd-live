/**
 * Phase 15 — Readability HTTP routes.
 *
 * Token-protected endpoints:
 *   GET  /readability/config   — returns current readability config
 *   POST /readability/config   — updates config (hot-reload)
 */
import { timingSafeEqual } from 'node:crypto';
import { ReadabilityConfigSchema } from '../readability/readability_config.js';
// ---------------------------------------------------------------------------
// Token validation
// ---------------------------------------------------------------------------
function getToken() {
    return process.env['LOCAL_SESSION_TOKEN'];
}
function validateToken(request, reply) {
    const token = getToken();
    if (!token) {
        reply
            .status(503)
            .send({ error: 'Gateway commands not configured (LOCAL_SESSION_TOKEN unset)' });
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
    if (providedBuf.length !== expectedBuf.length ||
        !timingSafeEqual(providedBuf, expectedBuf)) {
        reply.status(401).send({ error: 'Invalid token' });
        return false;
    }
    return true;
}
export function registerReadabilityRoutes(app, opts) {
    const { orchestrator } = opts;
    // -------------------------------------------------------------------------
    // GET /readability/config
    // -------------------------------------------------------------------------
    app.get('/readability/config', (request, reply) => {
        if (!validateToken(request, reply))
            return;
        reply.send(orchestrator.getConfig());
    });
    // -------------------------------------------------------------------------
    // POST /readability/config — hot-reload
    // -------------------------------------------------------------------------
    app.post('/readability/config', (request, reply) => {
        if (!validateToken(request, reply))
            return;
        const parseResult = ReadabilityConfigSchema.safeParse(request.body);
        if (!parseResult.success) {
            reply.status(400).send({
                error: 'Invalid readability config',
                details: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
            });
            return;
        }
        orchestrator.reloadConfig(parseResult.data);
        reply.send({ ok: true, message: 'Readability config hot-reloaded' });
    });
}
