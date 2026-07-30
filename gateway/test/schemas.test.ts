import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { NormalizedLiveEventSchema } from '@riftcrowd/shared';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared', 'fixtures');

interface InvalidFixture {
  label: string;
  reason: string;
  expectedInvalidPath: (string | number)[];
  event: unknown;
}

const validEvents = JSON.parse(
  readFileSync(join(fixturesDir, 'valid-events.json'), 'utf8'),
) as unknown[];
const invalidEvents = JSON.parse(
  readFileSync(join(fixturesDir, 'invalid-events.json'), 'utf8'),
) as InvalidFixture[];

describe('NormalizedLiveEvent schema validation', () => {
  it('valid fixtures all parse', () => {
    expect(validEvents.length).toBeGreaterThan(0);
    for (const event of validEvents) {
      const result = NormalizedLiveEventSchema.safeParse(event);
      expect(result.success, `expected valid fixture to parse: ${JSON.stringify(event)}`).toBe(
        true,
      );
    }
  });

  it('invalid fixtures all reject', () => {
    expect(invalidEvents.length).toBeGreaterThan(0);
    for (const entry of invalidEvents) {
      const result = NormalizedLiveEventSchema.safeParse(entry.event);
      expect(result.success, `expected invalid fixture to reject: ${entry.label}`).toBe(false);
    }
  });
});
