/**
 * Phase 18 — RiftCrowd LIVE Launcher.
 *
 * Orchestrates gateway, dashboard, and Godot game startup in the correct order.
 * Provides graceful shutdown on SIGINT/SIGTERM.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { runConfigMigration } from './config_migration.js';
// ---------------------------------------------------------------------------
// CLI argument parsing and validation
// ---------------------------------------------------------------------------
const LauncherArgsSchema = z.object({
    mode: z.enum(['mock', 'prod']).default('mock'),
    port: z.coerce.number().int().positive().default(8787),
    bind: z.string().min(1).default('127.0.0.1'),
    skipDashboard: z.boolean().default(false),
    skipGodot: z.boolean().default(false),
    logDir: z.string().default('./logs'),
    releaseDir: z.string().optional(),
    dev: z.boolean().default(false),
}).strict();
function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--mode' && argv[i + 1]) {
            args['mode'] = argv[++i];
        }
        else if (arg === '--port' && argv[i + 1]) {
            args['port'] = argv[++i];
        }
        else if (arg === '--bind' && argv[i + 1]) {
            args['bind'] = argv[++i];
        }
        else if (arg === '--skip-dashboard') {
            args['skipDashboard'] = true;
        }
        else if (arg === '--skip-godot') {
            args['skipGodot'] = true;
        }
        else if (arg === '--log-dir' && argv[i + 1]) {
            args['logDir'] = argv[++i];
        }
        else if (arg === '--release-dir' && argv[i + 1]) {
            args['releaseDir'] = argv[++i];
        }
        else if (arg === '--dev') {
            args['dev'] = true;
        }
    }
    return LauncherArgsSchema.parse(args);
}
const managedProcesses = [];
function startProcess(name, command, args, env, _logFile, cwd) {
    const child = spawn(command, args, {
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        cwd: cwd ?? process.cwd(),
    });
    const managed = { name, process: child };
    managedProcesses.push(managed);
    // Pipe stdout/stderr (in production, would write to log file)
    if (child.stdout) {
        child.stdout.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg) {
                console.log(`[${name}] ${msg}`);
            }
        });
    }
    if (child.stderr) {
        child.stderr.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg) {
                console.error(`[${name}] ${msg}`);
            }
        });
    }
    child.on('exit', (code, signal) => {
        console.log(`[${name}] Process exited with code=${code}, signal=${signal}`);
        const idx = managedProcesses.indexOf(managed);
        if (idx >= 0)
            managedProcesses.splice(idx, 1);
    });
    return child;
}
// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
async function waitForHealth(url, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const response = await fetch(url);
            if (response.ok)
                return true;
        }
        catch {
            // Not ready yet
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
}
// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
let isShuttingDown = false;
async function gracefulShutdown(signal) {
    if (isShuttingDown)
        return;
    isShuttingDown = true;
    console.log(`\n[Launcher] Received ${signal}, initiating graceful shutdown...`);
    // Send SIGINT to all child processes
    for (const mp of managedProcesses) {
        if (mp.process.pid && !mp.process.killed) {
            console.log(`[Launcher] Sending SIGINT to ${mp.name} (PID: ${mp.process.pid})`);
            mp.process.kill('SIGINT');
        }
    }
    // Wait up to 5 seconds for graceful exit
    const shutdownTimeout = setTimeout(() => {
        console.log('[Launcher] Shutdown timeout exceeded, sending SIGKILL');
        for (const mp of managedProcesses) {
            if (mp.process.pid && !mp.process.killed) {
                mp.process.kill('SIGKILL');
            }
        }
    }, 5000);
    shutdownTimeout.unref();
    // Wait for all processes to exit
    await Promise.all(managedProcesses.map((mp) => new Promise((resolve) => {
        if (mp.process.killed || !mp.process.pid) {
            resolve();
            return;
        }
        mp.process.once('exit', () => resolve());
        // Fallback timeout
        setTimeout(() => resolve(), 6000);
    })));
    console.log('[Launcher] All processes stopped. Goodbye!');
    process.exit(0);
}
// ---------------------------------------------------------------------------
// Main launcher logic
// ---------------------------------------------------------------------------
async function main() {
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║         RiftCrowd LIVE Launcher v1.0.0                ║');
    console.log('║   Portrait TikTok LIVE Interactive Arena Game         ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');
    // Parse CLI args
    const args = parseArgs(process.argv.slice(2));
    console.log(`[Launcher] Mode: ${args.mode}`);
    console.log(`[Launcher] Port: ${args.port}`);
    console.log(`[Launcher] Bind: ${args.bind}`);
    console.log(`[Launcher] Skip Dashboard: ${args.skipDashboard}`);
    console.log(`[Launcher] Skip Godot: ${args.skipGodot}`);
    // Create log directory with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logDir = resolve(join(args.logDir, timestamp));
    mkdirSync(logDir, { recursive: true });
    console.log(`[Launcher] Log directory: ${logDir}`);
    // Run config migration first
    console.log('[Launcher] Running configuration migration...');
    const migrationResult = runConfigMigration();
    if (migrationResult.errors.length > 0) {
        console.warn('[Launcher] Config migration warnings:', migrationResult.errors);
    }
    else {
        console.log('[Launcher] Config migration completed successfully');
    }
    // Resolve paths relative to launcher
    const rootDir = resolve(join(import.meta.dirname, '..', '..'));
    const godotExe = join(rootDir, 'release', 'godot', 'RiftCrowd_LIVE.exe');
    // Resolve gateway entry point based on mode (dev vs release)
    const isDevMode = args.dev || !!process.env['RIFTCROWD_DEV'];
    let gatewayEntry;
    let gatewayCwd;
    if (isDevMode) {
        // Dev mode: run compiled gateway from workspace root
        gatewayEntry = join(rootDir, 'gateway', 'dist', 'server.js');
        gatewayCwd = rootDir;
    }
    else {
        // Release mode: run from release/gateway folder (server.js is in that folder)
        const releaseDir = args.releaseDir ?? join(rootDir, 'release');
        gatewayEntry = join(releaseDir, 'gateway', 'server.js');
        gatewayCwd = join(releaseDir, 'gateway');
    }
    // Start gateway
    console.log('[Launcher] Starting gateway...');
    console.log(`[Launcher] Gateway entry: ${gatewayEntry}`);
    const gatewayEnv = {
        HOST: args.bind,
        GATEWAY_PORT: String(args.port),
        LIVE_PROVIDER: args.mode === 'mock' ? 'mock' : 'tikfinity',
        LOCAL_SESSION_TOKEN: process.env['RIFTCROWD_TOKEN'] ?? 'change-me',
    };
    const gatewayProcess = startProcess('gateway', 'node', [gatewayEntry], gatewayEnv, join(logDir, 'gateway.log'), gatewayCwd);
    void gatewayProcess;
    // Wait for gateway health check
    const healthUrl = `http://${args.bind}:${args.port}/health`;
    console.log(`[Launcher] Waiting for gateway health at ${healthUrl}...`);
    const healthy = await waitForHealth(healthUrl);
    if (!healthy) {
        console.error('[Launcher] Gateway failed to become healthy within 30s');
        await gracefulShutdown('TIMEOUT');
        return;
    }
    console.log('[Launcher] Gateway is healthy!');
    // Start dashboard (if not skipped)
    if (!args.skipDashboard) {
        console.log('[Launcher] Dashboard available via gateway at http://' + args.bind + ':' + args.port + '/dashboard/');
        // Dashboard is served statically by the gateway in production
    }
    // Start Godot game (if not skipped)
    if (!args.skipGodot) {
        if (existsSync(godotExe)) {
            console.log('[Launcher] Starting Godot game...');
            const godotArgs = args.mode === 'mock' ? ['--mock'] : [];
            const godotProcess = startProcess('godot', godotExe, godotArgs, {}, join(logDir, 'godot.log'));
            void godotProcess;
        }
        else {
            console.log(`[Launcher] Godot executable not found at ${godotExe}`);
            console.log('[Launcher] Skipping Godot startup (export templates may not be installed)');
        }
    }
    // Print summary
    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║              RiftCrowd LIVE is Running!               ║');
    console.log('╠═══════════════════════════════════════════════════════╣');
    console.log(`║ Gateway:   http://${args.bind}:${args.port}/health         ║`);
    console.log(`║ Dashboard: http://${args.bind}:${args.port}/dashboard/     ║`);
    console.log(`║ Logs:      ${logDir}`);
    console.log('║                                                       ║');
    console.log('║ Press Ctrl+C to stop all services                     ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');
}
// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
// Register signal handlers
process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
});
process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
});
// Run main
main().catch((err) => {
    console.error('[Launcher] Fatal error:', err);
    process.exit(1);
});
// Export for testing
export { parseArgs, LauncherArgsSchema, waitForHealth, gracefulShutdown };
