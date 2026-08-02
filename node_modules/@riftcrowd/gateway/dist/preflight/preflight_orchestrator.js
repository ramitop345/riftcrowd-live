/**
 * Phase 16 — Preflight Orchestrator.
 *
 * Runs a set of health and configuration checks before stream start.
 * Returns a structured result indicating overall pass/fail plus per-check details.
 */
// ---------------------------------------------------------------------------
// Individual check factories
// ---------------------------------------------------------------------------
/** Gateway health: verifies the gateway process is responsive. */
export function makeGatewayHealthCheck(fetchHealth) {
    return async () => {
        try {
            const result = await fetchHealth();
            if (result.status === 'ok') {
                return { name: 'gateway_health', ok: true, message: 'Gateway is healthy' };
            }
            return { name: 'gateway_health', ok: false, message: `Gateway status: ${result.status}` };
        }
        catch (err) {
            return { name: 'gateway_health', ok: false, message: `Gateway unreachable: ${String(err)}` };
        }
    };
}
/** Dashboard reachable: HTTP GET to the dashboard dev server. */
export function makeDashboardReachableCheck(fetchDashboard) {
    return async () => {
        try {
            const reachable = await fetchDashboard();
            if (reachable) {
                return { name: 'dashboard_reachable', ok: true, message: 'Dashboard is reachable on port 5173' };
            }
            return { name: 'dashboard_reachable', ok: false, message: 'Dashboard returned non-200 status' };
        }
        catch (err) {
            return { name: 'dashboard_reachable', ok: false, message: `Dashboard unreachable: ${String(err)}` };
        }
    };
}
/** Provider check: Mock adapter running or TikFinity reachable. */
export function makeProviderCheck(provider, checkMock, checkTikfinity) {
    return async () => {
        if (provider === 'mock') {
            const running = checkMock();
            return running
                ? { name: 'provider', ok: true, message: 'MockLiveAdapter is active' }
                : { name: 'provider', ok: false, message: 'MockLiveAdapter is not running' };
        }
        if (provider === 'tikfinity') {
            try {
                const reachable = await checkTikfinity();
                return reachable
                    ? { name: 'provider', ok: true, message: 'TikFinity adapter is connected' }
                    : { name: 'provider', ok: false, message: 'TikFinity adapter is not connected' };
            }
            catch (err) {
                return { name: 'provider', ok: false, message: `TikFinity unreachable: ${String(err)}` };
            }
        }
        return { name: 'provider', ok: false, message: `Unknown provider: ${provider}` };
    };
}
/** Config valid: all required config fields present. */
export function makeConfigCheck(validateConfig) {
    return async () => {
        const result = validateConfig();
        if (result.ok) {
            return { name: 'config_valid', ok: true, message: 'All required config fields present' };
        }
        return { name: 'config_valid', ok: false, message: `Config errors: ${result.errors.join('; ')}` };
    };
}
/** Audio assets present: placeholder check. */
export function makeAudioCheck(checkAudio) {
    return async () => {
        const result = checkAudio();
        return { name: 'audio_assets', ok: result.ok, message: result.message };
    };
}
/** VFX config valid. */
export function makeVFXConfigCheck(validateVFX) {
    return async () => {
        const result = validateVFX();
        if (result.ok) {
            return { name: 'vfx_config', ok: true, message: 'VFX configuration is valid' };
        }
        return { name: 'vfx_config', ok: false, message: `VFX config errors: ${result.errors.join('; ')}` };
    };
}
// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
export class PreflightOrchestrator {
    checks = [];
    timeoutMs;
    constructor(timeoutMs = 5000) {
        this.timeoutMs = timeoutMs;
    }
    /** Register a check function. */
    addCheck(check) {
        this.checks.push(check);
    }
    /**
     * Wrap a check in Promise.race with a timeout.
     * FIX 7: Hung checks no longer block indefinitely.
     */
    async runWithTimeout(check) {
        return Promise.race([
            check(),
            new Promise((resolve) => setTimeout(() => resolve({ name: check.name ?? 'unknown', ok: false, message: `Check timed out after ${this.timeoutMs}ms` }), this.timeoutMs)),
        ]);
    }
    /** Run all registered checks and return aggregate result. */
    async run() {
        const results = [];
        for (const check of this.checks) {
            try {
                results.push(await this.runWithTimeout(check));
            }
            catch (err) {
                results.push({
                    name: 'unknown',
                    ok: false,
                    message: `Check threw: ${String(err)}`,
                });
            }
        }
        return {
            ok: results.every((r) => r.ok),
            checks: results,
        };
    }
    /** Return current check count. */
    get checkCount() {
        return this.checks.length;
    }
}
