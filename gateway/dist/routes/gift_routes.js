/**
 * Phase 11 — Gift Economy HTTP routes.
 *
 * Token-protected endpoints:
 *   GET  /gifts/config   — returns current gift economy config
 *   POST /gifts/config   — updates config (hot-reload)
 *   GET  /gifts/preview  — returns mapping preview table
 *   GET  /gifts/stats    — returns orchestrator stats
 */
import { timingSafeEqual } from 'node:crypto';
import { GiftEconomyConfigSchema } from '../gifts/gift_config.js';
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
export function registerGiftRoutes(app, opts) {
    const { giftEconomy } = opts;
    // -------------------------------------------------------------------------
    // GET /gifts/config
    // -------------------------------------------------------------------------
    app.get('/gifts/config', (request, reply) => {
        if (!validateToken(request, reply))
            return;
        reply.send(giftEconomy.getConfig());
    });
    // -------------------------------------------------------------------------
    // POST /gifts/config — hot-reload
    // -------------------------------------------------------------------------
    app.post('/gifts/config', (request, reply) => {
        if (!validateToken(request, reply))
            return;
        const parseResult = GiftEconomyConfigSchema.safeParse(request.body);
        if (!parseResult.success) {
            reply.status(400).send({
                error: 'Invalid gift economy config',
                details: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
            });
            return;
        }
        giftEconomy.reloadConfig(parseResult.data);
        reply.send({ ok: true, message: 'Gift economy config hot-reloaded' });
    });
    // -------------------------------------------------------------------------
    // GET /gifts/preview
    // -------------------------------------------------------------------------
    app.get('/gifts/preview', (request, reply) => {
        if (!validateToken(request, reply))
            return;
        reply.send({ mappings: giftEconomy.previewMappings() });
    });
    // -------------------------------------------------------------------------
    // GET /gifts/stats
    // -------------------------------------------------------------------------
    app.get('/gifts/stats', (request, reply) => {
        if (!validateToken(request, reply))
            return;
        reply.send(giftEconomy.getStats());
    });
}
