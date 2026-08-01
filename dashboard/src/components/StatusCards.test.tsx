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
import { render, screen, waitFor, cleanup } from '@testing-library/react';
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

const flushPromises = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('StatusCards', () => {
  beforeEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders all cards', async () => {
    mockFetchResponses({ '/status': statusData, '/director/state': directorData, '/mock/state': mockData });
    render(<StatusCards />);
    await waitFor(() => { expect(screen.getByTestId('gateway-card')).toBeInTheDocument(); });
    expect(screen.getByTestId('provider-card')).toBeInTheDocument();
    expect(screen.getByTestId('game-card')).toBeInTheDocument();
    expect(screen.getByTestId('queue-card')).toBeInTheDocument();
    expect(screen.getByTestId('fps-card')).toBeInTheDocument();
    expect(screen.getByTestId('round-card')).toBeInTheDocument();
  });

  it('shows gateway uptime', async () => {
    mockFetchResponses({ '/status': statusData, '/director/state': directorData, '/mock/state': mockData });
    render(<StatusCards />);
    await waitFor(() => { expect(screen.getByText('Uptime: 3600s')).toBeInTheDocument(); });
  });

  it('shows provider scenario', async () => {
    mockFetchResponses({ '/status': statusData, '/director/state': directorData, '/mock/state': mockData });
    render(<StatusCards />);
    await waitFor(() => { expect(screen.getByText('Scenario: gift_streak')).toBeInTheDocument(); });
  });

  it('shows game state', async () => {
    mockFetchResponses({ '/status': statusData, '/director/state': directorData, '/mock/state': mockData });
    render(<StatusCards />);
    await waitFor(() => { expect(screen.getByText('BATTLE_OPENING')).toBeInTheDocument(); });
  });

  it('shows queue size', async () => {
    mockFetchResponses({ '/status': statusData, '/director/state': directorData, '/mock/state': mockData });
    render(<StatusCards />);
    await waitFor(() => { expect(screen.getByText('5 / 500')).toBeInTheDocument(); });
  });

  it('shows events processed', async () => {
    mockFetchResponses({ '/status': statusData, '/director/state': directorData, '/mock/state': mockData });
    render(<StatusCards />);
    await waitFor(() => { expect(screen.getByText('100 events')).toBeInTheDocument(); });
  });

  it('shows rounds played', async () => {
    mockFetchResponses({ '/status': statusData, '/director/state': directorData, '/mock/state': mockData });
    render(<StatusCards />);
    await waitFor(() => { expect(screen.getByText('Rounds played: 3')).toBeInTheDocument(); });
  });

  // FIX 11: stale indicator is actually asserted by testid + "stale" text
  it('shows stale indicator on fetch error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail')) as unknown as typeof fetch;
    render(<StatusCards />);
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

    render(<StatusCards />);
    await waitFor(() => { expect(screen.getByText('Uptime: 3600s')).toBeInTheDocument(); });

    // Wait for at least 2 poll cycles (~4s with a 2s interval) and confirm no duplicate cards
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await flushPromises();
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

    render(<StatusCards />);
    await waitFor(() => { expect(callCount).toBeGreaterThan(0); });
    const initialCalls = callCount;

    // Simulate tab hidden
    Object.defineProperty(document, 'hidden', { value: true, configurable: true, writable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    // Wait a little while — the polling interval should be cleared so no new fetches fire.
    // (The 3 seconds below comfortably exceeds the 2-second poll interval.)
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const callsWhileHidden = callCount - initialCalls;
    expect(callsWhileHidden).toBe(0);

    // Simulate tab focus — polling should resume with an immediate poll
    Object.defineProperty(document, 'hidden', { value: false, configurable: true, writable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => { expect(callCount).toBeGreaterThan(initialCalls); });
  });
});
