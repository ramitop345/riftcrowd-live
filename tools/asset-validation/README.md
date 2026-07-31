# Asset Validation Tool

Validates every content pack under `content/packs/` against the shared Zod schema
(`shared/schemas/packs.ts`) plus repository-level checks the schema cannot see.

## Usage

From the repository root:

```powershell
npm run validate:packs
```

The script runs `tools/asset-validation/validate-packs.ts` through `tsx` (hoisted to the root
`node_modules` by npm workspaces from the gateway's devDependencies) and imports the schema
directly from the shared workspace source, so no build step is needed.

## What is checked

Errors (exit code 1):

- JSON that does not parse, or fails `ContentPackSchema` (Zod issue paths are printed);
- a pack stored in a directory whose name does not equal the pack's `mode`;
- duplicate pack ids across all discovered packs;
- a pack directory with no `svg/pack_icon.svg` beside the pack file;
- a faction `pattern` with no matching `svg/<pattern>.svg` beside the pack file;
- a referenced SVG (pattern or pack icon) that is not SVG-shaped or contains `href`/`xlink:href`,
  `url(`, `<image`, `<script`, `data:`, `javascript:`, or the `&#58;`/`&#40;` entity escapes —
  placeholder art must be fully self-contained (no external refs, fonts, or raster data).

Warnings (allowed; exit code stays 0):

- `captainScene` pointing at a `.tscn` that does not exist under `game/` yet. Captain scenes
  arrive in Phase 5, so every launch pack currently reports this warning by design.

## Layout note

The validator and the game both read packs from `content/packs/` at the repository root (the
game resolves it as `../content/packs` from `game/`). Phase 4 expects that repository layout;
exported/packaged builds will need a copy step or a configurable pack root in a later phase.

## Output

One `[PASS]` / `[WARN]` / `[FAIL]` line per pack file with indented `ERROR:` / `WARNING:`
details, then a summary line. Exit code is `0` when there are no errors (warnings allowed),
`1` otherwise, so it can gate CI.

## Type checking and linting

`tools/**/*.ts` is covered by the root gates: `npm run typecheck` runs `tsc -p tools --noEmit`
via `tools/tsconfig.json` (strict, NodeNext, `@types/node`), and `npm run lint` covers `tools/`
because it is not in the ESLint ignore list.
