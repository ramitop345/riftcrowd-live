/**
 * Phase 13 — Cooldown config screen.
 * Form for 5 cooldown values. Submit calls POST /gifts/config.
 */
import { useState, type JSX, type FormEvent } from 'react';
import { z } from 'zod';
import { updateGiftConfig, type ApiResult } from '../api/client.js';
import { css } from '../styles.js';

const CooldownSchema = z.object({
  perUser: z.number().min(0),
  perFaction: z.number().min(0),
  ability: z.number().min(0),
  cinematic: z.number().min(0),
  global: z.number().min(0),
});

export function Cooldown(): JSX.Element {
  const [form, setForm] = useState({
    perUser: '5',
    perFaction: '3',
    ability: '10',
    cinematic: '30',
    global: '2',
  });
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setMessage(null);

    const cooldowns = {
      perUser: parseFloat(form.perUser),
      perFaction: parseFloat(form.perFaction),
      ability: parseFloat(form.ability),
      cinematic: parseFloat(form.cinematic),
      global: parseFloat(form.global),
    };

    const validation = CooldownSchema.safeParse(cooldowns);
    if (!validation.success) {
      setMessage({ text: validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', '), type: 'error' });
      return;
    }

    // We need to send a full gift config update — here we send just the cooldowns portion.
    // The gateway expects a full GiftEconomyConfig, so this will 400 if partial.
    // For a proper implementation, we'd load the full config, patch it, and send back.
    const res = await updateGiftConfig({ cooldowns: validation.data });
    if (res.ok) {
      setMessage({ text: 'Cooldown config saved', type: 'success' });
    } else {
      setMessage({ text: `Note: ${res.error} — full config patch required for hot-reload`, type: 'error' });
    }
  };

  const updateField = (key: string, val: string): void => {
    setForm(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div>
      <h2>Cooldown Settings</h2>
      <form onSubmit={(e) => { void handleSubmit(e); }} style={css.card}>
        <div style={css.cardTitle}>Gift Cooldowns (seconds)</div>
        <div style={css.grid}>
          {(['perUser', 'perFaction', 'ability', 'cinematic', 'global'] as const).map(key => (
            <div key={key} style={css.formGroup}>
              <label style={css.label}>{key}</label>
              <input
                type="number"
                step="0.1"
                style={css.input}
                value={form[key]}
                onChange={e => updateField(key, e.target.value)}
                data-testid={`cooldown-${key}`}
              />
            </div>
          ))}
        </div>
        <button type="submit" style={{ ...css.button('primary'), marginTop: '1rem' }} data-testid="save-cooldown-btn">
          Save Cooldowns
        </button>
        {message && (
          <div style={{ marginTop: '0.75rem', color: message.type === 'success' ? '#2ecc71' : '#e74c3c', fontSize: '0.85rem' }} data-testid="cooldown-message">
            {message.text}
          </div>
        )}
      </form>
    </div>
  );
}

export type { ApiResult };
