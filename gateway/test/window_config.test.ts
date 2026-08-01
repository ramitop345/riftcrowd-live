/**
 * Phase 16 — Window Config unit tests.
 *
 * Tests: WindowConfigSchema (validation, defaults, hot-reload).
 * Total target: ≥5 tests.
 */

import { describe, it, expect } from 'vitest';
import {
  WindowConfigSchema,
  WINDOW_DEFAULTS,
  loadWindowConfig,
  reloadWindowConfig,
} from '../src/window/window_config.js';

// ===================================================================
// WindowConfigSchema
// ===================================================================

describe('WindowConfigSchema', () => {
  it('validates the default config', () => {
    const result = WindowConfigSchema.safeParse(WINDOW_DEFAULTS);
    expect(result.success).toBe(true);
  });

  it('has correct default values', () => {
    expect(WINDOW_DEFAULTS.mode).toBe('windowed');
    expect(WINDOW_DEFAULTS.portrait).toBe(true);
    expect(WINDOW_DEFAULTS.width).toBe(1080);
    expect(WINDOW_DEFAULTS.height).toBe(1920);
    expect(WINDOW_DEFAULTS.vsync).toBe(true);
    expect(WINDOW_DEFAULTS.fps).toBe(60);
  });

  it('accepts borderless mode', () => {
    const config = { ...WINDOW_DEFAULTS, mode: 'borderless' };
    expect(WindowConfigSchema.safeParse(config).success).toBe(true);
  });

  it('accepts fullscreen mode', () => {
    const config = { ...WINDOW_DEFAULTS, mode: 'fullscreen' };
    expect(WindowConfigSchema.safeParse(config).success).toBe(true);
  });

  it('rejects invalid mode', () => {
    const invalid = { ...WINDOW_DEFAULTS, mode: 'tiled' };
    expect(WindowConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects negative width', () => {
    const invalid = { ...WINDOW_DEFAULTS, width: -1 };
    expect(WindowConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects zero fps', () => {
    const invalid = { ...WINDOW_DEFAULTS, fps: 0 };
    expect(WindowConfigSchema.safeParse(invalid).success).toBe(false);
  });

  // FIX 6: Degenerate resolution tests
  it('rejects width below minimum (1)', () => {
    const invalid = { ...WINDOW_DEFAULTS, width: 1 };
    expect(WindowConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects width above maximum (100000)', () => {
    const invalid = { ...WINDOW_DEFAULTS, width: 100000 };
    expect(WindowConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects height below minimum (1)', () => {
    const invalid = { ...WINDOW_DEFAULTS, height: 1 };
    expect(WindowConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects height above maximum (100000)', () => {
    const invalid = { ...WINDOW_DEFAULTS, height: 100000 };
    expect(WindowConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects fps below minimum (5)', () => {
    const invalid = { ...WINDOW_DEFAULTS, fps: 5 };
    expect(WindowConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects fps above maximum (1000)', () => {
    const invalid = { ...WINDOW_DEFAULTS, fps: 1000 };
    expect(WindowConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects unknown field (strict)', () => {
    const invalid = { ...WINDOW_DEFAULTS, unknownField: true };
    expect(WindowConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('loadWindowConfig returns defaults on missing file', () => {
    const config = loadWindowConfig('/nonexistent/path.json');
    expect(config.mode).toBe('windowed');
    expect(config.width).toBe(1080);
    expect(config.height).toBe(1920);
  });

  it('loadWindowConfig loads from default path', () => {
    const config = loadWindowConfig();
    expect(config.mode).toBe('windowed');
    expect(config.fps).toBe(60);
  });

  it('reloadWindowConfig returns ok on valid file', () => {
    const result = reloadWindowConfig();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.width).toBe(1080);
    }
  });

  it('reloadWindowConfig returns errors on invalid file', () => {
    const result = reloadWindowConfig('/nonexistent/path.json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});
