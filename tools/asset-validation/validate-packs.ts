/**
 * Content-pack validator for RiftCrowd LIVE (Phase 4).
 *
 * Discovers every `*.json` under `content/packs/`, validates each against `ContentPackSchema`
 * from the shared workspace, then applies repository-level checks the schema cannot see:
 *
 * ERRORS (exit code 1):
 * - JSON that does not parse, or fails the Zod schema (issue paths are printed);
 * - a pack whose directory name does not equal its `mode`;
 * - duplicate pack ids across all discovered packs;
 * - a pack directory with no `svg/pack_icon.svg`;
 * - a faction `pattern` with no matching `svg/<pattern>.svg` next to the pack file;
 * - a referenced SVG (pattern or pack icon) that is not SVG-shaped or contains external/active
 *   content (`href`, `xlink:href`, `url(`, `<image`, `<script`, `data:`, `javascript:`, or the
 *   `&#58;`/`&#40;` entity escapes) — placeholder art must be self-contained.
 *
 * WARNINGS (allowed, exit code stays 0):
 * - `captainScene` pointing at a `.tscn` that does not exist under `game/` yet.
 *   Captain scenes are Phase 5 work; the reference is validated for existence only.
 *
 * Run from the repository root: `npm run validate:packs`
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ContentPackSchema, type ContentPack } from '../../shared/schemas/packs.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const packsRoot = join(repoRoot, 'content', 'packs');
const gameRoot = join(repoRoot, 'game');

/**
 * Substrings that make a placeholder SVG unacceptable: external refs or active content.
 * `data:`/`javascript:` catch inline URIs; `&#58;` (:) and `&#40;` (() catch the entity-escaped
 * spellings of the same. All checks run on the lowercased document.
 */
const FORBIDDEN_SVG_MARKERS = [
  'href',
  'url(',
  '<image',
  '<script',
  'data:',
  'javascript:',
  '&#58;',
  '&#40;',
] as const;

/** Every pack directory must ship its icon art under svg/. */
const PACK_ICON_FILE = join('svg', 'pack_icon.svg');

interface PackReport {
  file: string;
  errors: string[];
  warnings: string[];
}

function findPackFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findPackFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      found.push(full);
    }
  }
  return found.sort();
}

/** `owner` names what the SVG belongs to in error output: `faction "lions"` or `pack icon`. */
function checkSvg(svgPath: string, report: PackReport, owner: string): void {
  const svg = readFileSync(svgPath, 'utf8');
  const rel = relative(repoRoot, svgPath);
  if (!svg.trimStart().startsWith('<') || !svg.includes('<svg') || !svg.includes('</svg>')) {
    report.errors.push(`${owner}: ${rel} does not look like an SVG document`);
    return;
  }
  const lowered = svg.toLowerCase();
  for (const marker of FORBIDDEN_SVG_MARKERS) {
    // `href` also catches `xlink:href`; `xmlns` declarations do not contain these markers.
    if (lowered.includes(marker)) {
      report.errors.push(
        `${owner}: ${rel} contains forbidden content "${marker}" ` +
          `(placeholder SVGs must be self-contained: no external refs, images, or scripts)`,
      );
    }
  }
}

function validatePackFile(file: string, seenPackIds: Map<string, string>): PackReport {
  const report: PackReport = { file: relative(repoRoot, file), errors: [], warnings: [] };

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (cause) {
    report.errors.push(`invalid JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
    return report;
  }

  const parsed = ContentPackSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      report.errors.push(`schema: [${issue.path.join('.')}] ${issue.message}`);
    }
    return report;
  }
  const pack: ContentPack = parsed.data;

  const firstSeenIn = seenPackIds.get(pack.id);
  if (firstSeenIn !== undefined) {
    report.errors.push(`duplicate pack id "${pack.id}" (already used by ${firstSeenIn})`);
  } else {
    seenPackIds.set(pack.id, report.file);
  }

  // The pack's directory (first segment under content/packs/) must equal its declared mode.
  const dirName = relative(packsRoot, file).split(sep)[0] ?? '';
  if (dirName !== pack.mode) {
    report.errors.push(`pack dir "${dirName}" does not match mode "${pack.mode}"`);
  }

  // The pack icon belongs to the pack itself, not to any faction.
  const iconPath = join(dirname(file), PACK_ICON_FILE);
  if (!existsSync(iconPath)) {
    report.errors.push(`pack icon: missing svg/pack_icon.svg`);
  } else {
    checkSvg(iconPath, report, 'pack icon');
  }

  for (const faction of pack.factions) {
    const svgPath = join(dirname(file), 'svg', `${faction.pattern}.svg`);
    if (!existsSync(svgPath)) {
      report.errors.push(
        `faction "${faction.id}": missing pattern asset svg/${faction.pattern}.svg`,
      );
    } else {
      checkSvg(svgPath, report, `faction "${faction.id}"`);
    }

    // captainScene existence is Phase 5 work; report but never fail on it.
    const scenePath = join(gameRoot, faction.captainScene.slice('res://'.length));
    if (!existsSync(scenePath)) {
      report.warnings.push(
        `faction "${faction.id}": captainScene ${faction.captainScene} not found under game/ ` +
          `(expected — captain scenes arrive in Phase 5)`,
      );
    }
  }

  return report;
}

function main(): number {
  if (!existsSync(packsRoot)) {
    console.error(`FAIL: packs directory not found: ${packsRoot}`);
    return 1;
  }
  const files = findPackFiles(packsRoot);
  if (files.length === 0) {
    console.error(`FAIL: no pack JSON files found under ${relative(repoRoot, packsRoot)}`);
    return 1;
  }

  const seenPackIds = new Map<string, string>();
  const reports = files.map((file) => validatePackFile(file, seenPackIds));

  let failCount = 0;
  let warnCount = 0;
  for (const report of reports) {
    const status = report.errors.length > 0 ? 'FAIL' : report.warnings.length > 0 ? 'WARN' : 'PASS';
    if (status === 'FAIL') failCount += 1;
    if (status === 'WARN') warnCount += 1;
    console.log(`[${status}] ${report.file}`);
    for (const error of report.errors) console.log(`  ERROR: ${error}`);
    for (const warning of report.warnings) console.log(`  WARNING: ${warning}`);
  }

  console.log(
    `\nSummary: ${reports.length} pack(s) checked — ` +
      `${reports.length - failCount - warnCount} passed, ${warnCount} with warnings, ${failCount} failed.`,
  );
  return failCount > 0 ? 1 : 0;
}

process.exitCode = main();
