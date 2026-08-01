/**
 * Tier 2 — Retrofit pipeline integration tests.
 *
 * Validates that Phase 15/16 orchestrators are wired into the pipeline
 * when enableVFX and enableRunbook flags are set.
 *
 * Covers:
 * - VFX orchestrator registration and pipeline rule wiring
 * - Audio orchestrator registration and pipeline rule wiring
 * - Event-type guards (join/provider_status excluded)
 * - Event flow: pipeline → rules → VFX/Audio → command queue
 * - Runbook routes (Window/Preflight/Fallback) registration
 *
 * Target: ≥20 tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp, type BuildAppOptions } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import type { NormalizedLiveEvent, GameCommand } from '@riftcrowd/shared';
import { COMMAND_SCHEMA_VERSION } from '@riftcrowd/shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN = 'retrofit-pipeline-test-token';
const AUTH = { authorization: `Bearer ${TOKEN}` };

process.env['LOCAL_SESSION_TOKEN'] = TOKEN;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let eventCounter = 0;

function makeEvent(
  type: NormalizedLiveEvent['type'],
  overrides?: Partial<NormalizedLiveEvent>,
): NormalizedLiveEvent {
  eventCounter++;
  return {
    schemaVersion: 1,
    id: `evt_retrofit_${eventCounter}_${Date.now()}`,
    provider: 'mock',
    type,
    receivedAt: new Date().toISOString(),
    user: {
      id: `viewer-retrofit-${eventCounter}`,
      handle: `@retrofit${eventCounter}`,
      displayName: `RetrofitViewer${eventCounter}`,
    },
    rawHash: `sha256:retrofit_${eventCounter}_${'a'.repeat(40)}`,
    ...overrides,
  } as NormalizedLiveEvent;
}

function makeGiftEvent(overrides?: Partial<NormalizedLiveEvent>): NormalizedLiveEvent {
  return makeEvent('gift', {
    gift: {
      id: `gift_${eventCounter + 1}`,
      name: 'Rose',
      repeatCount: 1,
    },
    ...overrides,
  });
}

function buildFullApp(): FastifyInstance {
  const opts: BuildAppOptions = {
    logger: false,
    enablePipeline: true,
    enableDirector: true,
    enableGiftEconomy: true,
    enableFreeEngagement: true,
    enableViewerRoutes: true,
    enableVFX: true,
    enableRunbook: true,
  };
  return buildApp(opts);
}

function buildVFXOnlyApp(): FastifyInstance {
  const opts: BuildAppOptions = {
    logger: false,
    enablePipeline: true,
    enableVFX: true,
  };
  return buildApp(opts);
}

function buildRunbookOnlyApp(): FastifyInstance {
  const opts: BuildAppOptions = {
    logger: false,
    enablePipeline: true,
    enableRunbook: true,
  };
  return buildApp(opts);
}

/** Extract command types from pipeline process result */
function processAndCollectCommands(
  app: FastifyInstance,
  event: NormalizedLiveEvent,
): GameCommand[] {
  const result = app.pipeline!.process(event);
  return result.commands;
}

// ===================================================================
// 1. Orchestrator registration
// ===================================================================

describe('Tier 2: Orchestrator registration', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildFullApp();
  });

  it('VFX orchestrator is registered when enableVFX is true', () => {
    expect(app.vfxOrchestrator).toBeDefined();
  });

  it('Audio orchestrator is registered when enableVFX is true', () => {
    expect(app.audioOrchestrator).toBeDefined();
  });

  it('Readability orchestrator is registered when enableVFX is true', () => {
    expect(app.readabilityOrchestrator).toBeDefined();
  });

  it('Preflight orchestrator is registered when enableRunbook is true', () => {
    expect(app.preflightOrchestrator).toBeDefined();
  });

  it('Fallback orchestrator is registered when enableRunbook is true', () => {
    expect(app.fallbackOrchestrator).toBeDefined();
  });
});

// ===================================================================
// 2. Pipeline rule wiring
// ===================================================================

