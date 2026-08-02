/**
 * Phase 16 — Fallback HTTP routes.
 *
 * Token-protected endpoints:
 *   GET  /fallback/status     — returns current fallback status
 *   POST /fallback/activate   — manually trigger fallback overlay
 *   POST /fallback/deactivate — manually deactivate fallback overlay
 */
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
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
// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const ActivateBodySchema = z.object({
    reason: z.enum([
        'gateway_disconnected',
        'provider_disconnected',
        'vfx_pool_exhausted',
        'audio_missing',
        'manual',
    ]).default('manual'),
}).strict();
export function registerFallbackRoutes(app, opts) {
    const { orchestrator } = opts;
    // -------------------------------------------------------------------------
    // GET /fallback/status
    // -------------------------------------------------------------------------
    app.get('/fallback/status', (request, reply) => {
        if (!validateToken(request, reply))
            return;
        reply.send(orchestrator.getStatus());
    });
    // -------------------------------------------------------------------------
    // POST /fallback/activate
    // -------------------------------------------------------------------------
    app.post('/fallback/activate', (request, reply) => {
        if (!validateToken(request, reply))
            return;
        const parseResult = ActivateBodySchema.safeParse(request.body ?? {});
        if (!parseResult.success) {
            reply.status(400).send({
                error: 'Invalid request body',
                details: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
            });
            return;
        }
        const reason = parseResult.data.reason;
        const cmd = orchestrator.activate(reason);
        reply.send({ ok: true, activated: true, reason, commandId: cmd.id });
    });
    // -------------------------------------------------------------------------
    // POST /fallback/deactivate
    // -------------------------------------------------------------------------
    app.post('/fallback/deactivate', (request, reply) => {
        if (!validateToken(request, reply))
            return;
        const cmd = orchestrator.deactivate('manual');
        if (!cmd) {
            reply.send({ ok: true, deactivated: false, message: 'Fallback was not active' });
            return;
        }
        reply.send({ ok: true, deactivated: true, commandId: cmd.id });
    });
}
