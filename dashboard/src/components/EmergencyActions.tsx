/**
 * Phase 13 — Emergency Actions.
 * Pause, disable gifts, clear queue, end round, reconnect, hide user.
 * All actions confirm before executing.
 *
 * Phase 13 FIX 2: "Clear Queue" now calls POST /control/drain (actually drains).
 * Phase 13 FIX 6: setTimeout ID stored in a ref and cleared on unmount so that
 * navigating away within the 4s toast window doesn't touch an unmounted component.
 */
import { useState, useEffect, useRef, type JSX } from 'react';
import {
  pause,
  resume,
  endRound,
  drainQueue,
  updateGiftConfig,
  getGiftConfig,
  mockStop,
  mockStart,
  hideUser,
  type ApiResult,
} from '../api/client.js';
import { css } from '../styles.js';

export function EmergencyActions(): JSX.Element {
  const [viewerId, setViewerId] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // FIX 6: clear pending toast timer on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const showMsg = (text: string, type: 'success' | 'error'): void => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessage({ text, type });
    timeoutRef.current = setTimeout(() => setMessage(null), 4000);
  };

  const handlePause = async (): Promise<void> => {
    if (!confirm('Pause the director?')) return;
    const res = await pause();
    if (res.ok) showMsg('Director paused', 'success');
    else showMsg(res.error, 'error');
  };

  const handleResume = async (): Promise<void> => {
    if (!confirm('Resume the director?')) return;
    const res = await resume();
    if (res.ok) showMsg('Director resumed', 'success');
    else showMsg(res.error, 'error');
  };

  const handleDisableGifts = async (): Promise<void> => {
    if (!confirm('Disable all gifts? This hot-reloads the gift config with enabled=false.')) return;
    // Load current config, set enabled=false, send back
    const configRes = await getGiftConfig();
    if (!configRes.ok) { showMsg(configRes.error, 'error'); return; }
    const patched = { ...(configRes.data as Record<string, unknown>), enabled: false };
    const res = await updateGiftConfig(patched);
    if (res.ok) showMsg('Gifts disabled', 'success');
    else showMsg(res.error, 'error');
  };

  // FIX 2: actually drain the command queue via POST /control/drain
  const handleClearQueue = async (): Promise<void> => {
    if (!confirm('Drain the command queue?')) return;
    const res = await drainQueue();
    if (res.ok) showMsg(`Queue drained: ${res.data.drained} commands removed`, 'success');
    else showMsg(res.error, 'error');
  };

  const handleEndRound = async (): Promise<void> => {
    if (!confirm('Force end the current round?')) return;
    const res = await endRound();
    if (res.ok) showMsg('Round ended', 'success');
    else showMsg(res.error, 'error');
  };

  const handleReconnect = async (): Promise<void> => {
    if (!confirm('Reconnect adapter (stop + start normal_traffic)?')) return;
    const stopRes = await mockStop();
    if (!stopRes.ok) { showMsg(stopRes.error, 'error'); return; }
    const startRes = await mockStart('normal_traffic');
    if (startRes.ok) showMsg('Reconnected with normal_traffic', 'success');
    else showMsg(startRes.error, 'error');
  };

  const handleHideUser = async (): Promise<void> => {
    if (!viewerId.trim()) { showMsg('Enter a viewer ID', 'error'); return; }
    if (!confirm(`Hide viewer "${viewerId}"?`)) return;
    const res = await hideUser(viewerId.trim());
    if (res.ok) showMsg(`Viewer ${viewerId} hidden`, 'success');
    else showMsg(res.error, 'error');
  };

  return (
    <div>
      <h2>Emergency Actions</h2>

      <div style={css.card}>
        <div style={css.cardTitle}>Director Controls</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button style={css.button('danger')} onClick={() => { void handlePause(); }} data-testid="pause-btn">
            Pause
          </button>
          <button style={css.button('success')} onClick={() => { void handleResume(); }} data-testid="resume-btn">
            Resume
          </button>
          <button style={css.button('danger')} onClick={() => { void handleEndRound(); }} data-testid="end-round-btn">
            End Round
          </button>
        </div>
      </div>

      <div style={css.card}>
        <div style={css.cardTitle}>Gift & Queue</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button style={css.button('danger')} onClick={() => { void handleDisableGifts(); }} data-testid="disable-gifts-btn">
            Disable Gifts
          </button>
          <button style={css.button('default')} onClick={() => { void handleClearQueue(); }} data-testid="clear-queue-btn">
            Clear Queue
          </button>
        </div>
      </div>

      <div style={css.card}>
        <div style={css.cardTitle}>Adapter</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button style={css.button('primary')} onClick={() => { void handleReconnect(); }} data-testid="reconnect-btn">
            Reconnect
          </button>
        </div>
      </div>

      <div style={css.card}>
        <div style={css.cardTitle}>Hide User</div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <input
            type="text"
            style={{ ...css.input, width: '200px' }}
            placeholder="Viewer ID"
            value={viewerId}
            onChange={e => setViewerId(e.target.value)}
            data-testid="hide-viewer-id"
          />
          <button style={css.button('danger')} onClick={() => { void handleHideUser(); }} data-testid="hide-user-btn">
            Hide User
          </button>
        </div>
      </div>

      {message && (
        <div style={css.toast(message.type)} data-testid="emergency-message">
          {message.text}
        </div>
      )}
    </div>
  );
}

export type { ApiResult };
