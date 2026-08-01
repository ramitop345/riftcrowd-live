/**
 * Phase 13 — EmergencyActions tests (10+ tests).
 *
 * Phase 13 FIX 2: "Clear Queue" now calls POST /control/drain and verifies
 * the drained count from the response body.
 *
 * Phase 13 FIX 12: "Disable gifts" verifies that the POST body contained
 * enabled: false (not just that a message was shown).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { EmergencyActions } from './EmergencyActions.js';

interface FetchCall {
  url: string;
  init: RequestInit;
}

function mockFetchFactory(handler: (url: string, init: RequestInit) => { status: number; body: unknown }): typeof fetch {
  return vi.fn().mockImplementation((url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    const { status, body } = handler(u, init ?? { method: 'GET' });
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
  }) as unknown as typeof fetch;
}

function mockFetchOk(body: unknown): void {
  globalThis.fetch = mockFetchFactory(() => ({ status: 200, body }));
}

describe('EmergencyActions', () => {
  beforeEach(() => {
    cleanup();
    localStorage.setItem('riftcrowd_session_token', 'test-token');
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
  });
  afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

  it('renders all action buttons', () => {
    render(<EmergencyActions />);
    expect(screen.getByTestId('pause-btn')).toBeInTheDocument();
    expect(screen.getByTestId('resume-btn')).toBeInTheDocument();
    expect(screen.getByTestId('end-round-btn')).toBeInTheDocument();
    expect(screen.getByTestId('disable-gifts-btn')).toBeInTheDocument();
    expect(screen.getByTestId('clear-queue-btn')).toBeInTheDocument();
    expect(screen.getByTestId('reconnect-btn')).toBeInTheDocument();
    expect(screen.getByTestId('hide-user-btn')).toBeInTheDocument();
  });

  it('pause calls POST /director/pause', async () => {
    mockFetchOk({ ok: true, paused: true });
    render(<EmergencyActions />);
    fireEvent.click(screen.getByTestId('pause-btn'));
    await waitFor(() => { expect(screen.getByTestId('emergency-message')).toHaveTextContent('paused'); });
  });

  it('pause does nothing if confirm is cancelled', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
    mockFetchOk({ ok: true });
    render(<EmergencyActions />);
    fireEvent.click(screen.getByTestId('pause-btn'));
    // No message should appear since confirm returned false
    expect(screen.queryByTestId('emergency-message')).not.toBeInTheDocument();
  });

  it('resume calls POST /director/resume', async () => {
    mockFetchOk({ ok: true, paused: false });
    render(<EmergencyActions />);
    fireEvent.click(screen.getByTestId('resume-btn'));
    await waitFor(() => { expect(screen.getByTestId('emergency-message')).toHaveTextContent('resumed'); });
  });

  it('end round calls POST /director/end', async () => {
    mockFetchOk({ ok: true, state: 'BATTLE_ENDED' });
    render(<EmergencyActions />);
    fireEvent.click(screen.getByTestId('end-round-btn'));
    await waitFor(() => { expect(screen.getByTestId('emergency-message')).toHaveTextContent('Round ended'); });
  });

  // FIX 2: "Clear Queue" now calls POST /control/drain and shows the real drained count
  it('clear queue calls POST /control/drain and shows drained count', async () => {
    globalThis.fetch = mockFetchFactory((url) => {
      if (url === '/control/drain') return { status: 200, body: { ok: true, drained: 7 } };
      return { status: 404, body: { error: 'not found' } };
    });
    render(<EmergencyActions />);
    fireEvent.click(screen.getByTestId('clear-queue-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('emergency-message')).toHaveTextContent('Queue drained: 7 commands removed');
    });
  });

  it('hide user requires viewer ID', async () => {
    render(<EmergencyActions />);
    fireEvent.click(screen.getByTestId('hide-user-btn'));
    await waitFor(() => { expect(screen.getByTestId('emergency-message')).toHaveTextContent('Enter a viewer ID'); });
  });

  it('hide user calls POST /viewer/hide', async () => {
    mockFetchOk({ ok: true, viewerId: 'test_user', hidden: true });
    render(<EmergencyActions />);
    fireEvent.change(screen.getByTestId('hide-viewer-id'), { target: { value: 'test_user' } });
    fireEvent.click(screen.getByTestId('hide-user-btn'));
    await waitFor(() => { expect(screen.getByTestId('emergency-message')).toHaveTextContent('hidden'); });
  });

  it('reconnect stops then starts adapter', async () => {
    mockFetchOk({ ok: true, scenario: 'normal_traffic' });
    render(<EmergencyActions />);
    fireEvent.click(screen.getByTestId('reconnect-btn'));
    await waitFor(() => { expect(screen.getByTestId('emergency-message')).toHaveTextContent('Reconnected'); });
  });

  // FIX 12: disable gifts verifies POST body contains enabled: false
  it('disable gifts loads config and patches enabled=false', async () => {
    const calls: FetchCall[] = [];
    globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      calls.push({ url, init: init ?? { method: 'GET' } });
      // First call: GET /gifts/config
      if (url === '/gifts/config') {
        return Promise.resolve({
          ok: true, status: 200,
          json: async () => ({ enabled: true, tiers: [], mappings: [], cooldowns: {} }),
          text: async () => '',
        });
      }
      // Second call: POST /gifts/config
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => ({ ok: true }),
        text: async () => '',
      });
    }) as unknown as typeof fetch;
    render(<EmergencyActions />);
    fireEvent.click(screen.getByTestId('disable-gifts-btn'));
    await waitFor(() => { expect(screen.getByTestId('emergency-message')).toHaveTextContent('Gifts disabled'); });

    // FIX 12: assert the POST body contains enabled: false
    const postCall = calls.find(c => c.url === '/gifts/config' && c.init.method === 'POST');
    expect(postCall).toBeDefined();
    expect(JSON.parse(postCall!.init.body as string)).toEqual(expect.objectContaining({ enabled: false }));
  });
});
