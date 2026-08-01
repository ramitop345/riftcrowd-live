/**
 * Phase 13 — Config screens tests (15+ tests).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ProviderSettings } from './ProviderSettings.js';
import { ModeSelection } from './ModeSelection.js';
import { GiftMapping } from './GiftMapping.js';
import { Cooldown } from './Cooldown.js';
import { ContentPacks } from './ContentPacks.js';

function mockFetchOk(body: unknown): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
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

describe('ProviderSettings', () => {
  beforeEach(() => { cleanup(); localStorage.setItem('riftcrowd_session_token', 'test-token'); });
  afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

  it('renders form inputs', async () => {
    mockFetchOk({ host: '127.0.0.1', gatewayPort: 8787, liveProvider: 'mock', logLevel: 'info', pipeline: { rateLimitPerViewer: 10 }, ws: {} });
    render(<ProviderSettings />);
    await waitFor(() => { expect(screen.getByTestId('input-rateLimitPerViewer')).toBeInTheDocument(); });
  });

  it('submits config update', async () => {
    mockFetchOk({ host: '127.0.0.1', gatewayPort: 8787, liveProvider: 'mock', logLevel: 'info', pipeline: { rateLimitPerViewer: 10 }, ws: {} });
    render(<ProviderSettings />);
    await waitFor(() => { expect(screen.getByTestId('input-rateLimitPerViewer')).toBeInTheDocument(); });
    // Submit
    mockFetchOk({ ok: true, applied: ['rateLimitPerViewer'] });
    fireEvent.click(screen.getByText('Save Config'));
    await waitFor(() => { expect(screen.getByTestId('provider-message')).toHaveTextContent('Config updated'); });
  });

  it('shows error on failed submit', async () => {
    mockFetchOk({ host: '127.0.0.1', gatewayPort: 8787, liveProvider: 'mock', logLevel: 'info', pipeline: {}, ws: {} });
    render(<ProviderSettings />);
    await waitFor(() => { expect(screen.getByText('Save Config')).toBeInTheDocument(); });
    mockFetchError(400, 'Invalid config');
    fireEvent.click(screen.getByText('Save Config'));
    await waitFor(() => { expect(screen.getByTestId('provider-message')).toBeInTheDocument(); });
  });
});

describe('ModeSelection', () => {
  beforeEach(() => { cleanup(); localStorage.setItem('riftcrowd_session_token', 'test-token'); });
  afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

  // Phase 13 FIX 5: the misleading mode radio buttons were removed. The UI
  // now exposes a single "Skip to Next Stage" button that matches what the
  // gateway actually supports.
  it('renders skip and restart buttons (no mode radios)', () => {
    mockFetchOk({ ok: true });
    render(<ModeSelection />);
    expect(screen.queryByTestId('mode-countries')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mode-animals')).not.toBeInTheDocument();
    expect(screen.getByTestId('skip-btn')).toBeInTheDocument();
    expect(screen.getByTestId('restart-btn')).toBeInTheDocument();
  });

  it('calls skip on button click', async () => {
    mockFetchOk({ ok: true, state: 'FACTION_LOBBY' });
    render(<ModeSelection />);
    fireEvent.click(screen.getByTestId('skip-btn'));
    await waitFor(() => { expect(screen.getByTestId('mode-message')).toHaveTextContent('Skipped'); });
  });

  it('calls restart on button click', async () => {
    mockFetchOk({ ok: true, state: 'MODE_VOTE' });
    render(<ModeSelection />);
    fireEvent.click(screen.getByTestId('restart-btn'));
    await waitFor(() => { expect(screen.getByTestId('mode-message')).toHaveTextContent('restarted'); });
  });

  it('shows error on skip failure', async () => {
    mockFetchError(409, 'Cannot skip: director is IDLE');
    render(<ModeSelection />);
    fireEvent.click(screen.getByTestId('skip-btn'));
    await waitFor(() => { expect(screen.getByTestId('mode-message')).toHaveTextContent('IDLE'); });
  });
});

describe('GiftMapping', () => {
  beforeEach(() => { cleanup(); localStorage.setItem('riftcrowd_session_token', 'test-token'); });
  afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

  it('renders gift table on load', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/gifts/preview') return Promise.resolve({ ok: true, status: 200, json: async () => ({ mappings: [{ giftId: 'rose', tierId: 'spark', impact: 'add_energy' }] }), text: async () => '' });
      if (url === '/gifts/config') return Promise.resolve({ ok: true, status: 200, json: async () => ({}), text: async () => '' });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}), text: async () => '' });
    }) as unknown as typeof fetch;
    render(<GiftMapping />);
    await waitFor(() => { expect(screen.getByTestId('gift-table')).toBeInTheDocument(); });
  });

  it('shows placeholder when no mappings', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/gifts/preview') return Promise.resolve({ ok: true, status: 200, json: async () => ({ mappings: [] }), text: async () => '' });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}), text: async () => '' });
    }) as unknown as typeof fetch;
    render(<GiftMapping />);
    await waitFor(() => { expect(screen.getByText(/No mappings loaded/)).toBeInTheDocument(); });
  });
});

describe('Cooldown', () => {
  beforeEach(() => { cleanup(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('renders cooldown form', () => {
    mockFetchOk({ ok: true });
    render(<Cooldown />);
    expect(screen.getByTestId('cooldown-perUser')).toBeInTheDocument();
    expect(screen.getByTestId('cooldown-cinematic')).toBeInTheDocument();
  });

  it('validates and submits cooldowns', async () => {
    mockFetchOk({ ok: true, message: 'Gift economy config hot-reloaded' });
    render(<Cooldown />);
    fireEvent.click(screen.getByTestId('save-cooldown-btn'));
    await waitFor(() => { expect(screen.getByTestId('cooldown-message')).toBeInTheDocument(); });
  });
});

describe('ContentPacks', () => {
  beforeEach(() => { cleanup(); });
  afterEach(() => { cleanup(); });
  it('renders packs table', () => {
    render(<ContentPacks />);
    expect(screen.getByTestId('packs-table')).toBeInTheDocument();
    expect(screen.getByText('Countries')).toBeInTheDocument();
    expect(screen.getByText('Animals')).toBeInTheDocument();
  });
});
