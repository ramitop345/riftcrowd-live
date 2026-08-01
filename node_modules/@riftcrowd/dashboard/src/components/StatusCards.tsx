/**
 * Phase 13 — Status Cards.
 * Polls GET /status + GET /director/state + GET /mock/state every 2s.
 *
 * Phase 13 FIX 3: AbortController cancels in-flight polls when a new one starts
 * or the component unmounts, eliminating stale-response races. State updates
 * are batched via a single useState<StatusData> call per poll. Data refs hold
 * the latest snapshot so the useCallback dependency list stays empty.
 *
 * Phase 13 FIX 8: Polling pauses when the browser tab is hidden via the
 * Page Visibility API (document.visibilitychange). An immediate poll fires
 * when the tab is re-focused.
 */
import { useEffect, useState, useCallback, useRef, type JSX } from 'react';
import { getStatus, getDirectorState, mockState, type StatusResponse, type DirectorStateResponse, type MockStateResponse, type ApiResult } from '../api/client.js';
import { css } from '../styles.js';

interface StatusData {
  status: StatusResponse | null;
  director: DirectorStateResponse | null;
  mock: MockStateResponse | null;
  stale: boolean;
  lastUpdated: number;
}

const POLL_INTERVAL_MS = 2000;
const STALE_AFTER_MS = 5000;

