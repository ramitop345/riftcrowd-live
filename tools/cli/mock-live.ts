/**
 * Phase 9 — CLI tool for running mock live scenarios.
 *
 * Usage:
 *   npx tsx tools/cli/mock-live.ts --scenario=<name> [--record=output.json]
 *   npx tsx tools/cli/mock-live.ts --replay=input.json
 *   npx tsx tools/cli/mock-live.ts --list
 *
 * Starts the gateway pipeline, wires MockLiveAdapter or ReplayAdapter,
 * advances TestClock instantly. Prints progress and command count to stdout.
 * Note: TestClock playback is always instant; there is no real-time pacing.
 */

import { MockLiveAdapter } from '../../gateway/src/adapters/mock_live_adapter.js';
import { ReplayAdapter } from '../../gateway/src/adapters/replay.js';
import { TestClock } from '../../gateway/src/adapters/test_clock.js';
import { getScenario, listScenarios } from '../../gateway/src/adapters/scenarios.js';
import { SessionBuilder, saveSession, loadSession } from '../../gateway/src/adapters/recording.js';
import { Pipeline } from '../../gateway/src/pipeline/pipeline.js';
import { MatchDirector, type MatchDirectorOptions } from '../../gateway/src/director/match_director.js';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq > 0) {
        args[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        args[arg.slice(2)] = true;
      }
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function progressBar(current: number, total: number, width: number = 40): string {
  const pct = Math.min(1, current / total);
  const filled = Math.round(pct * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `[${bar}] ${Math.round(pct * 100)}%`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args['list'] || args['help']) {
    console.log('Available scenarios:');
    for (const name of listScenarios()) {
      const s = getScenario(name);
      console.log(`  ${name.padEnd(25)} ${s.events.length} events, ${(s.durationMs / 1000).toFixed(0)}s`);
    }
    console.log('\nUsage:');
    console.log('  --scenario=<name>      Run a scenario');
    console.log('  --replay=<path>        Replay a recorded session');
    console.log('  --record=<path>        Save session to file');
    console.log('  --list                 List available scenarios');
    process.exit(0);
  }

  // Parse args (speed is no longer supported — TestClock playback is always instant)

  // Create pipeline and director
  const pipeline = new Pipeline({
    eventBusCapacity: 1000,
    dedupeCapacity: 10000,
    rateLimitPerViewer: 10,
    rateLimitBurst: 50,
    rateLimitGlobal: 1000,
    commandQueueCapacity: 500,
  });

  const directorOpts: MatchDirectorOptions = {
    sessionStatsPath: join(process.cwd(), 'gateway', 'data', 'session-stats.json'),
    modeVoteDuration: 20,
    factionLobbyDuration: 35,
    battleConfig: { opening: 120, crisis: 60, finalSurge: 60, suddenDeath: 45 },
    resultsDuration: 20,
  };
  const director = new MatchDirector(directorOpts);
  director.start();

  const clock = new TestClock(0);

  if (typeof args['replay'] === 'string') {
    // Replay mode
    const sessionPath = args['replay'];
    console.log(`Replaying: ${sessionPath}`);

    const session = loadSession(sessionPath);
    const adapter = new ReplayAdapter({ session, clock, pipeline, director });

    adapter.onEvent(() => {});
    await adapter.start();

    const maxTime = session.events.reduce((max, e) => Math.max(max, e.timeMs), 0);
    const stepMs = 5000;

    while (clock.now() <= maxTime + stepMs) {
      clock.advance(stepMs);
      const progress = progressBar(clock.now(), maxTime);
      process.stdout.write(`\r${progress} | Events: ${adapter.emittedEvents.length} | Commands: ${adapter.commands.length}`);
    }
    console.log();

    await adapter.stop();
    console.log(`\nReplay complete: ${adapter.emittedEvents.length} events, ${adapter.commands.length} commands`);

  } else if (typeof args['scenario'] === 'string') {
    // Scenario mode
    const scenarioName = args['scenario'];
    const scenario = getScenario(scenarioName);
    console.log(`Running scenario: ${scenarioName} (${scenario.events.length} events, ${(scenario.durationMs / 1000).toFixed(0)}s)`);

    const builder = new SessionBuilder();
    const adapter = new MockLiveAdapter({ scenario, clock, pipeline, director });

    adapter.onEvent((event) => {
      builder.addEvent(clock.now(), event);
    });

    await adapter.start();

    const stepMs = 5000;
    const maxTime = scenario.durationMs;

    while (clock.now() <= maxTime + stepMs) {
      clock.advance(stepMs);
      const progress = progressBar(clock.now(), maxTime);
      process.stdout.write(`\r${progress} | Events: ${adapter.emittedEvents.length} | Commands: ${adapter.commands.length}`);
    }
    console.log();

    await adapter.stop();

    console.log(`\nScenario complete: ${adapter.emittedEvents.length} events, ${adapter.commands.length} commands`);
    console.log(`Director states: ${adapter.directorStates.join(' → ')}`);

    // Record if requested
    if (typeof args['record'] === 'string') {
      for (const cmd of adapter.commands) {
        builder.addCommand(cmd);
      }
      for (const ds of adapter.directorStates) {
        builder.addDirectorSnapshot({ state: ds });
      }
      const session = builder.build();
      saveSession(session, args['record']);
      console.log(`Session saved to: ${args['record']}`);
    }

  } else {
    console.error('Error: specify --scenario=<name> or --replay=<path>');
    console.error('Use --list to see available scenarios');
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
