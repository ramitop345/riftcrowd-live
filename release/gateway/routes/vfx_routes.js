/**
 * Phase 15 — VFX HTTP routes.
 *
 * Token-protected endpoints:
 *   GET  /vfx/config   — returns current VFX config
 *   POST /vfx/config   — updates config (hot-reload)
 *   GET  /vfx/stats    — returns pool stats
 *   POST /vfx/trigger  — test button: trigger a VFX event
 */
import { timingSafeEqual } from 'node:crypto';
import { VFXConfigSchema } from '../vfx/vfx_config.js';
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
export function registerVFXRoutes(app, opts) {
    const { orchestrator } = opts;
    // -------------------------------------------------------------------------
    // GET /vfx/config
    // -------------------------------------------------------------------------
    app.get('/vfx/config', (request, reply) => {
        if (!validateToken(request, reply))
            return;
        reply.send(orchestrator.getConfig());
    });
    // -------------------------------------------------------------------------
    // POST /vfx/config — hot-reload
    // -------------------------------------------------------------------------
    app.post('/vfx/config', (request, reply) => {
        if (!validateToken(request, reply))
            return;
        const parseResult = VFXConfigSchema.safeParse(request.body);
        if (!parseResult.success) {
            reply.status(400).send({
                error: 'Invalid VFX config',
                details: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
            });
            return;
        }
        orchestrator.reloadConfig(parseResult.data);
        reply.send({ ok: true, message: 'VFX config hot-reloaded' });
    });
    // -------------------------------------------------------------------------
    // GET /vfx/stats
    // -------------------------------------------------------------------------
    app.get('/vfx/stats', (request, reply) => {
        if (!validateToken(request, reply))
            return;
        reply.send(orchestrator.getStats());
    });
    // -------------------------------------------------------------------------
    // POST /vfx/trigger — test button
    // -------------------------------------------------------------------------
    app.post('/vfx/trigger', (request, reply) => {
        if (!validateToken(request, reply))
            return;
        const body = request.body;
        const eventType = typeof body?.['eventType'] === 'string' ? body['eventType'] : 'like';
        const viewerId = typeof body?.['viewerId'] === 'string' ? body['viewerId'] : 'test-viewer';
        const event = {
            schemaVersion: 1,
            id: `vfx_trigger_${Date.now()}`,
            provider: 'mock',
            type: eventType,
            receivedAt: new Date().toISOString(),
            user: { id: viewerId, handle: `@${viewerId}`, displayName: viewerId },
            rawHash: `sha256:mock_trigger_${Date.now()}`,
        };
        const result = orchestrator.triggerVFX(event);
        reply.send({
            ok: true,
            commandsEmitted: result.commands.length,
            dropped: result.dropped,
            commands: result.commands,
        });
    });
}
