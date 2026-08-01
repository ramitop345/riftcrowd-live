/**
 * Phase 13 — Provider Settings config screen.
 * Form for gateway config (rate limits, dedupe capacity, etc.).
 */
import { useState, type JSX, type FormEvent } from 'react';
import { z } from 'zod';
import { updateConfig, getConfig, type ConfigResponse, type ApiResult } from '../api/client.js';
import { css } from '../styles.js';
import { useEffect } from 'react';

const ProviderSchema = z.object({
  rateLimitPerViewer: z.number().int().positive().optional(),
  rateLimitBurst: z.number().int().positive().optional(),
  rateLimitGlobal: z.number().int().positive().optional(),
  dedupeCapacity: z.number().int().positive().optional(),
  commandQueueCapacity: z.number().int().positive().optional(),
  eventBusCapacity: z.number().int().positive().optional(),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
});

export function ProviderSettings(): JSX.Element {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [form, setForm] = useState({
    rateLimitPerViewer: '',
    rateLimitBurst: '',
    rateLimitGlobal: '',
    dedupeCapacity: '',
    commandQueueCapacity: '',
    eventBusCapacity: '',
    logLevel: 'info',
  });
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    void getConfig().then((res) => {
      if (res.ok) {
        setConfig(res.data);
        const p = res.data.pipeline;
        setForm({
          rateLimitPerViewer: String(p['rateLimitPerViewer'] ?? ''),
          rateLimitBurst: String(p['rateLimitBurst'] ?? ''),
          rateLimitGlobal: String(p['rateLimitGlobal'] ?? ''),
          dedupeCapacity: String(p['dedupeCapacity'] ?? ''),
          commandQueueCapacity: String(p['commandQueueCapacity'] ?? ''),
          eventBusCapacity: String(p['eventBusCapacity'] ?? ''),
          logLevel: res.data.logLevel ?? 'info',
        });
      }
    });
  }, []);

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setMessage(null);

    const patch: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(form)) {
      if (key === 'logLevel') {
        if (val) patch[key] = val;
      } else {
        const num = parseInt(val, 10);
        if (!isNaN(num) && num > 0) patch[key] = num;
      }
    }

    const validation = ProviderSchema.safeParse(patch);
    if (!validation.success) {
      setMessage({ text: validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', '), type: 'error' });
      return;
    }

    const res = await updateConfig(patch);
    if (res.ok) {
      setMessage({ text: 'Config updated successfully', type: 'success' });
    } else {
      setMessage({ text: res.error, type: 'error' });
    }
  };

  const updateField = (key: string, val: string): void => {
    setForm(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div>
      <h2>Provider Settings</h2>
      <form onSubmit={(e) => { void handleSubmit(e); }} style={css.card}>
        <div style={css.grid}>
          {(['rateLimitPerViewer', 'rateLimitBurst', 'rateLimitGlobal', 'dedupeCapacity', 'commandQueueCapacity', 'eventBusCapacity'] as const).map(key => (
            <div key={key} style={css.formGroup}>
              <label style={css.label}>{key}</label>
              <input
                type="number"
                style={css.input}
                value={form[key]}
                onChange={e => updateField(key, e.target.value)}
                data-testid={`input-${key}`}
              />
            </div>
          ))}
          <div style={css.formGroup}>
            <label style={css.label}>Log Level</label>
            <select
              style={css.input}
              value={form.logLevel}
              onChange={e => updateField('logLevel', e.target.value)}
              data-testid="input-logLevel"
            >
              {['fatal', 'error', 'warn', 'info', 'debug', 'trace'].map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        </div>
        <button type="submit" style={{ ...css.button('primary'), marginTop: '1rem' }}>Save Config</button>
        {message && (
          <div style={{ marginTop: '0.75rem', color: message.type === 'success' ? '#2ecc71' : '#e74c3c', fontSize: '0.85rem' }} data-testid="provider-message">
            {message.text}
          </div>
        )}
        {config && (
          <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#8a8fa3' }}>
            Host: {config.host} | Port: {config.gatewayPort} | Provider: {config.liveProvider}
          </div>
        )}
      </form>
    </div>
  );
}

export type { ApiResult };
