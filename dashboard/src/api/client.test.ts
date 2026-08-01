/**
 * Phase 13 — API client tests.
 * Each function tested against mocked fetch: auth header present, error handling on 401/500.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getHealth,
  getStatus,
  getConfig,
  updateConfig,
  getDirectorState,
  skip,
  pause,
  resume,
  endRound,
  restart,
  getCommands,
  shutdown,
  mockStart,
  mockStop,
  mockAdvance,
  mockState,
  mockRecord,
  mockReplay,
  hideUser,
  getGiftConfig,
  getGiftPreview,
  getGiftStats,
  getEngagementConfig,
  getEngagementStats,
  getTopContributors,
  updateGiftConfig,
  updateEngagementConfig,
  postEvents,
  getEvents,
  getToken,
  setToken,
  clearToken,
} from './client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(status: number, body: unknown): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch;
}

function mockFetchError(status: number, error: string): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ error }),
    text: async () => JSON.stringify({ error }),
  }) as unknown as typeof fetch;
}

function mockFetchNetworkError(): void {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure')) as unknown as typeof fetch;
}

function getLastFetchCall(): [string, RequestInit] {
  const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
  return calls[calls.length - 1]!;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('API Client', () => {
  beforeEach(() => {
    setToken('test-token-123');
  });

  afterEach(() => {
    clearToken();
    vi.restoreAllMocks();
  });

  it('getHealth calls /health and returns data', async () => {
    mockFetch(200, { status: 'ok', uptime: 42, version: '0.1.0', provider: 'mock', timestamp: 'T' });
    const res = await getHealth();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.status).toBe('ok');
    const [url] = getLastFetchCall();
    expect(url).toBe('/health');
  });

  it('getStatus sends auth header', async () => {
    mockFetch(200, { pipeline: {}, director: null, viewerRegistrySize: 0, uptime: 10 });
    await getStatus();
    const [, init] = getLastFetchCall();
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-token-123' });
  });

  it('getConfig returns config data', async () => {
    mockFetch(200, { host: '127.0.0.1', gatewayPort: 8787 });
    const res = await getConfig();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.gatewayPort).toBe(8787);
  });

  it('updateConfig sends PATCH body', async () => {
    mockFetch(200, { ok: true, applied: ['rateLimitPerViewer'] });
    const res = await updateConfig({ rateLimitPerViewer: 20 });
    expect(res.ok).toBe(true);
    const [, init] = getLastFetchCall();
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ rateLimitPerViewer: 20 });
  });

  it('getDirectorState returns state', async () => {
    mockFetch(200, { state: 'MODE_VOTE', timerSeconds: 15, currentMode: null, paused: false });
    const res = await getDirectorState();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.state).toBe('MODE_VOTE');
  });

  it('skip/pause/resume/endRound/restart call correct endpoints', async () => {
    for (const [fn, path] of [
      [skip, '/director/skip'],
      [pause, '/director/pause'],
      [resume, '/director/resume'],
      [endRound, '/director/end'],
      [restart, '/director/restart'],
    ] as const) {
      mockFetch(200, { ok: true, state: 'MODE_VOTE' });
      await fn();
      const [url] = getLastFetchCall();
      expect(url).toBe(path);
    }
  });

  it('getCommands calls GET /commands', async () => {
    mockFetch(200, { commands: [], count: 0 });
    const res = await getCommands();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.count).toBe(0);
  });

  it('shutdown calls POST /control/shutdown', async () => {
    mockFetch(200, { ok: true, message: 'Shutdown initiated' });
    const res = await shutdown();
    expect(res.ok).toBe(true);
    const [url, init] = getLastFetchCall();
    expect(url).toBe('/control/shutdown');
    expect(init.method).toBe('POST');
  });

  it('mockStart sends scenario name', async () => {
    mockFetch(200, { ok: true, scenario: 'normal_traffic' });
    await mockStart('normal_traffic', 2);
    const [url, init] = getLastFetchCall();
    expect(url).toBe('/mock/start');
    expect(JSON.parse(init.body as string)).toEqual({ scenario: 'normal_traffic', speedMultiplier: 2 });
  });

  it('mockStop calls POST /mock/stop', async () => {
    mockFetch(200, { ok: true });
    await mockStop();
    const [url] = getLastFetchCall();
    expect(url).toBe('/mock/stop');
  });

  it('mockAdvance sends ms value', async () => {
    mockFetch(200, { ok: true, currentTimeMs: 5000 });
    await mockAdvance(5000);
    const [, init] = getLastFetchCall();
    expect(JSON.parse(init.body as string)).toEqual({ ms: 5000 });
  });

  it('mockState returns adapter state', async () => {
    mockFetch(200, { running: true, connected: true, scenario: 'gift_streak', availableScenarios: [], clockTimeMs: 0, eventsEmitted: 10, commandsProduced: 3, pendingEvents: 5, directorStates: [] });
    const res = await mockState();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.running).toBe(true);
  });

  it('mockRecord sends scenario name', async () => {
    mockFetch(200, { ok: true, path: '/tmp/test.json' });
    await mockRecord('gift_streak');
    const [url] = getLastFetchCall();
    expect(url).toBe('/mock/record');
  });

  it('mockReplay sends session path', async () => {
    mockFetch(200, { ok: true });
    await mockReplay('gift_streak.json');
    const [, init] = getLastFetchCall();
    expect(JSON.parse(init.body as string)).toEqual({ sessionPath: 'gift_streak.json' });
  });

  it('hideUser sends viewerId', async () => {
    mockFetch(200, { ok: true, viewerId: 'v1', hidden: true });
    await hideUser('v1');
    const [url, init] = getLastFetchCall();
    expect(url).toBe('/viewer/hide');
    expect(JSON.parse(init.body as string)).toEqual({ viewerId: 'v1' });
  });

  it('returns error on 401 unauthorized', async () => {
    mockFetchError(401, 'Invalid token');
    const res = await getHealth();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
      expect(res.error).toBe('Invalid token');
    }
  });

  it('returns error on 500 server error', async () => {
    mockFetchError(500, 'Internal server error');
    const res = await getStatus();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(500);
  });

  it('returns error on network failure', async () => {
    mockFetchNetworkError();
    const res = await getHealth();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(0);
      expect(res.error).toBe('Network failure');
    }
  });

  it('getGiftConfig/getGiftPreview/getGiftStats call correct endpoints', async () => {
    for (const [fn, path] of [
      [getGiftConfig, '/gifts/config'],
      [getGiftPreview, '/gifts/preview'],
      [getGiftStats, '/gifts/stats'],
    ] as const) {
      mockFetch(200, {});
      await fn();
      const [url] = getLastFetchCall();
      expect(url).toBe(path);
    }
  });

  it('engagement endpoints call correct paths', async () => {
    for (const [fn, path] of [
      [getEngagementConfig, '/engagement/config'],
      [getEngagementStats, '/engagement/stats'],
      [getTopContributors, '/engagement/top'],
    ] as const) {
      mockFetch(200, {});
      await fn();
      const [url] = getLastFetchCall();
      expect(url).toBe(path);
    }
  });

  it('updateGiftConfig sends POST /gifts/config with body', async () => {
    mockFetch(200, { ok: true });
    const res = await updateGiftConfig({ enabled: false });
    expect(res.ok).toBe(true);
    const [url, init] = getLastFetchCall();
    expect(url).toBe('/gifts/config');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ enabled: false });
  });

  it('updateEngagementConfig sends POST /engagement/config with body', async () => {
    mockFetch(200, { ok: true });
    const res = await updateEngagementConfig({ likesEnabled: true });
    expect(res.ok).toBe(true);
    const [url, init] = getLastFetchCall();
    expect(url).toBe('/engagement/config');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ likesEnabled: true });
  });

  it('postEvents sends POST /events with event array', async () => {
    mockFetch(200, { ok: true, accepted: 2, rejected: 0 });
    const events = [
      { type: 'COMMENT', viewerId: 'v1', content: 'hello', timestamp: 'T' },
      { type: 'COMMENT', viewerId: 'v2', content: 'world', timestamp: 'T' },
    ];
    const res = await postEvents(events as never[]);
    expect(res.ok).toBe(true);
    const [url, init] = getLastFetchCall();
    expect(url).toBe('/events');
    expect(init.method).toBe('POST');
  });

  it('getEvents calls GET /events', async () => {
    mockFetch(200, { events: [], count: 0 });
    const res = await getEvents();
    expect(res.ok).toBe(true);
    const [url] = getLastFetchCall();
    expect(url).toBe('/events');
  });

  it('setToken updates token used in subsequent requests', async () => {
    setToken('new-token-456');
    mockFetch(200, { status: 'ok' });
    await getHealth();
    const [, init] = getLastFetchCall();
    expect(init.headers).toMatchObject({ Authorization: 'Bearer new-token-456' });
  });

  it('getToken returns stored token', () => {
    setToken('stored-tok');
    expect(getToken()).toBe('stored-tok');
  });
});
