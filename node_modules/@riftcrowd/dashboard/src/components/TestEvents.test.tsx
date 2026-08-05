/**
 * Phase 13 — TestEvents tests (10+ tests).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TestEvents } from './TestEvents.js';

function mockFetchOk(body: unknown): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch;
}

const mockState = {
  running: false,
  connected: false,
  scenario: null,
  availableScenarios: ['normal_traffic', 'gift_streak'],
  clockTimeMs: 0,
  eventsEmitted: 0,
  commandsProduced: 0,
  pendingEvents: 0,
  directorStates: [],
  eventsInjected: 0,
};

describe('TestEvents', () => {
  beforeEach(() => {
    cleanup();
    localStorage.setItem('riftcrowd_session_token', 'test-token');
    mockFetchOk(mockState);
  });
  afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

  it('renders 8 scenario buttons', () => {
    render(<TestEvents />);
    expect(screen.getByTestId('scenario-normal_traffic')).toBeInTheDocument();
    expect(screen.getByTestId('scenario-gift_streak')).toBeInTheDocument();
    expect(screen.getByTestId('scenario-viral_burst')).toBeInTheDocument();
    expect(screen.getByTestId('scenario-malformed_payloads')).toBeInTheDocument();
    expect(screen.getByTestId('scenario-disconnect')).toBeInTheDocument();
    expect(screen.getByTestId('scenario-reconnect')).toBeInTheDocument();
    expect(screen.getByTestId('scenario-four_mode_round')).toBeInTheDocument();
    expect(screen.getByTestId('scenario-technique_demo')).toBeInTheDocument();
  });

  it('renders single event injection controls', () => {
    render(<TestEvents />);
    expect(screen.getByTestId('inject-viewer')).toBeInTheDocument();
    expect(screen.getByTestId('inject-comment-blue')).toBeInTheDocument();
    expect(screen.getByTestId('inject-comment-red')).toBeInTheDocument();
    expect(screen.getByTestId('inject-gift-gift_021')).toBeInTheDocument();
    expect(screen.getByTestId('inject-gift-gift_022')).toBeInTheDocument();
    expect(screen.getByTestId('inject-gift-gift_023')).toBeInTheDocument();
  });

  it('inject comment button posts to /mock/inject and shows commands', async () => {
    render(<TestEvents />);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, eventId: 'e1', commandTypes: ['JOIN_FACTION'], dropped: false, reason: null }),
      text: async () => '{}',
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fireEvent.click(screen.getByTestId('inject-comment-blue'));
    await waitFor(() => { expect(screen.getByTestId('test-message')).toHaveTextContent('Comment "blue": JOIN_FACTION'); });
    const call = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes('/mock/inject'));
    expect(call).toBeTruthy();
    const body = JSON.parse((call![1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body.kind).toBe('comment');
    expect(body.comment).toBe('blue');
    expect(body.viewerId).toBe('dashboard_tester');
  });

  it('inject gift button sends gift payload', async () => {
    render(<TestEvents />);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, eventId: 'e2', commandTypes: ['GIFT_APPLY', 'CAST_TECHNIQUE'], dropped: false, reason: null }),
      text: async () => '{}',
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fireEvent.click(screen.getByTestId('inject-gift-gift_023'));
    await waitFor(() => { expect(screen.getByTestId('test-message')).toHaveTextContent('Lion: GIFT_APPLY, CAST_TECHNIQUE'); });
    const call = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes('/mock/inject'));
    const body = JSON.parse((call![1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body.kind).toBe('gift');
    expect(body.giftId).toBe('gift_023');
    expect(body.providerValue).toBe(100);
  });

  it('inject shows drop reason when pipeline drops the event', async () => {
    render(<TestEvents />);
    mockFetchOk({ ok: true, eventId: 'e3', commandTypes: [], dropped: true, reason: 'rate limited' });
    fireEvent.click(screen.getByTestId('inject-gift-gift_022'));
    await waitFor(() => { expect(screen.getByTestId('test-message')).toHaveTextContent('dropped (rate limited)'); });
  });

  it('calls mock start on scenario click', async () => {
    render(<TestEvents />);
    mockFetchOk({ ok: true, scenario: 'gift_streak' });
    fireEvent.click(screen.getByTestId('scenario-gift_streak'));
    await waitFor(() => { expect(screen.getByTestId('test-message')).toHaveTextContent('Started: gift_streak'); });
  });

  it('stop button calls mock stop', async () => {
    render(<TestEvents />);
    mockFetchOk({ ok: true });
    fireEvent.click(screen.getByTestId('stop-btn'));
    await waitFor(() => { expect(screen.getByTestId('test-message')).toHaveTextContent('Stopped'); });
  });

  it('advance button sends ms value', async () => {
    render(<TestEvents />);
    mockFetchOk({ ok: true, currentTimeMs: 5000, eventsEmitted: 3 });
    fireEvent.click(screen.getByTestId('advance-btn'));
    await waitFor(() => { expect(screen.getByTestId('test-message')).toHaveTextContent('Advanced 5000ms'); });
  });

  // FIX 7: negative values rejected with "must be > 0"
  it('shows error on invalid advance ms (negative)', async () => {
    render(<TestEvents />);
    const input = screen.getByTestId('advance-ms');
    fireEvent.change(input, { target: { value: '-1' } });
    fireEvent.click(screen.getByTestId('advance-btn'));
    await waitFor(() => { expect(screen.getByTestId('test-message')).toHaveTextContent('> 0'); });
  });

  // FIX 7: ms=0 is a silent no-op and must be rejected
  it('shows error on advance ms=0', async () => {
    render(<TestEvents />);
    const input = screen.getByTestId('advance-ms');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('advance-btn'));
    await waitFor(() => { expect(screen.getByTestId('test-message')).toHaveTextContent('> 0'); });
  });

  it('replay requires path', async () => {
    render(<TestEvents />);
    fireEvent.click(screen.getByTestId('replay-btn'));
    await waitFor(() => { expect(screen.getByTestId('test-message')).toHaveTextContent('Enter a session path'); });
  });

  it('replay calls endpoint with path', async () => {
    render(<TestEvents />);
    fireEvent.change(screen.getByTestId('replay-path'), { target: { value: 'test.json' } });
    mockFetchOk({ ok: true, eventsReplayed: 10 });
    fireEvent.click(screen.getByTestId('replay-btn'));
    await waitFor(() => { expect(screen.getByTestId('test-message')).toHaveTextContent('Replayed'); });
  });

  it('shows mock state', async () => {
    mockFetchOk(mockState);
    render(<TestEvents />);
    await waitFor(() => { expect(screen.getByTestId('mock-state')).toBeInTheDocument(); });
  });

  it('shows start error on fetch failure', async () => {
    render(<TestEvents />);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => ({ error: 'Unknown scenario' }), text: async () => '{"error":"Unknown scenario"}',
    }) as unknown as typeof fetch;
    fireEvent.click(screen.getByTestId('scenario-viral_burst'));
    await waitFor(() => { expect(screen.getByTestId('test-message')).toHaveTextContent('Unknown scenario'); });
  });
});
