import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import {
  ContentPackSchema,
  buildKeywordIndex,
  matchJoinKeyword,
  type ContentPack,
} from '@riftcrowd/shared';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixturesDir = join(repoRoot, 'shared', 'fixtures');
const packsDir = join(repoRoot, 'content', 'packs');

interface InvalidPackFixture {
  label: string;
  reason: string;
  expectedInvalidPath: (string | number)[];
  pack: unknown;
}

const LAUNCH_PACK_FILES = [
  'countries/countries_launch.json',
  'animals/animals_launch.json',
  'fan_crews_original/fan_crews_original_launch.json',
  'cities/cities_launch.json',
] as const;

const validPacks = JSON.parse(
  readFileSync(join(fixturesDir, 'valid-packs.json'), 'utf8'),
) as unknown[];
const invalidPacks = JSON.parse(
  readFileSync(join(fixturesDir, 'invalid-packs.json'), 'utf8'),
) as InvalidPackFixture[];

function loadLaunchPack(relPath: string): ContentPack {
  const raw = JSON.parse(readFileSync(join(packsDir, relPath), 'utf8')) as unknown;
  return ContentPackSchema.parse(raw);
}

describe('ContentPack schema validation', () => {
  it('all four launch packs parse and ship exactly 4 factions', () => {
    for (const relPath of LAUNCH_PACK_FILES) {
      const result = ContentPackSchema.safeParse(
        JSON.parse(readFileSync(join(packsDir, relPath), 'utf8')),
      );
      expect(result.success, `expected launch pack to parse: ${relPath}`).toBe(true);
      if (!result.success) continue;
      expect(result.data.factions, relPath).toHaveLength(4);
    }
  });

  it('the animals fixture entry stays in sync with the shipping launch pack', () => {
    const shipped = JSON.parse(
      readFileSync(join(packsDir, 'animals/animals_launch.json'), 'utf8'),
    ) as unknown;
    const fixture = validPacks.find((pack) => (pack as { id?: string }).id === 'animals_launch');
    expect(fixture).toEqual(shipped);
  });

  it('valid fixtures all parse', () => {
    expect(validPacks.length).toBeGreaterThan(0);
    for (const pack of validPacks) {
      const result = ContentPackSchema.safeParse(pack);
      expect(result.success, `expected valid fixture to parse: ${JSON.stringify(pack)}`).toBe(true);
    }
  });

  it('invalid fixtures all reject at the documented path', () => {
    expect(invalidPacks.length).toBeGreaterThanOrEqual(8);
    for (const entry of invalidPacks) {
      const result = ContentPackSchema.safeParse(entry.pack);
      expect(result.success, `expected invalid fixture to reject: ${entry.label}`).toBe(false);
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

describe('join keyword handling', () => {
  const animals = loadLaunchPack('animals/animals_launch.json');

  it('buildKeywordIndex maps every lowercased keyword to its faction', () => {
    const index = buildKeywordIndex(animals);
    expect(index.get('lion')).toBe('lions');
    expect(index.get('wolves')).toBe('wolves');
    expect(index.get('3')).toBe('eagles');
    expect(index.size).toBe(12);
  });

  it('buildKeywordIndex throws on a case-insensitive collision between factions', () => {
    // Bypasses the schema on purpose: a validated pack can never reach this state.
    const colliding = {
      ...animals,
      factions: [
        { ...animals.factions[0], joinKeywords: ['lion'] },
        { ...animals.factions[1], joinKeywords: ['LION'] },
      ],
    } as ContentPack;
    expect(() => buildKeywordIndex(colliding)).toThrow(/collision/i);
  });

  it('buildKeywordIndex stays pure while matchJoinKeyword caches per pack object', () => {
    // Purity: every direct call builds a fresh (but equal) index, never a shared one.
    const first = buildKeywordIndex(animals);
    const second = buildKeywordIndex(animals);
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
    // The match cache is keyed on the pack object, so repeated calls and a distinct
    // structural clone all resolve identically — caching never changes behavior.
    const clone = ContentPackSchema.parse(JSON.parse(JSON.stringify(animals)));
    expect(matchJoinKeyword(animals, 'lion')).toBe('lions');
    expect(matchJoinKeyword(animals, 'lion')).toBe('lions');
    expect(matchJoinKeyword(clone, 'lion')).toBe('lions');
    expect(matchJoinKeyword(clone, 'bears')).toBeNull();
  });

  it('matches keywords case-insensitively', () => {
    expect(matchJoinKeyword(animals, 'LION')).toBe('lions');
    expect(matchJoinKeyword(animals, 'DrAgOnS')).toBe('dragons');
  });

  it('matches only the first whitespace-delimited token', () => {
    expect(matchJoinKeyword(animals, 'lions forever')).toBe('lions');
    expect(matchJoinKeyword(animals, '  wolves\tare cool ')).toBe('wolves');
    expect(matchJoinKeyword(animals, 'go lions')).toBeNull();
  });

  it('matches numeric shortcuts', () => {
    expect(matchJoinKeyword(animals, '1')).toBe('lions');
    expect(matchJoinKeyword(animals, '4 all the way')).toBe('dragons');
  });

  it('returns null when nothing matches', () => {
    expect(matchJoinKeyword(animals, 'bears')).toBeNull();
    expect(matchJoinKeyword(animals, '')).toBeNull();
    expect(matchJoinKeyword(animals, '   \t  ')).toBeNull();
  });

  it('caps inspection at 200 chars and never throws on hostile input', () => {
    expect(() => matchJoinKeyword(animals, 'x'.repeat(100_000))).not.toThrow();
    expect(matchJoinKeyword(animals, 'x'.repeat(100_000))).toBeNull();
    // A keyword pushed past the inspection window is ignored, not found.
    expect(matchJoinKeyword(animals, `${' '.repeat(250)}lion`)).toBeNull();
    // A keyword inside the window still matches even when the tail is huge.
    expect(matchJoinKeyword(animals, `lion ${'y'.repeat(50_000)}`)).toBe('lions');
    expect(matchJoinKeyword(animals, '\u0000\uFFFF\uD83D\uDE00 lions')).toBeNull();
  });
});
