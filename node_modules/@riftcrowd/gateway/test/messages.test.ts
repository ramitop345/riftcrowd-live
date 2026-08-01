import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { ProtocolMessageSchema } from '@riftcrowd/shared';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared', 'fixtures');

interface InvalidFixture {
  label: string;
  reason: string;
  expectedInvalidPath: (string | number)[];
  event: unknown;
}

const validMessages = JSON.parse(
  readFileSync(join(fixturesDir, 'valid-messages.json'), 'utf8'),
) as { kind: string }[];
const invalidMessages = JSON.parse(
  readFileSync(join(fixturesDir, 'invalid-messages.json'), 'utf8'),
) as InvalidFixture[];

describe('ProtocolMessage schema validation', () => {
  it('covers every message kind exactly once in the valid fixtures', () => {
    const kinds = validMessages.map((message) => message.kind).sort();
    expect(kinds).toEqual(['ack', 'command', 'error', 'event', 'heartbeat', 'snapshot']);
  });

  it('valid fixtures all parse', () => {
    for (const message of validMessages) {
      const result = ProtocolMessageSchema.safeParse(message);
      expect(result.success, `expected valid message to parse: kind=${message.kind}`).toBe(true);
    }
  });

  it('invalid fixtures all reject at the documented path', () => {
    expect(invalidMessages.length).toBe(7);
    for (const entry of invalidMessages) {
      const result = ProtocolMessageSchema.safeParse(entry.event);
      expect(result.success, `expected invalid message to reject: ${entry.label}`).toBe(false);
      if (result.success) continue;
      const expectedPath = JSON.stringify(entry.expectedInvalidPath);
      const issuePaths = result.error.issues.map((issue) => JSON.stringify(issue.path));
      expect(
        issuePaths,
        `expected an issue at ${expectedPath} for ${entry.label}, got ${issuePaths.join(', ')}`,
      ).toContain(expectedPath);
    }
  });
});
