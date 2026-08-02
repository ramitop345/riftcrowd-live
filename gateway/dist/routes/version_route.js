/**
 * Phase 18 — Version endpoint.
 *
 * GET /version — returns version, schema, node version, build time, and Godot version.
 * Public (no auth required).
 */
import { COMMAND_SCHEMA_VERSION } from '@riftcrowd/shared';
/** Build timestamp set at module load; represents the current build. */
const BUILD_TIME = new Date().toISOString();
export function getVersionInfo() {
    return {
        version: '1.0.0',
        schemaVersion: COMMAND_SCHEMA_VERSION,
        nodeVersion: process.version,
        buildTime: BUILD_TIME,
        godotVersion: '4.7.1',
    };
}
export function registerVersionRoute(app) {
    app.get('/version', () => {
        return getVersionInfo();
    });
}