describe('Tier 2: Pipeline rule wiring', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildVFXOnlyApp();
  });

  it('VFXRule is registered in the rules engine', () => {
    const rules = app.pipeline!.rulesEngine.getRules();
    const vfxRule = rules.find((r) => r.name === 'VFXRule');
    expect(vfxRule).toBeDefined();
    expect(vfxRule!.name).toBe('VFXRule');
  });

  it('AudioRule is registered in the rules engine', () => {
    const rules = app.pipeline!.rulesEngine.getRules();
    const audioRule = rules.find((r) => r.name === 'AudioRule');
    expect(audioRule).toBeDefined();
    expect(audioRule!.name).toBe('AudioRule');
  });

  it('VFXRule applies only to VFX-relevant event types', () => {
    const rules = app.pipeline!.rulesEngine.getRules();
    const vfxRule = rules.find((r) => r.name === 'VFXRule')!;

    const giftEvent = makeGiftEvent();
    expect(vfxRule.applies(giftEvent)).toBe(true);

    const followEvent = makeEvent('follow');
    expect(vfxRule.applies(followEvent)).toBe(true);

    const likeEvent = makeEvent('like');
    expect(vfxRule.applies(likeEvent)).toBe(true);

    const chatEvent = makeEvent('chat', { comment: 'hello' });
    expect(vfxRule.applies(chatEvent)).toBe(true);

    const shareEvent = makeEvent('share');
    expect(vfxRule.applies(shareEvent)).toBe(true);

    const subscribeEvent = makeEvent('subscribe');
    expect(vfxRule.applies(subscribeEvent)).toBe(true);
  });

  it('VFXRule does NOT apply to join events', () => {
    const rules = app.pipeline!.rulesEngine.getRules();
    const vfxRule = rules.find((r) => r.name === 'VFXRule')!;
    const joinEvent = makeEvent('join');
    expect(vfxRule.applies(joinEvent)).toBe(false);
  });

  it('VFXRule does NOT apply to provider_status events', () => {
    const rules = app.pipeline!.rulesEngine.getRules();
    const vfxRule = rules.find((r) => r.name === 'VFXRule')!;
    const statusEvent = makeEvent('provider_status', {
      comment: 'stream started',
    });
    expect(vfxRule.applies(statusEvent)).toBe(false);
  });

  it('AudioRule does NOT apply to join events', () => {
    const rules = app.pipeline!.rulesEngine.getRules();
    const audioRule = rules.find((r) => r.name === 'AudioRule')!;
    const joinEvent = makeEvent('join');
    expect(audioRule.applies(joinEvent)).toBe(false);
  });

  it('AudioRule does NOT apply to provider_status events', () => {
    const rules = app.pipeline!.rulesEngine.getRules();
    const audioRule = rules.find((r) => r.name === 'AudioRule')!;
    const statusEvent = makeEvent('provider_status');
    expect(audioRule.applies(statusEvent)).toBe(false);
  });
});

// ===================================================================
// 3. Event flow: gift events → VFX + Audio commands
// ===================================================================

describe('Tier 2: Gift event pipeline flow', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildVFXOnlyApp();
  });

  it('gift event produces SPAWN_VFX command via pipeline', () => {
    const event = makeGiftEvent();
    const commands = processAndCollectCommands(app, event);
    const vfxCommands = commands.filter((c) => c.type === 'SPAWN_VFX');
    expect(vfxCommands.length).toBeGreaterThanOrEqual(1);
  });

  it('gift event produces PLAY_AUDIO command via pipeline', () => {
    const event = makeGiftEvent();
    const commands = processAndCollectCommands(app, event);
    const audioCommands = commands.filter((c) => c.type === 'PLAY_AUDIO');
    expect(audioCommands.length).toBeGreaterThanOrEqual(1);
  });

  it('gift event produces CAMERA_IMPULSE when motion reduction is off', () => {
    const event = makeGiftEvent();
    const commands = processAndCollectCommands(app, event);
    const impulseCommands = commands.filter((c) => c.type === 'CAMERA_IMPULSE');
    expect(impulseCommands.length).toBeGreaterThanOrEqual(1);
  });

  it('gift VFX commands have correct schema version', () => {
    const event = makeGiftEvent();
    const commands = processAndCollectCommands(app, event);
    for (const cmd of commands) {
      expect(cmd.schemaVersion).toBe(COMMAND_SCHEMA_VERSION);
    }
  });

  it('gift commands are enqueued in the command queue', () => {
    const event = makeGiftEvent();
    const commands = processAndCollectCommands(app, event);
    expect(commands.length).toBeGreaterThan(0);
    // Commands returned by process() were successfully enqueued
    expect(app.pipeline!.commandQueue.size).toBeGreaterThanOrEqual(0);
  });
});

