/**
 * Phase 18 — Config migration tests.
 *
 * Tests idempotency, backup creation, schema upgrade, and validation failure rollback.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runConfigMigration, listBackups } from '../src/config_migration.js';

describe('Config Migration', () => {
  let testConfigDir: string;

  beforeEach(() => {
    // Create a temporary config directory
    testConfigDir = join(tmpdir(), `riftcrowd-test-config-${Date.now()}`);
    mkdirSync(testConfigDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  function writeConfig(name: string, data: unknown): void {
    writeFileSync(join(testConfigDir, name), JSON.stringify(data, null, 2), 'utf8');
  }

  function readConfig(name: string): unknown {
    return JSON.parse(readFileSync(join(testConfigDir, name), 'utf8'));
  }

  describe('Idempotency', () => {
    it('running migration twice produces the same result', () => {
      writeConfig('window.json', {
        mode: 'windowed',
        portrait: true,
        width: 1080,
        height: 1920,
        vsync: true,
        fps: 60,
      });
      writeConfig('vfx.json', {
        pool: { maxParticles: 100, maxFlashes: 20, maxTrails: 50, maxOverlays: 30 },
        quality: 'high',
        frameRateBudget: 60,
        motionReduction: false,
        colorBlindMode: false,
        safeZone: { topPx: 80, bottomPx: 120, leftPx: 20, rightPx: 20 },
      });
      writeConfig('audio.json', {
        volumeGroups: { master: 80, music: 60, sfx: 90, ui: 70 },
        tracks: {},
        sfx: {},
      });
      writeConfig('readability.json', {
        colorBlindMode: false,
        motionReduction: false,
        safeZone: { topPx: 80, bottomPx: 120, leftPx: 20, rightPx: 20 },
        fontSize: 'medium',
        contrastBoost: false,
      });

      const result1 = runConfigMigration(testConfigDir);
      const result2 = runConfigMigration(testConfigDir);

      expect(result1.errors).toHaveLength(0);
      expect(result2.errors).toHaveLength(0);
      expect(result1.migrated).toEqual(result2.migrated);
    });
  });

  describe('Backup creation', () => {
    it('creates a backup for each config file', () => {
      writeConfig('window.json', { mode: 'windowed', portrait: true, width: 1080, height: 1920, vsync: true, fps: 60 });
      writeConfig('vfx.json', { pool: {}, quality: 'high', frameRateBudget: 60, motionReduction: false, colorBlindMode: false, safeZone: {} });
      writeConfig('audio.json', { volumeGroups: {}, tracks: {}, sfx: {} });
      writeConfig('readability.json', { colorBlindMode: false, motionReduction: false, safeZone: {}, fontSize: 'medium', contrastBoost: false });

      const result = runConfigMigration(testConfigDir);

      expect(result.backups.length).toBeGreaterThanOrEqual(4);
      for (const backup of result.backups) {
        expect(existsSync(backup)).toBe(true);
        expect(backup).toContain('.json.bak.');
      }
    });
  });

  describe('Schema upgrade with defaults', () => {
    it('fills in missing optional fields with defaults', () => {
      // Write a minimal window.json missing some fields
      writeConfig('window.json', { mode: 'windowed' });
      writeConfig('vfx.json', {});
      writeConfig('audio.json', {});
      writeConfig('readability.json', {});

      const result = runConfigMigration(testConfigDir);

      expect(result.errors).toHaveLength(0);
      expect(result.migrated).toContain('window.json');

      // Check that defaults were applied
      const windowConfig = readConfig('window.json') as Record<string, unknown>;
      expect(windowConfig['portrait']).toBe(true);
      expect(windowConfig['width']).toBe(1080);
      expect(windowConfig['height']).toBe(1920);
      expect(windowConfig['vsync']).toBe(true);
      expect(windowConfig['fps']).toBe(60);
    });
  });

  describe('Validation failure rollback', () => {
    it('reports error and preserves config when validation fails', () => {
      // Write all required configs
      const validConfig = { mode: 'windowed', portrait: true, width: 1080, height: 1920, vsync: true, fps: 60 };
      writeConfig('window.json', validConfig);
      writeConfig('vfx.json', { pool: {}, quality: 'high', frameRateBudget: 60, motionReduction: false, colorBlindMode: false, safeZone: {} });
      writeConfig('audio.json', { volumeGroups: {}, tracks: {}, sfx: {} });
      writeConfig('readability.json', { colorBlindMode: false, motionReduction: false, safeZone: {}, fontSize: 'medium', contrastBoost: false });

      // Write an invalid window.json (extra field that strict() rejects)
      const invalidConfig = {
        mode: 'windowed',
        portrait: true,
        width: 1080,
        height: 1920,
        vsync: true,
        fps: 60,
        invalidField: 'should fail strict validation',
      };
      writeConfig('window.json', invalidConfig);

      // Run migration — should fail for window.json
      const result = runConfigMigration(testConfigDir);

      // The migration should report an error
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors.some(e => e.includes('window.json'))).toBe(true);

      // Backups are only created for VALID files (3 valid: vfx, audio, readability)
      // The invalid window.json is NOT backed up (fix #5: validate before backup)
      expect(result.backups.length).toBeGreaterThanOrEqual(3);

      // The file should still exist (not destroyed or emptied)
      expect(existsSync(join(testConfigDir, 'window.json'))).toBe(true);

      // The content should be the invalid content (file left untouched)
      const afterContent = readFileSync(join(testConfigDir, 'window.json'), 'utf8');
      const afterConfig = JSON.parse(afterContent) as Record<string, unknown>;
      // File was preserved as-is — no backup, no overwrite
      expect(afterConfig['invalidField']).toBe('should fail strict validation');

      // A .invalid sidecar should be created for manual review
      expect(existsSync(join(testConfigDir, 'window.json.invalid'))).toBe(true);
    });
  });

  describe('JSON parse error sidecar', () => {
    it('writes .invalid sidecar on JSON parse error', () => {
      // Write valid configs for all required files except window.json
      writeConfig('vfx.json', { pool: {}, quality: 'high', frameRateBudget: 60, motionReduction: false, colorBlindMode: false, safeZone: {} });
      writeConfig('audio.json', { volumeGroups: {}, tracks: {}, sfx: {} });
      writeConfig('readability.json', { colorBlindMode: false, motionReduction: false, safeZone: {}, fontSize: 'medium', contrastBoost: false });

      // Write corrupt (non-JSON) content to window.json
      const corruptContent = 'NOT VALID JSON {{{';
      writeFileSync(join(testConfigDir, 'window.json'), corruptContent, 'utf8');

      const result = runConfigMigration(testConfigDir);

      // Migration should report an error for window.json
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors.some(e => e.includes('window.json'))).toBe(true);

      // .invalid sidecar should exist
      const invalidPath = join(testConfigDir, 'window.json.invalid');
      expect(existsSync(invalidPath)).toBe(true);

      // .invalid sidecar should contain the error message
      const sidecarContent = readFileSync(invalidPath, 'utf8');
      expect(sidecarContent).toContain('error');
      expect(sidecarContent).toContain(corruptContent);

      // No .bak file should have been created for window.json
      const hasBakForWindow = result.backups.some(b => b.includes('window.json'));
      expect(hasBakForWindow).toBe(false);

      // Original file should be untouched (still corrupt)
      const originalContent = readFileSync(join(testConfigDir, 'window.json'), 'utf8');
      expect(originalContent).toBe(corruptContent);
    });
  });

  describe('Missing optional files', () => {
    it('skips optional config files that do not exist', () => {
      writeConfig('window.json', { mode: 'windowed', portrait: true, width: 1080, height: 1920, vsync: true, fps: 60 });
      writeConfig('vfx.json', { pool: {}, quality: 'high', frameRateBudget: 60, motionReduction: false, colorBlindMode: false, safeZone: {} });
      writeConfig('audio.json', { volumeGroups: {}, tracks: {}, sfx: {} });
      writeConfig('readability.json', { colorBlindMode: false, motionReduction: false, safeZone: {}, fontSize: 'medium', contrastBoost: false });
      // tikfinity.json is optional and not created

      const result = runConfigMigration(testConfigDir);

      expect(result.skipped).toContain('tikfinity.json');
      expect(result.errors).not.toContain(expect.stringContaining('tikfinity.json'));
    });
  });

  describe('listBackups', () => {
    it('lists all backup files in config directory', () => {
      writeConfig('window.json', { mode: 'windowed', portrait: true, width: 1080, height: 1920, vsync: true, fps: 60 });
      writeConfig('vfx.json', { pool: {}, quality: 'high', frameRateBudget: 60, motionReduction: false, colorBlindMode: false, safeZone: {} });
      writeConfig('audio.json', { volumeGroups: {}, tracks: {}, sfx: {} });
      writeConfig('readability.json', { colorBlindMode: false, motionReduction: false, safeZone: {}, fontSize: 'medium', contrastBoost: false });

      runConfigMigration(testConfigDir);

      const backups = listBackups(testConfigDir);
      expect(backups.length).toBeGreaterThanOrEqual(4);
      for (const backup of backups) {
        expect(backup).toContain('.json.bak.');
      }
    });
  });
});
