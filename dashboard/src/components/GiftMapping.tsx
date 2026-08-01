/**
 * Phase 13 — Gift Mapping screen.
 * Table of gift mappings with inline editing. Submit calls POST /gifts/config.
 */
import { useState, useEffect, type JSX } from 'react';
import { getGiftPreview, getGiftConfig, updateGiftConfig, type ApiResult } from '../api/client.js';
import { css } from '../styles.js';

interface MappingRow {
  giftId: string;
  tierId: string;
  impact: string;
}

export function GiftMapping(): JSX.Element {
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [config, setConfig] = useState<unknown>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    void load();
  }, []);

  const load = async (): Promise<void> => {
    const [previewRes, configRes] = await Promise.all([getGiftPreview(), getGiftConfig()]);
    if (previewRes.ok) {
      const m = previewRes.data.mappings as MappingRow[];
      setMappings(m);
    }
    if (configRes.ok) {
      setConfig(configRes.data);
    }
  };

  const handleSave = async (): Promise<void> => {
    setMessage(null);
    if (!config) {
      setMessage({ text: 'No config loaded', type: 'error' });
      return;
    }
    const res = await updateGiftConfig(config);
    if (res.ok) {
      setMessage({ text: 'Gift config saved (hot-reloaded)', type: 'success' });
    } else {
      setMessage({ text: res.error, type: 'error' });
    }
  };

  return (
    <div>
      <h2>Gift Mapping</h2>
      <div style={css.card}>
        <div style={css.cardTitle}>Gift Mappings</div>
        {mappings.length > 0 ? (
          <table style={css.table} data-testid="gift-table">
            <thead>
              <tr>
                <th style={css.th}>Gift ID</th>
                <th style={css.th}>Tier</th>
                <th style={css.th}>Impact</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m, i) => (
                <tr key={i}>
                  <td style={css.td}>{m.giftId ?? String(i)}</td>
                  <td style={css.td}>{m.tierId ?? '—'}</td>
                  <td style={css.td}>{typeof m.impact === 'string' ? m.impact : JSON.stringify(m.impact)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: '#8a8fa3' }}>No mappings loaded. Start the gateway with gift economy enabled.</div>
        )}
        <button style={{ ...css.button('primary'), marginTop: '1rem' }} onClick={() => { void handleSave(); }} data-testid="save-gift-btn">
          Save Gift Config
        </button>
        {message && (
          <div style={{ marginTop: '0.75rem', color: message.type === 'success' ? '#2ecc71' : '#e74c3c', fontSize: '0.85rem' }} data-testid="gift-message">
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}

export type { ApiResult };