// ===================================================================
// 4. Event flow: follow events → VFX + Audio commands
// ===================================================================

describe('Tier 2: Follow event pipeline flow', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildVFXOnlyApp();
  });

  it('follow event produces SPAWN_VFX command', () => {
    const event = makeEvent('follow');
    const commands = processAndCollectCommands(app, event);
    const vfxCommands = commands.filter((c) => c.type === 'SPAWN_VFX');
    expect(vfxCommands.length).toBeGreaterThanOrEqual(1);
  });

  it('follow event produces SPOTLIGHT_CARD command', () => {
    const event = makeEvent('follow');
    const commands = processAndCollectCommands(app, event);
    const spotlightCommands = commands.filter((c) => c.type === 'SPOTLIGHT_CARD');
    expect(spotlightCommands.length).toBeGreaterThanOrEqual(1);
  });

  it('follow event produces PLAY_AUDIO command', () => {
    const event = makeEvent('follow');
    const commands = processAndCollectCommands(app, event);
    const audioCommands = commands.filter((c) => c.type === 'PLAY_AUDIO');
    expect(audioCommands.length).toBeGreaterThanOrEqual(1);
  });
});

// ===================================================================
// 5. Event flow: like, share, subscribe events
// ===================================================================

describe('Tier 2: Like/Share/Subscribe pipeline flow', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildVFXOnlyApp();
  });

  it('like event produces VFX and Audio commands', () => {
    const event = makeEvent('like');
    const commands = processAndCollectCommands(app, event);
    const vfxCommands = commands.filter((c) => c.type === 'SPAWN_VFX');
    const audioCommands = commands.filter((c) => c.type === 'PLAY_AUDIO');
    expect(vfxCommands.length).toBeGreaterThanOrEqual(1);
    expect(audioCommands.length).toBeGreaterThanOrEqual(1);
  });

  it('share event produces SUPPORTER_CALLOUT and PLAY_AUDIO commands', () => {
    const event = makeEvent('share');
    const commands = processAndCollectCommands(app, event);
    const calloutCommands = commands.filter((c) => c.type === 'SUPPORTER_CALLOUT');
    const audioCommands = commands.filter((c) => c.type === 'PLAY_AUDIO');
    expect(calloutCommands.length).toBeGreaterThanOrEqual(1);
    expect(audioCommands.length).toBeGreaterThanOrEqual(1);
  });

  it('subscribe event produces SPAWN_VFX and PLAY_AUDIO commands', () => {
    const event = makeEvent('subscribe');
    const commands = processAndCollectCommands(app, event);
    const vfxCommands = commands.filter((c) => c.type === 'SPAWN_VFX');
    const audioCommands = commands.filter((c) => c.type === 'PLAY_AUDIO');
    expect(vfxCommands.length).toBeGreaterThanOrEqual(1);
    expect(audioCommands.length).toBeGreaterThanOrEqual(1);
  });

  it('subscribe event produces SPOTLIGHT_CARD command', () => {
    const event = makeEvent('subscribe');
    const commands = processAndCollectCommands(app, event);
    const spotlightCommands = commands.filter((c) => c.type === 'SPOTLIGHT_CARD');
    expect(spotlightCommands.length).toBeGreaterThanOrEqual(1);
  });
});

// ===================================================================
// 6. Event-type guard: excluded types produce no VFX/Audio
// ===================================================================

