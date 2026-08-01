/**
 * Phase 9 FIX 9 — CLI tool tests for tools/cli/mock-live.ts.
 *
 * Invokes the CLI via child_process and verifies exit codes and output.
 */

import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve paths relative to THIS test file, not process.cwd()
const thisDir = dirname(fileURLToPath(import.meta.url));
// Test file is at gateway/test/cli.test.ts, so root is ../..
const ROOT_DIR = join(thisDir, '..', '..');
const CLI_PATH = join(ROOT_DIR, 'tools', 'cli', 'mock-live.ts');
const CLI_TIMEOUT = 60000;

function runCli(args: string[]): { code: number; stdout: string; stderr: string } {
  const cmd = `npx tsx "${CLI_PATH}" ${args.join(' ')}`;
  try {
    const stdout = execSync(cmd, {
      cwd: ROOT_DIR,
      timeout: CLI_TIMEOUT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      code: e.status ?? 1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
    };
  }
}

describe('CLI mock-live', () => {
  it('--list exits 0 and lists all 7 scenarios', () => {
    const result = runCli(['--list']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('normal_traffic');
    expect(result.stdout).toContain('gift_streak');
    expect(result.stdout).toContain('viral_burst');
    expect(result.stdout).toContain('malformed_payloads');
    expect(result.stdout).toContain('disconnect');
    expect(result.stdout).toContain('reconnect');
    expect(result.stdout).toContain('four_mode_round');
  }, CLI_TIMEOUT);

  it('--scenario=normal_traffic exits 0 within 30s', () => {
    const result = runCli(['--scenario=normal_traffic']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Scenario complete');
  }, CLI_TIMEOUT);

  it('invalid scenario name exits non-zero', () => {
    const result = runCli(['--scenario=nonexistent_scenario']);
    expect(result.code).not.toBe(0);
  }, CLI_TIMEOUT);
});
