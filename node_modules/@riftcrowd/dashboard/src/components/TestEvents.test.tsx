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
};

describe('TestEvents', () => {
  beforeEach(() => {
    cleanup();
    localStorage.setItem('riftcrowd_session_token', 'test-token');
    mockFetchOk(mockState);
  });
  afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

  it('renders 7 scenario buttons', () => {
    render(<TestEvents />);
    expect(screen.getByTestId('scenario-normal_traffic')).toBeInTheDocument();
    expect(screen.getByTestId('scenario-gift_streak')).toBeInTheDocument();
    expect(screen.getByTestId('scenario-viral_burst')).toBeInTheDocument();
    expect(screen.getByTestId('scenario-malformed_payloads')).toBeInTheDocument();
    expect(screen.getByTestId('scenario-disconnect')).toBeInTheDocument();
    expect(screen.getByTestId('scenario-reconnect')).toBeInTheDocument();
    expect(screen.getByTestId('scenario-four_mode_round')).toBeInTheDocument();
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