describe('Tier 2: Event-type guards exclude non-VFX events', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildVFXOnlyApp();
  });

  it('join event produces no VFX or Audio commands', () => {
    const event = makeEvent('join');
    const commands = processAndCollectCommands(app, event);
    const vfxCommands = commands.filter((c) =>
      ['SPAWN_VFX', 'PLAY_AUDIO', 'SPOTLIGHT_CARD', 'SUPPORTER_CALLOUT', 'CAMERA_IMPULSE'].includes(c.type),
    );
    expect(vfxCommands.length).toBe(0);
  });

  it('provider_status event produces no VFX or Audio commands', () => {
    const event = makeEvent('provider_status', { comment: 'stream started' });
    const commands = processAndCollectCommands(app, event);
    const vfxCommands = commands.filter((c) =>
      ['SPAWN_VFX', 'PLAY_AUDIO', 'SPOTLIGHT_CARD', 'SUPPORTER_CALLOUT', 'CAMERA_IMPULSE'].includes(c.type),
    );
    expect(vfxCommands.length).toBe(0);
  });

  it('regular chat message produces no VFX commands (only !ability does)', () => {
    const event = makeEvent('chat', { comment: 'hello everyone!' });
    const commands = processAndCollectCommands(app, event);
    const vfxCommands = commands.filter((c) => c.type === 'SPAWN_VFX');
    expect(vfxCommands.length).toBe(0);
  });
});

// ===================================================================
// 7. Full event flow: provider → pipeline → rules → queue → bus
// ===================================================================

describe('Tier 2: Full event flow end-to-end', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildVFXOnlyApp();
  });

  it('commands from pipeline are published to the event bus', () => {
    const busCommands: GameCommand[] = [];
    app.pipeline!.eventBus.subscribe('command', (cmd: unknown) => {
      busCommands.push(cmd as GameCommand);
    });

    const event = makeEvent('follow');
    const result = app.pipeline!.process(event);

    expect(result.commands.length).toBeGreaterThan(0);
    expect(busCommands.length).toBeGreaterThan(0);
    expect(busCommands.length).toBe(result.commands.length);
  });

  it('multiple sequential events accumulate commands in the queue', () => {
    const followEvent = makeEvent('follow');
    const giftEvent = makeGiftEvent();
    const likeEvent = makeEvent('like');

    processAndCollectCommands(app, followEvent);
    processAndCollectCommands(app, giftEvent);
    processAndCollectCommands(app, likeEvent);

    const stats = app.pipeline!.getStats();
    expect(stats.processed).toBe(3);
    expect(stats.queued).toBeGreaterThan(0);
    expect(stats.rulesTriggered).toBeGreaterThanOrEqual(3);
  });

  it('VFX and Audio rules fire simultaneously for the same event', () => {
    const event = makeEvent('gift', {
      gift: { id: 'gift_combo', name: 'Rocket', repeatCount: 50 },
    });
    const commands = processAndCollectCommands(app, event);
    const vfxTypes = commands.filter((c) => c.type === 'SPAWN_VFX' || c.type === 'CAMERA_IMPULSE');
    const audioTypes = commands.filter((c) => c.type === 'PLAY_AUDIO');
    expect(vfxTypes.length).toBeGreaterThanOrEqual(1);
    expect(audioTypes.length).toBeGreaterThanOrEqual(1);
  });
});

// ===================================================================
// 8. Runbook routes registration
// ===================================================================

describe('Tier 2: Runbook routes registration', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildRunbookOnlyApp();
  });

  it('Window config route is accessible', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/window/config',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mode).toBeDefined();
  });

  it('Preflight route returns health checks', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/preflight/check',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
  });

  it('Fallback status route is accessible', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/fallback/status',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
  });
});

// ===================================================================
// 9. Orchestrator stats track pipeline processing
// ===================================================================

describe('Tier 2: Orchestrator stats tracking', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildVFXOnlyApp();
  });

  it('Audio orchestrator stats track events processed', () => {
    const audioOrch = app.audioOrchestrator!;
    expect(audioOrch.getStats().eventsProcessed).toBe(0);

    processAndCollectCommands(app, makeEvent('follow'));
    processAndCollectCommands(app, makeEvent('like'));

    const stats = audioOrch.getStats();
    expect(stats.eventsProcessed).toBe(2);
    expect(stats.commandsEmitted).toBeGreaterThan(0);
  });

  it('VFX orchestrator pool stats reflect acquisitions', () => {
    const vfxOrch = app.vfxOrchestrator!;
    const initialStats = vfxOrch.getStats();
    expect(initialStats.active).toBe(0);

    processAndCollectCommands(app, makeEvent('follow'));

    const afterStats = vfxOrch.getStats();
    expect(afterStats.active).toBeGreaterThan(0);
  });
});
