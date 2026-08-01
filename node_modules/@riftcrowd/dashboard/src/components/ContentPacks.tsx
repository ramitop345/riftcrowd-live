/**
 * Phase 13 — Content Packs screen.
 * Lists installed packs from the content/packs directory.
 */
import { type JSX } from 'react';
import { css } from '../styles.js';

const KNOWN_PACKS = [
  { id: 'countries', mode: 'countries', label: 'Countries', factions: 4 },
  { id: 'animals', mode: 'animals', label: 'Animals', factions: 4 },
  { id: 'fan_crews_original', mode: 'fan_crews_original', label: 'Fan Crews', factions: 4 },
  { id: 'cities', mode: 'cities', label: 'Cities', factions: 4 },
];

export function ContentPacks(): JSX.Element {
  return (
    <div>
      <h2>Content Packs</h2>
      <div style={css.card}>
        <div style={css.cardTitle}>Installed Packs</div>
        <table style={css.table} data-testid="packs-table">
          <thead>
            <tr>
              <th style={css.th}>Pack ID</th>
              <th style={css.th}>Mode</th>
              <th style={css.th}>Label</th>
              <th style={css.th}>Factions</th>
            </tr>
          </thead>
          <tbody>
            {KNOWN_PACKS.map(pack => (
              <tr key={pack.id}>
                <td style={css.td}>{pack.id}</td>
                <td style={css.td}>{pack.mode}</td>
                <td style={css.td}>{pack.label}</td>
                <td style={css.td}>{pack.factions}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#8a8fa3' }}>
          Pack preview depends on Phase 4 asset-validation tooling.
          SVG assets are available in content/packs/[mode]/svg/.
        </div>
      </div>
    </div>
  );
}
