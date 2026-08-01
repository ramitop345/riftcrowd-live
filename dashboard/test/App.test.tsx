/**
 * Phase 13 — App + Layout tests (5+ tests).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { App } from '../src/App.js';

const mockResponses: Record<string, unknown> = {
  '/health': { status: 'ok', uptime: 100, version: '0.1.0', provider: 'mock', timestamp: 'T' },
  '/status': { pipeline: { eventsProcessed: 0, commandsProduced: 0, dropped: 0, dedupeSize: 0, rateLimitBuckets: 0, commandQueueSize: 0, commandQueueCapacity: 500, eventBusSizes: {} }, director: null, viewerRegistrySize: 0, uptime: 100 },
  '/director/state': { state: 'MODE_VOTE', timerSeconds: 20, currentMode: null, currentModeId: null, selectedFactions: {}, stats: { roundsPlayed: 0, modeCounts: {}, factionWinCounts: {}, recentModes: [] }, paused: false },
  '/mock/state': { running: false, connected: false, scenario: null, availableScenarios: [], clockTimeMs: 0, eventsEmitted: 0, commandsProduced: 0, pendingEvents: 0, directorStates: [] },
  '/gifts/preview': { mappings: [] },
  '/gifts/config': {},
  '/engagement/config': {},
};

describe('App + Layout', () => {
  beforeEach(() => {
    cleanup();
    localStorage.setItem('riftcrowd_session_token', 'test-token');
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const body = mockResponses[url] ?? {};
      return Promise.resolve({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
    }) as unknown as typeof fetch;
  });
  afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

  it('renders sidebar with all navigation links', () => {
    render(<App />);
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('nav-status')).toBeInTheDocument();
    expect(screen.getByTestId('nav-provider')).toBeInTheDocument();
    expect(screen.getByTestId('nav-mode')).toBeInTheDocument();
    expect(screen.getByTestId('nav-gifts')).toBeInTheDocument();
    expect(screen.getByTestId('nav-cooldowns')).toBeInTheDocument();
    expect(screen.getByTestId('nav-packs')).toBeInTheDocument();
    expect(screen.getByTestId('nav-test-events')).toBeInTheDocument();
    expect(screen.getByTestId('nav-emergency')).toBeInTheDocument();
    expect(screen.getByTestId('nav-auth')).toBeInTheDocument();
  });

  it('shows header with connection status', async () => {
    render(<App />);
    await waitFor(() => { expect(screen.getByTestId('header')).toBeInTheDocument(); });
    expect(screen.getByTestId('connection-dot')).toBeInTheDocument();
  });

  it('navigates to Mode page', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('nav-mode'));
    expect(screen.getByText('Mode Selection')).toBeInTheDocument();
  });

  it('navigates to Test Events page', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('nav-test-events'));
    expect(screen.getByText('Test Events & Scenarios')).toBeInTheDocument();
  });

  it('navigates to Auth page', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('nav-auth'));
    expect(screen.getByText('Auth Settings')).toBeInTheDocument();
  });

  it('navigates to Emergency page', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('nav-emergency'));
    expect(screen.getByText('Emergency Actions')).toBeInTheDocument();
  });

  it('navigates to Packs page', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('nav-packs'));
    expect(screen.getByText('Content Packs')).toBeInTheDocument();
  });

  // Phase 13 FIX 9: responsive sidebar media query is injected
  it('injects responsive sidebar CSS for mobile viewports', () => {
    render(<App />);
    const style = screen.getByTestId('responsive-sidebar-style');
    expect(style).toBeInTheDocument();
    expect(style.textContent).toContain('@media (max-width: 768px)');
    expect(style.textContent).toContain('.layout-sidebar');
    expect(style.textContent).toContain('56px');
  });
});
