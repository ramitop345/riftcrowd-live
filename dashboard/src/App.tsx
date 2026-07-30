import { useEffect, useState, type JSX } from 'react';

const GATEWAY_HEALTH_URL = 'http://127.0.0.1:8787/health';

type GatewayStatus = 'loading' | 'ok' | 'unreachable';

interface HealthResponse {
  status: string;
  provider: string;
  version: string;
  timestamp: string;
}

const styles = {
  page: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    minHeight: '100vh',
    margin: 0,
    padding: '2rem',
    backgroundColor: '#0f1220',
    color: '#e6e8f0',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '1.1rem',
  },
  dot: (color: string) => ({
    display: 'inline-block',
    width: '0.75rem',
    height: '0.75rem',
    borderRadius: '50%',
    backgroundColor: color,
  }),
  footer: {
    marginTop: 'auto',
    fontSize: '0.85rem',
    color: '#8a8fa3',
  },
} as const;

export function App(): JSX.Element {
  const [status, setStatus] = useState<GatewayStatus>('loading');
  const [provider, setProvider] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(GATEWAY_HEALTH_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Gateway responded with ${response.status}`);
        }
        return response.json() as Promise<HealthResponse>;
      })
      .then((health) => {
        setProvider(health.provider);
        setStatus('ok');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setStatus('unreachable');
      });

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <div style={styles.page}>
      <h1>RiftCrowd LIVE — Creator Dashboard</h1>
      {status === 'loading' && (
        <div style={styles.statusRow}>
          <span style={styles.dot('#c9a227')} />
          <span>Gateway: Checking…</span>
        </div>
      )}
      {status === 'ok' && (
        <div style={styles.statusRow}>
          <span style={styles.dot('#2ecc71')} />
          <span>Gateway: OK (provider: {provider})</span>
        </div>
      )}
      {status === 'unreachable' && (
        <div style={styles.statusRow}>
          <span style={styles.dot('#e74c3c')} />
          <span>Gateway: Unreachable</span>
        </div>
      )}
      <footer style={styles.footer}>Phase 1 — Bootstrap</footer>
    </div>
  );
}
