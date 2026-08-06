/**
 * Phase 13 — Test Events and Scenario Replay.
 * Buttons for 8 scenarios + start/stop/advance/record/replay, plus single-event
 * injection (red/blue join comments, Finger Heart / Galaxy / Lion gifts).
 */
import { useState, useEffect, type JSX } from 'react';
import { mockStart, mockStop, mockAdvance, mockState, mockRecord, mockReplay, mockInjectEvent, type MockStateResponse, type ApiResult } from '../api/client.js';
import { css } from '../styles.js';

const SCENARIOS = [
  'normal_traffic',
  'gift_streak',
  'viral_burst',
  'malformed_payloads',
  'disconnect',
  'reconnect',
  'four_mode_round',
  'technique_demo',
] as const;

// Technique gifts matching gateway/config/gifts.json mappings:
// Finger Heart → tier 1, Galaxy → tier 2, Lion → tier 3, Hand Heart → tier 4 (laser).
const INJECT_GIFTS = [
  { giftId: 'gift_021', name: 'Finger Heart', providerValue: 1 },
  { giftId: 'gift_022', name: 'Galaxy', providerValue: 10 },
  { giftId: 'gift_023', name: 'Lion', providerValue: 100 },
  { giftId: 'gift_024', name: 'Hand Heart', providerValue: 1 },
] as const;

const JOIN_COMMENTS = ['blue', 'red'] as const;

