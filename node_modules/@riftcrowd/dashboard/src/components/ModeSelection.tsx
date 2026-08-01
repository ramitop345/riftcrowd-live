/**
 * Phase 13 — Mode Selection screen.
 *
 * Phase 13 FIX 5: The previous UI exposed radio buttons for 4 modes, but the
 * gateway's POST /director/skip endpoint ignores any mode body — it just
 * advances to the next stage internally. The radio buttons were therefore
 * decorative and misleading. The UI is now honest: a single "Skip to Next
 * Stage" button that does exactly what the gateway supports, plus a
 * "Restart Director" button.
 */
import { useState, type JSX } from 'react';
import { skip, restart, type ApiResult } from '../api/client.js';
import { css } from '../styles.js';

export function ModeSelection(): JSX.Element {
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleSkip = async (): Promise<void> => {
    setMessage(null);
    const res = await skip();
    if (res.ok) {
      setMessage({ text: 'Skipped to next stage', type: 'success' });
    } else {
      setMessage({ text: res.error, type: 'error' });
    }
  };

  const handleRestart = async (): Promise<void> => {
    setMessage(null);
    const res = await restart();
    if (res.ok) {
      setMessage({ text: 'Director restarted', type: 'success' });
    } else {
      setMessage({ text: res.error, type: 'error' });
    }
  };

  return (
    <div>
      <h2>Mode Selection</h2>
      <div style={css.card}>
        <div style={css.cardTitle}>Director Stages</div>
        <div style={{ fontSize: '0.85rem', color: '#8a8fa3', marginBottom: '0.75rem' }}>
          The match director advances through stages automatically. Use the button below
          to skip to the next stage.
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button style={css.button('primary')} onClick={() => { void handleSkip(); }} data-testid="skip-btn">
            Skip to Next Stage
          </button>
          <button style={css.button('default')} onClick={() => { void handleRestart(); }} data-testid="restart-btn">
            Restart Director
          </button>
        </div>
        {message && (
          <div style={{ marginTop: '0.75rem', color: message.type === 'success' ? '#2ecc71' : '#e74c3c', fontSize: '0.85rem' }} data-testid="mode-message">
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}

export type { ApiResult };
