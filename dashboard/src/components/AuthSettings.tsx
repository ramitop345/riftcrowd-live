/**
 * Phase 13 — Auth Settings.
 * Token input (masked), test connection, save to localStorage.
 *
 * Phase 13 FIX 4: Empty tokens are rejected before saving. An empty string in
 * localStorage beats the VITE_SESSION_TOKEN env fallback, so we validate first
 * and show an error if the input is blank/whitespace.
 */
import { useState, type JSX } from 'react';
import { getToken, setToken, clearToken, getHealth } from '../api/client.js';
import { css } from '../styles.js';

export function AuthSettings(): JSX.Element {
  const [token, setTokenState] = useState(getToken());
  const [masked, setMasked] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleTest = async (): Promise<void> => {
    setMessage(null);
    // Temporarily set token for the test
    setToken(token);
    const res = await getHealth();
    if (res.ok) {
      setMessage({ text: `Connection OK — provider: ${(res.data as { provider?: string }).provider ?? 'unknown'}, version: ${(res.data as { version?: string }).version ?? '?'}`, type: 'success' });
    } else {
      setMessage({ text: `Connection failed (${res.status}): ${res.error}`, type: 'error' });
    }
  };

  // FIX 4: validate non-empty before persisting
  const handleSave = (): void => {
    const trimmed = token.trim();
    if (!trimmed) {
      setMessage({ text: 'Token cannot be empty', type: 'error' });
      return;
    }
    setToken(trimmed);
    setMessage({ text: 'Token saved to localStorage', type: 'success' });
  };

  const handleClear = (): void => {
    clearToken();
    setTokenState('change-me');
    setMessage({ text: 'Token cleared (using default)', type: 'success' });
  };

  return (
    <div>
      <h2>Auth Settings</h2>
      <div style={css.card}>
        <div style={css.cardTitle}>Session Token</div>
        <div style={css.formGroup}>
          <label style={css.label}>Token</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type={masked ? 'password' : 'text'}
              style={{ ...css.input, flex: 1 }}
              value={token}
              onChange={e => setTokenState(e.target.value)}
              data-testid="token-input"
            />
            <button style={css.button('default')} onClick={() => setMasked(!masked)} data-testid="toggle-mask">
              {masked ? 'Show' : 'Hide'}
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
          <button style={css.button('primary')} onClick={() => { void handleTest(); }} data-testid="test-connection">
            Test Connection
          </button>
          <button style={css.button('success')} onClick={handleSave} data-testid="save-token">
            Save to LocalStorage
          </button>
          <button style={css.button('danger')} onClick={handleClear} data-testid="clear-token">
            Clear
          </button>
        </div>
        {message && (
          <div style={{ marginTop: '0.75rem', color: message.type === 'success' ? '#2ecc71' : '#e74c3c', fontSize: '0.85rem' }} data-testid="auth-message">
            {message.text}
          </div>
        )}
        <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#8a8fa3' }}>
          Token defaults to VITE_SESSION_TOKEN env variable. Override is stored in localStorage.
        </div>
      </div>
    </div>
  );
}