export function TestEvents(): JSX.Element {
  const [state, setState] = useState<MockStateResponse | null>(null);
  const [advanceMs, setAdvanceMs] = useState('5000');
  const [replayPath, setReplayPath] = useState('');
  const [viewerId, setViewerId] = useState('dashboard_tester');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    void poll();
    const id = setInterval(() => { void poll(); }, 2000);
    return () => clearInterval(id);
  }, []);

  const poll = async (): Promise<void> => {
    const res = await mockState();
    if (res.ok) setState(res.data);
  };

  const handleStart = async (scenario: string): Promise<void> => {
    setMessage(null);
    const res = await mockStart(scenario);
    if (res.ok) setMessage({ text: `Started: ${scenario}`, type: 'success' });
    else setMessage({ text: res.error, type: 'error' });
    void poll();
  };

  const handleStop = async (): Promise<void> => {
    setMessage(null);
    const res = await mockStop();
    if (res.ok) setMessage({ text: 'Stopped', type: 'success' });
    else setMessage({ text: res.error, type: 'error' });
    void poll();
  };

  const handleAdvance = async (): Promise<void> => {
    setMessage(null);
    const ms = parseInt(advanceMs, 10);
    // FIX 7: reject zero/negative values — ms=0 is a silent no-op with a
    // misleading success toast.
    if (!Number.isFinite(ms) || ms <= 0) {
      setMessage({ text: 'Advance time must be > 0', type: 'error' });
      return;
    }
    const res = await mockAdvance(ms);
    if (res.ok) setMessage({ text: `Advanced ${ms}ms`, type: 'success' });
    else setMessage({ text: res.error, type: 'error' });
    void poll();
  };

  const handleRecord = async (scenario: string): Promise<void> => {
    setMessage(null);
    const res = await mockRecord(scenario);
    if (res.ok) setMessage({ text: `Recorded: ${scenario}`, type: 'success' });
    else setMessage({ text: res.error, type: 'error' });
  };

  const handleReplay = async (): Promise<void> => {
    setMessage(null);
    if (!replayPath) { setMessage({ text: 'Enter a session path', type: 'error' }); return; }
    const res = await mockReplay(replayPath);
    if (res.ok) setMessage({ text: `Replayed: ${replayPath}`, type: 'success' });
    else setMessage({ text: res.error, type: 'error' });
    void poll();
  };

  const handleInject = async (
    payload: { kind: 'comment'; comment: string } | { kind: 'gift'; giftId: string; giftName: string; providerValue: number },
    label: string,
  ): Promise<void> => {
    setMessage(null);
    const viewer = viewerId.trim() || 'dashboard_tester';
    const res = await mockInjectEvent({ ...payload, viewerId: viewer, displayName: viewer });
    if (!res.ok) {
      setMessage({ text: res.error, type: 'error' });
    } else if (res.data.dropped) {
      setMessage({ text: `${label}: dropped (${res.data.reason ?? 'unknown'})`, type: 'error' });
    } else if (res.data.commandTypes.length === 0) {
      setMessage({ text: `${label}: processed, no commands produced`, type: 'success' });
    } else {
      const joined = res.data.autoJoined ? ` (auto-joined ${res.data.autoJoined})` : '';
      setMessage({ text: `${label}: ${res.data.commandTypes.join(', ')}${joined}`, type: 'success' });
    }
    void poll();
  };

  return (
    <div>
      <h2>Test Events & Scenarios</h2>

      <div style={css.card}>
        <div style={css.cardTitle}>Scenario Buttons</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {SCENARIOS.map(s => (
            <button key={s} style={css.button('primary')} onClick={() => { void handleStart(s); }} data-testid={`scenario-${s}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div style={css.card}>
        <div style={css.cardTitle}>Single Event Injection</div>
        <div style={{ fontSize: '0.8rem', color: '#8a8fa3', marginBottom: '0.5rem' }}>
          Sends one event through the live pipeline — no scenario needed. Comments
          &quot;blue&quot;/&quot;red&quot; make the viewer join that team, and every gift they send
          goes to the team they last commented (commenting the other color switches
          sides). Senders without any team comment get one assigned and a fighter
          spawned. Gift cooldowns apply; the game only shakes when a technique
          cannot launch because the sender's team has no fighters left.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              style={{ ...css.input, width: '180px' }}
              placeholder="Viewer username"
              value={viewerId}
              onChange={e => setViewerId(e.target.value)}
              data-testid="inject-viewer"
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {JOIN_COMMENTS.map(c => (
              <button
                key={c}
                style={css.button('default')}
                onClick={() => { void handleInject({ kind: 'comment', comment: c }, `Comment "${c}"`); }}
                data-testid={`inject-comment-${c}`}
              >
                Comment &quot;{c}&quot;
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {INJECT_GIFTS.map(g => (
              <button
                key={g.giftId}
                style={css.button('primary')}
                onClick={() => { void handleInject({ kind: 'gift', giftId: g.giftId, giftName: g.name, providerValue: g.providerValue }, g.name); }}
                data-testid={`inject-gift-${g.giftId}`}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={css.card}>
        <div style={css.cardTitle}>Controls</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <button style={css.button('danger')} onClick={() => { void handleStop(); }} data-testid="stop-btn">
            Stop
          </button>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="number"
              style={{ ...css.input, width: '100px' }}
              value={advanceMs}
              onChange={e => setAdvanceMs(e.target.value)}
              data-testid="advance-ms"
            />
            <button style={css.button('default')} onClick={() => { void handleAdvance(); }} data-testid="advance-btn">
              Advance Clock
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <select style={{ ...css.input, width: '180px' }} data-testid="record-select">
              {SCENARIOS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button
              style={css.button('default')}
              onClick={(e) => {
                const sel = (e.currentTarget.previousElementSibling as HTMLSelectElement)?.value;
                if (sel) void handleRecord(sel);
              }}
              data-testid="record-btn"
            >
              Record
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              style={{ ...css.input, width: '200px' }}
              placeholder="Session path"
              value={replayPath}
              onChange={e => setReplayPath(e.target.value)}
              data-testid="replay-path"
            />
            <button style={css.button('default')} onClick={() => { void handleReplay(); }} data-testid="replay-btn">
              Replay
            </button>
          </div>
        </div>
      </div>

      <div style={css.card}>
        <div style={css.cardTitle}>Mock State</div>
        {state ? (
          <div style={{ fontSize: '0.85rem' }} data-testid="mock-state">
            <div>Running: {state.running ? 'Yes' : 'No'}</div>
            <div>Connected: {state.connected ? 'Yes' : 'No'}</div>
            <div>Scenario: {state.scenario ?? '—'}</div>
            <div>Clock: {state.clockTimeMs}ms</div>
            <div>Events: {state.eventsEmitted} | Commands: {state.commandsProduced} | Injected: {state.eventsInjected}</div>
            <div>Pending: {state.pendingEvents}</div>
          </div>
        ) : (
          <div style={{ color: '#8a8fa3' }}>Loading...</div>
        )}
      </div>

      {message && (
        <div style={css.toast(message.type)} data-testid="test-message">
          {message.text}
        </div>
      )}
    </div>
  );
}

export type { ApiResult };
