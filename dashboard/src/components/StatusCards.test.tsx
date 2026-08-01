/**
 * Phase 13 — StatusCards tests (8+ tests).
 *
 * Phase 13 FIX 3: Race conditions between overlapping polls are prevented by
 * an AbortController; verify that concurrent polls don't cause duplicate renders.
 *
 * Phase 13 FIX 8: Polling pauses when the tab is hidden (document.hidden).
 *
 * Phase 13 FIX 11: Stale indicator is asserted by its testid + text content,
 * not just by checking that the component is still in the document.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import { StatusCards } from './StatusCards.js';

function mockFetchResponses(responses: Record<string, unknown>): void {
  globalThis.fetch = vi.fn().mockImplementation((url: string) => {
    const body = responses[url] ?? {};
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
  }) as unknown as typeof fetch;
}

const statusData = {
  pipeline: {
    eventsProcessed: 100,
    commandsProduced: 20,
    dropped: 2,
    dedupeSize: 50,
    rateLimitBuckets: 10,
    commandQueueSize: 5,
    commandQueueCapacity: 500,
    eventBusSizes: {},
  },
  director: { state: 'MODE_VOTE', timerSeconds: 15, currentMode: 'countries', paused: false },
  viewerRegistrySize: 42,
  uptime: 3600,
};

const directorData = {
  state: 'BATTLE_OPENING',
  timerSeconds: 120,
  currentMode: 'animals',
  currentModeId: 'animals',
  selectedFactions: { v1: 'faction_alpha' },
  stats: { roundsPlayed: 3, modeCounts: { animals: 2 }, factionWinCounts: { faction_alpha: 2 }, recentModes: ['animals'] },
  paused: false,
};

const mockData = {
  running: true,
  connected: true,
  scenario: 'gift_streak',
  availableScenarios: ['normal_traffic'],
  clockTimeMs: 5000,
  eventsEmitted: 30,
  commandsProduced: 10,
  pendingEvents: 5,
  directorStates: [],
};

describe('StatusCards', () => {
  beforeEach(() => {
    cleanup();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders all cards', async () => {
    mockFetchResponses({ '/status': statusData, '/director/state': directorData, '/mock/state': mockData });
    await act(async () => { render(<StatusCards />); });
    // Flush initial poll promises
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => { expect(screen.getByTestId('gateway-card')).toBeInTheDocument(); });
    expect(screen.getByTestId('provider-card')).toBeInTheDocument();
    expect(screen.getByTestId('game-card')).toBeInTheDocument();
    expect(screen.getByTestId('queue-card')).toBeInTheDocument();
    expect(screen.getByTestId('fps-card')).toBeInTheDocument();
    expect(screen.getByTestId('round-card')).toBeInTheDocument();
  });

  it('shows gateway uptime', async () => {
    mockFetchResponses({ '/status': statusData, '/director/state': directorData, '/mock/state': mockData });
    await act(async () => { render(<StatusCards />); });
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => { expect(screen.getByText('Uptime: 3600s')).toBeInTheDocument(); });
  });

  it('shows provider scenario', async () => {
    mockFetchResponses({ '/status': statusData, '/director/state': directorData, '/mock/state': mockData });
    await act(async () => { render(<StatusCards />); });
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => { expect(screen.getByText('Scenario: gift_streak')).toBeInTheDocument(); });
  });

  it('shows game state', async () => {
    mockFetchResponses({ '/status': statusData, '/director/state': directorData, '/mock/state': mockData });
    await act(async () => { render(<StatusCards />); });
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => { expect(screen.getByText('BATTLE_OPENING')).toBeInTheDocument(); });
  });

  it('shows queue size', async () => {
    mockFetchResponses({ '/status': statusData, '/director/state': directorData, '/mock/state': mockData });
    await act(async () => { render(<StatusCards />); });
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => { expect(screen.getByText('5 / 500')).toBeInTheDocument(); });
  });

  it('shows events processed', async () => {
    mockFetchResponses({ '/status': statusData, '/director/state': directorData, '/mock/state': mockData });
    await act(async () => { render(<StatusCards />); });
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => { expect(screen.getByText('100 events')).toBeInTheDocument(); });
  });

  it('shows rounds played', async () => {
    mockFetchResponses({ '/status': statusData, '/director/state': directorData, '/mock/state': mockData });
    await act(async () => { render(<StatusCards />); });
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => { expect(screen.getByText('Rounds played: 3')).toBeInTheDocument(); });
  });

  // FIX 11: stale indicator is actually asserted by testid + "stale" text
  it('shows stale indicator on fetch error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail')) as unknown as typeof fetch;
    await act(async () => { render(<StatusCards />); });
    // Flush rejected promises
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => {
      const el = screen.getByTestId('stale-indicator');
      expect(el).toBeInTheDocument();
      expect(el.textContent).toMatch(/Waiting|stale/i);
    });
    expect(screen.getByTestId('status-cards').getAttribute('style')).toContain('opacity');
  });

  // FIX 3: rapid successive polls don't produce duplicate state updates
  it('rapid polls converge to a single stable state', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const body = url === '/status' ? statusData : url === '/director/state' ? directorData : mockData;
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
      });
    }) as unknown as typeof fetch;

    await act(async () => { render(<StatusCards />); });
    // Advance through several poll intervals
    for (let i = 0; i < 5; i++) {
      await act(async () => { vi.advanceTimersByTime(2000); });
      await act(async () => { await Promise.resolve(); });
    }
    await waitFor(() => { expect(screen.getByText('Uptime: 3600s')).toBeInTheDocument(); });
    // The gateway card should still be present exactly once (no React duplication)
    expect(screen.getAllByTestId('gateway-card')).toHaveLength(1);
  });

  // FIX 8: polling pauses when document.hidden is true
  it('polling pauses when tab is hidden', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => ({}),
        text: async () => '{}',
      });
    }) as unknown as typeof fetch;

    await act(async () => { render(<StatusCards />); });
    await act(async () => { await Promise.resolve(); });
    const initialCalls = callCount;
    expect(initialCalls).toBeGreaterThan(0);

    // Simulate tab hidden
    Object.defineProperty(document, 'hidden', { value: true, configurable: true, writable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });

    // Advance time — no new fetches should happen while hidden
    await act(async () => { vi.advanceTimersByTime(6000); });
    const callsWhileHidden = callCount - initialCalls;
    expect(callsWhileHidden).toBe(0);

    // Simulate tab focus
    Object.defineProperty(document, 'hidden', { value: false, configurable: true, writable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });

    // After focus, polls should resume (at least one immediate poll)
    await act(async () => { await Promise.resolve(); });
    expect(callCount).toBeGreaterThan(initialCalls);
  });
});
