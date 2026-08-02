/**
 * Phase 13 — Dashboard Layout with sidebar navigation and header.
 *
 * Phase 13 FIX 8: The header's own 3s poll for connection + director state
 * pauses when the browser tab is hidden (document.visibilitychange) and
 * resumes with an immediate poll on focus.
 *
 * Phase 13 FIX 9: A <style> tag injects a media query that collapses the
 * 220px sidebar to a 56px icon-only rail on viewports ≤768px, preventing the
 * sidebar from consuming ≥35% of the screen on mobile.
 */
import { type JSX, useState, useEffect, useCallback, useRef } from 'react';
import { getHealth, getDirectorState, getVersion, type VersionResponse } from '../api/client.js';
import { css } from '../styles.js';

export interface NavItem {
  id: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'status', label: 'Status' },
  { id: 'provider', label: 'Provider' },
  { id: 'mode', label: 'Mode' },
  { id: 'gifts', label: 'Gifts' },
  { id: 'cooldowns', label: 'Cooldowns' },
  { id: 'packs', label: 'Packs' },
  { id: 'test-events', label: 'Test Events' },
  { id: 'emergency', label: 'Emergency' },
  { id: 'auth', label: 'Auth' },
];

interface LayoutProps {
  activePage: string;
  onNavigate: (page: string) => void;
  children: JSX.Element;
}

const HEADER_POLL_MS = 3000;

export function Layout({ activePage, onNavigate, children }: LayoutProps): JSX.Element {
  const [connected, setConnected] = useState(false);
  const [directorState, setDirectorState] = useState<string>('—');
  const [currentMode, setCurrentMode] = useState<string>('—');
  const [versionInfo, setVersionInfo] = useState<VersionResponse | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async (): Promise<void> => {
    const health = await getHealth();
    setConnected(health.ok);
    const dir = await getDirectorState();
    if (dir.ok) {
      setDirectorState(dir.data.state);
      setCurrentMode(dir.data.currentMode ?? '—');
    }
    // Fetch version once on first successful connection
    if (health.ok && !versionInfo) {
      const ver = await getVersion();
      if (ver.ok) {
        setVersionInfo(ver.data);
      }
    }
  }, [versionInfo]);

  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    void poll();
    intervalRef.current = setInterval(() => { void poll(); }, HEADER_POLL_MS);
  }, [poll]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  // FIX 8: pause header poll when tab is backgrounded; resume + immediate poll on focus
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

  return (
    <div style={css.page}>
      {/* FIX 9: responsive sidebar collapse on mobile */}
      <style data-testid="responsive-sidebar-style">{`
        @media (max-width: 768px) {
          .layout-sidebar { width: 56px !important; }
          .layout-sidebar .nav-label { display: none; }
          .layout-sidebar .nav-icon { margin: 0 auto; }
          .layout-sidebar .sidebar-header-label { display: none; }
        }
      `}</style>
      <nav
        style={css.sidebar}
        data-testid="sidebar"
        className="layout-sidebar"
      >
        <div style={css.sidebarHeader}>
          <span className="nav-icon" aria-hidden>◆</span>
          <span className="nav-label sidebar-header-label" style={{ marginLeft: '0.5rem' }}>RiftCrowd LIVE</span>
        </div>
        {NAV_ITEMS.map(item => (
          <a
            key={item.id}
            style={css.sidebarLink(activePage === item.id)}
            onClick={() => onNavigate(item.id)}
            data-testid={`nav-${item.id}`}
            role="button"
            tabIndex={0}
          >
            <span className="nav-icon" aria-hidden>●</span>
            <span className="nav-label" style={{ marginLeft: '0.5rem' }}>{item.label}</span>
          </a>
        ))}
      </nav>
      <div style={css.main}>
        <header style={css.header} data-testid="header">
          <span style={css.headerDot(connected)} data-testid="connection-dot" />
          <span style={{ fontSize: '0.85rem' }}>{connected ? 'Connected' : 'Disconnected'}</span>
          <span style={{ fontSize: '0.8rem', color: '#8a8fa3' }}>
            Phase: {directorState} | Mode: {currentMode}
          </span>
          {versionInfo && (
            <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: 'auto' }} data-testid="version-info">
              v{versionInfo.version} | Schema: {versionInfo.schemaVersion} | Godot: {versionInfo.godotVersion}
            </span>
          )}
        </header>
        <main style={css.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
