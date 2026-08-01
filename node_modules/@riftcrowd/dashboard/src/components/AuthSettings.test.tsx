/**
 * Phase 13 — AuthSettings tests (5+ tests).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AuthSettings } from './AuthSettings.js';

describe('AuthSettings', () => {
  beforeEach(() => { cleanup(); localStorage.clear(); });
  afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

  it('renders token input and buttons', () => {
    render(<AuthSettings />);
    expect(screen.getByTestId('token-input')).toBeInTheDocument();
    expect(screen.getByTestId('test-connection')).toBeInTheDocument();
    expect(screen.getByTestId('save-token')).toBeInTheDocument();
    expect(screen.getByTestId('clear-token')).toBeInTheDocument();
    expect(screen.getByTestId('toggle-mask')).toBeInTheDocument();
  });

  it('token input type is password by default', () => {
    render(<AuthSettings />);
    expect(screen.getByTestId('token-input')).toHaveAttribute('type', 'password');
  });

  it('toggle mask switches input type', () => {
    render(<AuthSettings />);
    fireEvent.click(screen.getByTestId('toggle-mask'));
    expect(screen.getByTestId('token-input')).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByTestId('toggle-mask'));
    expect(screen.getByTestId('token-input')).toHaveAttribute('type', 'password');
  });

  it('save stores token in localStorage', () => {
    render(<AuthSettings />);
    fireEvent.change(screen.getByTestId('token-input'), { target: { value: 'my-secret-token' } });
    fireEvent.click(screen.getByTestId('save-token'));
    expect(localStorage.getItem('riftcrowd_session_token')).toBe('my-secret-token');
    expect(screen.getByTestId('auth-message')).toHaveTextContent('saved');
  });

  // FIX 4: empty tokens must not be persisted (they beat the env fallback)
  it('save rejects empty token', () => {
    localStorage.setItem('riftcrowd_session_token', 'existing-token');
    render(<AuthSettings />);
    fireEvent.change(screen.getByTestId('token-input'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('save-token'));
    expect(screen.getByTestId('auth-message')).toHaveTextContent('cannot be empty');
    // Existing token should remain untouched (not overwritten with empty)
    expect(localStorage.getItem('riftcrowd_session_token')).toBe('existing-token');
  });

  it('test connection calls health endpoint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ status: 'ok', provider: 'mock', version: '0.1.0' }),
      text: async () => '',
    }) as unknown as typeof fetch;
    render(<AuthSettings />);
    fireEvent.click(screen.getByTestId('test-connection'));
    await waitFor(() => { expect(screen.getByTestId('auth-message')).toHaveTextContent('Connection OK'); });
  });

  it('test connection shows error on failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof fetch;
    render(<AuthSettings />);
    fireEvent.click(screen.getByTestId('test-connection'));
    await waitFor(() => { expect(screen.getByTestId('auth-message')).toHaveTextContent('Connection failed'); });
  });

  it('clear removes token from localStorage', () => {
    localStorage.setItem('riftcrowd_session_token', 'old-token');
    render(<AuthSettings />);
    fireEvent.click(screen.getByTestId('clear-token'));
    expect(localStorage.getItem('riftcrowd_session_token')).toBeNull();
    expect(screen.getByTestId('auth-message')).toHaveTextContent('cleared');
  });
});
