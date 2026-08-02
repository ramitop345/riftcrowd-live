/**
 * Phase 15 — Audio HTTP routes.
 *
 * Token-protected endpoints:
 *   GET  /audio/config   — returns current audio config
 *   POST /audio/config   — updates config (hot-reload)
 *   POST /audio/trigger  — test button: trigger an audio event
 */
import { timingSafeEqual } from 'node:crypto';
import { AudioConfigSchema } from '../audio/audio_config.js';
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
export function registerAudioRoutes(app, opts) {
    const { orchestrator } = opts;
    // -------------------------------------------------------------------------
    // GET /audio/config
    // -------------------------------------------------------------------------
    app.get('/audio/config', (request, reply) => {
        if (!validateToken(request, reply))
            return;
        reply.send(orchestrator.getConfig());
    });
    // -------------------------------------------------------------------------
    // POST /audio/config — hot-reload
    // -------------------------------------------------------------------------
    app.post('/audio/config', (request, reply) => {
        if (!validateToken(request, reply))
            return;
        const parseResult = AudioConfigSchema.safeParse(request.body);
        if (!parseResult.success) {
            reply.status(400).send({
                error: 'Invalid audio config',
                details: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
            });
            return;
        }
        orchestrator.reloadConfig(parseResult.data);
        reply.send({ ok: true, message: 'Audio config hot-reloaded' });
    });
    // -------------------------------------------------------------------------
    // POST /audio/trigger — test button
    // -------------------------------------------------------------------------
    app.post('/audio/trigger', (request, reply) => {
        if (!validateToken(request, reply))
            return;
        const body = request.body;
        const eventType = typeof body?.['eventType'] === 'string' ? body['eventType'] : 'like';
        const viewerId = typeof body?.['viewerId'] === 'string' ? body['viewerId'] : 'test-viewer';
        const event = {
            schemaVersion: 1,
            id: `audio_trigger_${Date.now()}`,
            provider: 'mock',
            type: eventType,
            receivedAt: new Date().toISOString(),
            user: { id: viewerId, handle: `@${viewerId}`, displayName: viewerId },
            rawHash: `sha256:mock_audio_trigger_${Date.now()}`,
        };
        const result = orchestrator.triggerAudio(event);
        reply.send({
            ok: true,
            commandsEmitted: result.commands.length,
            commands: result.commands,
        });
    });
}
