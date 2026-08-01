/**
 * Phase 13 — End-to-end test.
 * Proves a creator can operate a complete mock stream via the dashboard API client
 * without editing files or using the terminal.
 *
 * Uses mocked fetch to simulate gateway responses for all operations.
 * 15+ assertions covering each action in the workflow.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getHealth,
  mockStart,
  mockState,
  mockStop,
  mockAdvance,
  mockRecord,
  mockReplay,
  getDirectorState,
  pause,
  skip,
  endRound,
  drainQueue,
  hideUser,
  restart,
  resume,
  setToken,
  clearToken,
} from '../src/api/client.js';

// ---------------------------------------------------------------------------
// Gateway response simulation
// ---------------------------------------------------------------------------

interface MockState {
  running: boolean;
  connected: boolean;
  scenario: string | null;
}

let gatewayState: {
  health: { status: string; uptime: number; version: string; provider: string; timestamp: string };
  director: { state: string; timerSeconds: number; currentMode: string | null; paused: boolean; currentModeId: string | null; selectedFactions: Record<string, string>; stats: { roundsPlayed: number; modeCounts: Record<string, number>; factionWinCounts: Record<string, number>; recentModes: string[] } };
  mock: MockState & { availableScenarios: string[]; clockTimeMs: number; eventsEmitted: number; commandsProduced: number; pendingEvents: number; directorStates: string[] };
} = {
  health: { status: 'ok', uptime: 0, version: '0.1.0', provider: 'mock', timestamp: 'T' },
  director: { state: 'IDLE', timerSeconds: 0, currentMode: null, paused: false, currentModeId: null, selectedFactions: {}, stats: { roundsPlayed: 0, modeCounts: {}, factionWinCounts: {}, recentModes: [] } },
  mock: { running: false, connected: false, scenario: null, availableScenarios: ['normal_traffic', 'gift_streak', 'viral_burst', 'malformed_payloads', 'disconnect', 'reconnect', 'four_mode_round'], clockTimeMs: 0, eventsEmitted: 0, commandsProduced: 0, pendingEvents: 0, directorStates: [] },
};

function setupMockFetch(): void {
  globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    let body: unknown = {};

    // Health
    if (url === '/health') body = gatewayState.health;
    // Director state
    else if (url === '/director/state' && method === 'GET') body = gatewayState.director;
    // Mock state
    else if (url === '/mock/state' && method === 'GET') body = gatewayState.mock;
    // Mock start
    else if (url === '/mock/start' && method === 'POST') {
      const reqBody = JSON.parse(init!.body as string) as { scenario: string };
      gatewayState.mock.running = true;
      gatewayState.mock.connected = true;
      gatewayState.mock.scenario = reqBody.scenario;
      gatewayState.mock.eventsEmitted = 0;
      gatewayState.mock.commandsProduced = 0;
      body = { ok: true, scenario: reqBody.scenario, durationMs: 120000, eventCount: 50 };
    }
    // Mock stop
    else if (url === '/mock/stop' && method === 'POST') {
      gatewayState.mock.running = false;
      gatewayState.mock.connected = false;
      body = { ok: true };
    }
    // Mock advance
    else if (url === '/mock/advance' && method === 'POST') {
      const reqBody = JSON.parse(init!.body as string) as { ms: number };
      gatewayState.mock.clockTimeMs += reqBody.ms;
      gatewayState.mock.eventsEmitted += 5;
      body = { ok: true, currentTimeMs: gatewayState.mock.clockTimeMs, eventsEmitted: 5 };
    }
    // Mock record
    else if (url === '/mock/record' && method === 'POST') {
      body = { ok: true, scenario: 'four_mode_round', eventsRecorded: 200, commandsRecorded: 30, path: '/tmp/four_mode_round.json' };
    }
    // Mock replay
    else if (url === '/mock/replay' && method === 'POST') {
      body = { ok: true, eventsReplayed: 200, commandsProduced: 30 };
    }
    // Director pause
    else if (url === '/director/pause' && method === 'POST') {
      gatewayState.director.paused = true;
      body = { ok: true, paused: true };
    }
    // Director resume
    else if (url === '/director/resume' && method === 'POST') {
      gatewayState.director.paused = false;
      body = { ok: true, paused: false };
    }
    // Director skip
    else if (url === '/director/skip' && method === 'POST') {
      gatewayState.director.state = 'FACTION_LOBBY';
      body = { ok: true, state: 'FACTION_LOBBY' };
    }
    // Director end
    else if (url === '/director/end' && method === 'POST') {
      gatewayState.director.state = 'BATTLE_ENDED';
      body = { ok: true, state: 'BATTLE_ENDED' };
    }
    // Director restart
    else if (url === '/director/restart' && method === 'POST') {
      gatewayState.director.state = 'MODE_VOTE';
      gatewayState.director.timerSeconds = 20;
      body = { ok: true, state: 'MODE_VOTE' };
    }
    // Commands drain (Phase 13 FIX 2)
    else if (url === '/control/drain' && method === 'POST') {
      body = { ok: true, drained: 2 };
    }
    // Commands drain (GET — legacy)
    else if (url === '/commands' && method === 'GET') {
      body = { commands: [{ type: 'FACTION_JOIN' }, { type: 'SPAWN_CHAMPION' }], count: 2 };
    }
    // Viewer hide
    else if (url === '/viewer/hide' && method === 'POST') {
      const reqBody = JSON.parse(init!.body as string) as { viewerId: string };
      body = { ok: true, viewerId: reqBody.viewerId, hidden: true };
    }
    else {
      return Promise.resolve({ ok: false, status: 404, json: async () => ({ error: 'Not found' }), text: async () => '{"error":"Not found"}' });
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// E2E test
// ---------------------------------------------------------------------------

describe('E2E — Creator operates complete mock stream via dashboard', () => {
  beforeEach(() => {
    setToken('e2e-test-token');
    // Reset gateway state
    gatewayState = {
      health: { status: 'ok', uptime: 0, version: '0.1.0', provider: 'mock', timestamp: 'T' },
      director: { state: 'IDLE', timerSeconds: 0, currentMode: null, paused: false, currentModeId: null, selectedFactions: {}, stats: { roundsPlayed: 0, modeCounts: {}, factionWinCounts: {}, recentModes: [] } },
      mock: { running: false, connected: false, scenario: null, availableScenarios: ['normal_traffic', 'gift_streak', 'viral_burst', 'malformed_payloads', 'disconnect', 'reconnect', 'four_mode_round'], clockTimeMs: 0, eventsEmitted: 0, commandsProduced: 0, pendingEvents: 0, directorStates: [] },
    };
    setupMockFetch();
  });

  afterEach(() => {
    clearToken();
    vi.restoreAllMocks();
  });

  it('complete mock stream workflow (15+ assertions)', async () => {
    // 1. Authenticate — check health
    const health = await getHealth();
    expect(health.ok).toBe(true); // assertion 1
    if (health.ok) {
      expect(health.data.status).toBe('ok'); // assertion 2
      expect(health.data.provider).toBe('mock'); // assertion 3
    }

    // 2. Start four_mode_round scenario
    const start = await mockStart('four_mode_round');
    expect(start.ok).toBe(true); // assertion 4

    // 3. Observe adapter is running
    const state1 = await mockState();
    expect(state1.ok).toBe(true); // assertion 5
    if (state1.ok) {
      expect(state1.data.running).toBe(true); // assertion 6
      expect(state1.data.scenario).toBe('four_mode_round'); // assertion 7
      expect(state1.data.connected).toBe(true); // assertion 8
    }

    // 4. Director transitions — simulate skip to next mode
    const skipRes = await skip();
    expect(skipRes.ok).toBe(true); // assertion 9

    // 5. Observe director state changed
    const dirState = await getDirectorState();
    expect(dirState.ok).toBe(true); // assertion 10
    if (dirState.ok) {
      expect(dirState.data.state).toBe('FACTION_LOBBY'); // assertion 11
    }

    // 6. Pause round
    const pauseRes = await pause();
    expect(pauseRes.ok).toBe(true); // assertion 12

    // 7. Advance clock manually
    const advanceRes = await mockAdvance(10000);
    expect(advanceRes.ok).toBe(true); // assertion 13

    // 8. End round
    const endRes = await endRound();
    expect(endRes.ok).toBe(true); // assertion 14

    // 9. Stop scenario
    const stopRes = await mockStop();
    expect(stopRes.ok).toBe(true); // assertion 15

    // 10. Record session
    const recordRes = await mockRecord('four_mode_round');
    expect(recordRes.ok).toBe(true); // assertion 16

    // 11. Replay recorded session
    const replayRes = await mockReplay('four_mode_round.json');
    expect(replayRes.ok).toBe(true); // assertion 17

    // 12. Hide a user
    const hideRes = await hideUser('trouble_viewer_42');
    expect(hideRes.ok).toBe(true); // assertion 18
    if (hideRes.ok) {
      expect(hideRes.data.hidden).toBe(true); // assertion 19 (via OkResponse shape)
    }

    // 13. Clear queue (Phase 13 FIX 2: use POST /control/drain)
    const drain = await drainQueue();
    expect(drain.ok).toBe(true); // assertion 20
    if (drain.ok) {
      expect(drain.data.drained).toBe(2); // assertion 21
    }

    // 14. Reconnect (restart director + start new scenario)
    const restartRes = await restart();
    expect(restartRes.ok).toBe(true); // assertion 22

    const resumeRes = await resume();
    expect(resumeRes.ok).toBe(true); // assertion 23

    // 15. Start a new scenario after reconnect
    const start2 = await mockStart('normal_traffic');
    expect(start2.ok).toBe(true); // assertion 24
  });
});