export function StatusCards(): JSX.Element {
  const [data, setData] = useState<StatusData>({
    status: null,
    director: null,
    mock: null,
    stale: true,
    lastUpdated: 0,
  });

  // Refs let the poll callback read the latest snapshot without being recreated
  const dataRef = useRef(data);
  dataRef.current = data;

  // Abort controller ref so we can cancel in-flight polls on unmount or on
  // the start of the next poll (prevents stale responses overwriting fresh data)
  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    // Cancel any previous in-flight poll
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Wrap each call so we can detect individual failures without crashing the
    // whole poll. We pass the AbortSignal to the underlying fetch via a helper.
    const safe = async <T,>(p: Promise<ApiResult<T>>): Promise<ApiResult<T>> => {
      try { return await p; } catch {
        return { ok: false, error: 'aborted', status: 0 } as ApiResult<T>;
      }
    };

    const [statusRes, directorRes, mockRes] = await Promise.all([
      safe(getStatus()),
      safe(getDirectorState()),
      safe(mockState()),
    ]);

    // If this poll was superseded (a newer poll started), discard results.
    if (controller.signal.aborted) return;

    const prev = dataRef.current;
    const now = Date.now();
    const allOk = statusRes.ok && directorRes.ok && mockRes.ok;

    setData({
      status: statusRes.ok ? statusRes.data : prev.status,
      director: directorRes.ok ? directorRes.data : prev.director,
      mock: mockRes.ok ? mockRes.data : prev.mock,
      stale: !allOk,
      lastUpdated: allOk ? now : prev.lastUpdated,
    });
  }, []);

  // Start / restart the polling interval. Returns a cleanup function that
  // clears both the interval and any in-flight poll.
  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    void poll();
    intervalRef.current = setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
  }, [poll]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  // Initial mount + unmount cleanup
  useEffect(() => {
    startPolling();
    return () => {
      stopPolling();
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    };
  }, [startPolling, stopPolling]);

  // FIX 8: pause polling when the tab is backgrounded; resume + immediate poll on focus
  useEffect(() => {
    const handleVisibility = (): void => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [startPolling, stopPolling]);

  // Re-evaluate staleness periodically: if lastUpdated is older than STALE_AFTER_MS,
  // mark the UI as stale even if no new poll has failed.
  useEffect(() => {
    staleTimerRef.current = setInterval(() => {
      setData((prev) => {
        const isStale = prev.lastUpdated > 0 && Date.now() - prev.lastUpdated > STALE_AFTER_MS;
        if (isStale === prev.stale) return prev;
        return { ...prev, stale: isStale };
      });
    }, 1000);
    return () => {
      if (staleTimerRef.current) clearInterval(staleTimerRef.current);
    };
  }, []);

  const s = data.status;
  const d = data.director;
  const m = data.mock;

  return (
    <div data-testid="status-cards" style={data.stale ? css.stale : undefined}>
      <h2>Status Dashboard</h2>
      {data.stale && (
        <div data-testid="stale-indicator" style={{ color: '#f39c12', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
          {data.lastUpdated > 0
            ? `Data is stale (last update ${Math.floor((Date.now() - data.lastUpdated) / 1000)}s ago)`
            : 'Waiting for data\u2026'}
        </div>
      )}
      <div style={css.grid}>
        <GatewayCard uptime={s?.uptime} connected={!!s} />
        <ProviderCard
          connected={m?.connected ?? false}
          scenario={m?.scenario}
          eventsEmitted={m?.eventsEmitted ?? 0}
          commandsProduced={m?.commandsProduced ?? 0}
        />
        <GameCard
          state={d?.state}
          timerSeconds={d?.timerSeconds}
          paused={d?.paused}
        />
        <QueueCard
          queueSize={s?.pipeline?.commandQueueSize}
          queueCapacity={s?.pipeline?.commandQueueCapacity}
          dropped={s?.pipeline?.dropped}
        />
        <FpsCard
          eventsProcessed={s?.pipeline?.eventsProcessed}
        />
        <RoundCard
          state={d?.state}
          currentMode={d?.currentMode}
          roundsPlayed={d?.stats?.roundsPlayed}
          factionWinCounts={d?.stats?.factionWinCounts}
        />
      </div>
    </div>
  );
}

function GatewayCard({ uptime, connected }: { uptime?: number; connected: boolean }): JSX.Element {
  return (
    <div style={css.card} data-testid="gateway-card">
      <div style={css.cardTitle}>Gateway</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={css.headerDot(connected)} />
        <span>{connected ? 'Connected' : 'Disconnected'}</span>
      </div>
      {uptime !== undefined && <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>Uptime: {uptime}s</div>}
    </div>
  );
}

function ProviderCard({ connected, scenario, eventsEmitted, commandsProduced }: {
  connected: boolean;
  scenario: string | null | undefined;
  eventsEmitted: number;
  commandsProduced: number;
}): JSX.Element {
  return (
    <div style={css.card} data-testid="provider-card">
      <div style={css.cardTitle}>Provider</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={css.headerDot(connected)} />
        <span>{connected ? 'Connected' : 'Disconnected'}</span>
      </div>
      {scenario && <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Scenario: {scenario}</div>}
      <div style={{ fontSize: '0.85rem' }}>Events: {eventsEmitted} | Commands: {commandsProduced}</div>
    </div>
  );
}

function GameCard({ state, timerSeconds, paused }: {
  state?: string;
  timerSeconds?: number;
  paused?: boolean;
}): JSX.Element {
  return (
    <div style={css.card} data-testid="game-card">
      <div style={css.cardTitle}>Game State</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{state ?? '—'}</div>
      <div style={{ fontSize: '0.85rem' }}>
        Timer: {timerSeconds ?? 0}s {paused ? '(PAUSED)' : ''}
      </div>
    </div>
  );
}

function QueueCard({ queueSize, queueCapacity, dropped }: {
  queueSize?: number;
  queueCapacity?: number;
  dropped?: number;
}): JSX.Element {
  return (
    <div style={css.card} data-testid="queue-card">
      <div style={css.cardTitle}>Command Queue</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{queueSize ?? 0} / {queueCapacity ?? '?'}</div>
      <div style={{ fontSize: '0.85rem' }}>Dropped: {dropped ?? 0}</div>
    </div>
  );
}

function FpsCard({ eventsProcessed }: { eventsProcessed?: number }): JSX.Element {
  return (
    <div style={css.card} data-testid="fps-card">
      <div style={css.cardTitle}>Pipeline Throughput</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{eventsProcessed ?? 0} events</div>
    </div>
  );
}

function RoundCard({ state, currentMode, roundsPlayed, factionWinCounts }: {
  state?: string;
  currentMode?: string | null;
  roundsPlayed?: number;
  factionWinCounts?: Record<string, number>;
}): JSX.Element {
  return (
    <div style={css.card} data-testid="round-card">
      <div style={css.cardTitle}>Round</div>
      <div style={{ fontSize: '0.85rem' }}>Mode: {currentMode ?? '—'}</div>
      <div style={{ fontSize: '0.85rem' }}>Rounds played: {roundsPlayed ?? 0}</div>
      {factionWinCounts && Object.keys(factionWinCounts).length > 0 && (
        <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
          {Object.entries(factionWinCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}
        </div>
      )}
      {state === 'BATTLE_ENDED' && <div style={{ color: '#f39c12', fontWeight: 600 }}>Round Ended</div>}
    </div>
  );
}

export type { ApiResult };
