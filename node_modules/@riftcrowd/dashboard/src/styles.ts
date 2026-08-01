/** Phase 13 — Shared styles for the dashboard. */
export const colors = {
  bg: '#0f1220',
  surface: '#1a1e30',
  surfaceHover: '#252a40',
  border: '#2a2f45',
  text: '#e6e8f0',
  textMuted: '#8a8fa3',
  primary: '#5b6ef5',
  success: '#2ecc71',
  danger: '#e74c3c',
  warning: '#f39c12',
  info: '#3498db',
} as const;

export const css = {
  page: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    minHeight: '100vh',
    margin: 0,
    backgroundColor: colors.bg,
    color: colors.text,
    display: 'flex',
  },
  sidebar: {
    width: '220px',
    backgroundColor: colors.surface,
    borderRight: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column',
    padding: '1rem 0',
    flexShrink: 0,
  },
  sidebarLink: (active: boolean) => ({
    display: 'block',
    padding: '0.6rem 1.2rem',
    color: active ? colors.primary : colors.text,
    textDecoration: 'none',
    backgroundColor: active ? colors.surfaceHover : 'transparent',
    borderLeft: active ? `3px solid ${colors.primary}` : '3px solid transparent',
    fontSize: '0.9rem',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  }),
  sidebarHeader: {
    padding: '0.6rem 1.2rem',
    fontWeight: 700,
    fontSize: '1rem',
    color: colors.primary,
    marginBottom: '0.5rem',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem 1.5rem',
    backgroundColor: colors.surface,
    borderBottom: `1px solid ${colors.border}`,
    flexWrap: 'wrap',
  },
  headerDot: (connected: boolean) => ({
    display: 'inline-block',
    width: '0.6rem',
    height: '0.6rem',
    borderRadius: '50%',
    backgroundColor: connected ? colors.success : colors.danger,
  }),
  content: {
    flex: 1,
    padding: '1.5rem',
    overflowY: 'auto',
  },
  card: {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1rem',
  },
  cardTitle: {
    fontSize: '0.85rem',
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '0.5rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '1rem',
  },
  button: (variant: 'primary' | 'danger' | 'success' | 'default' = 'default') => ({
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#fff',
    backgroundColor:
      variant === 'primary'
        ? colors.primary
        : variant === 'danger'
          ? colors.danger
          : variant === 'success'
            ? colors.success
            : colors.surfaceHover,
    transition: 'opacity 0.15s',
  }),
  input: {
    padding: '0.5rem',
    borderRadius: '6px',
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bg,
    color: colors.text,
    fontSize: '0.85rem',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  label: {
    display: 'block',
    fontSize: '0.8rem',
    color: colors.textMuted,
    marginBottom: '0.25rem',
  },
  formGroup: {
    marginBottom: '0.75rem',
  },
  toast: (type: 'success' | 'error') => ({
    position: 'fixed' as const,
    bottom: '1rem',
    right: '1rem',
    padding: '0.75rem 1.25rem',
    borderRadius: '8px',
    color: '#fff',
    backgroundColor: type === 'success' ? colors.success : colors.danger,
    fontSize: '0.85rem',
    zIndex: 1000,
  }),
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '0.85rem',
  },
  th: {
    textAlign: 'left' as const,
    padding: '0.5rem',
    borderBottom: `1px solid ${colors.border}`,
    color: colors.textMuted,
    fontSize: '0.8rem',
  },
  td: {
    padding: '0.5rem',
    borderBottom: `1px solid ${colors.border}`,
  },
  stale: {
    opacity: 0.5,
    fontStyle: 'italic' as const,
  },
} as const;

/** Simple toast notification hook helper. */
export interface Toast {
  message: string;
  type: 'success' | 'error';
}
