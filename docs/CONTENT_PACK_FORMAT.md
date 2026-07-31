# RiftCrowd LIVE — Content Pack Format

A content pack is the data that turns the shared combat engine into a themed mode. Adding a mode
means adding a pack, never forking gameplay code. Packs are authored at
`content/packs/<mode>/<pack>.json` at the repository root and loaded by the game directly from
that path: `PackLoader.default_pack_root()` resolves `../content/packs` relative to the Godot
project (`game/`), so the packs are never copied into `game/`.

> **Layout note (Phase 4):** loading expects the repository layout with `game/` and `content/`
> side by side. Exported/packaged builds will need a copy step or a configurable pack root in a
> later phase.

Source: Section 10.4 of `RiftCrowd_LIVE_Complete_Qoder_Implementation_Guide.md`.

## Example

```json
{
  "schemaVersion": 1,
  "id": "animals_launch",
  "displayName": "Beasts of the Rift",
  "mode": "animals",
  "factions": [
    {
      "id": "lions",
      "displayName": "Lions",
      "joinKeywords": ["lion", "lions", "1"],
      "primaryColor": "#D49A27",
      "secondaryColor": "#3A2210",
      "pattern": "sunburst",
      "captainScene": "res://scenes/units/captain_lion.tscn",
      "ultimateId": "solar_roar"
    }
  ]
}
```

## Pack fields

| Field           | Type     | Required | Description                                                                 |
| --------------- | -------- | -------- | --------------------------------------------------------------------------- |
| `schemaVersion` | integer  | yes      | Content-pack format version. `1` today. Loader rejects unknown versions     |
| `id`            | string   | yes      | Unique pack id, lowercase snake_case, for example `animals_launch`          |
| `displayName`   | string   | yes      | Player-facing pack name shown on the mode card                              |
| `mode`          | string   | yes      | One of `countries`, `animals`, `fan_crews_original`, `cities`               |
| `factions`      | array    | yes      | Two to four faction objects. The MVP renders two; the format allows four    |

## Faction fields

| Field            | Type     | Required | Description                                                                |
| ---------------- | -------- | -------- | -------------------------------------------------------------------------- |
| `id`             | string   | yes      | Unique faction id within the pack, lowercase, stable across releases       |
| `displayName`    | string   | yes      | On-screen faction name                                                     |
| `joinKeywords`   | string[] | yes      | Comment keywords that join this faction. Matched case-insensitively         |
| `primaryColor`   | string   | yes      | Hex color `#RRGGBB` for banners, meters, unit tinting                      |
| `secondaryColor` | string   | yes      | Hex color `#RRGGBB` for accents and outlines                               |
| `pattern`        | string   | yes      | Original banner pattern id, for example `sunburst`. No third-party crests   |
| `captainScene`   | string   | yes      | Godot resource path to the faction captain scene, `res://...tscn`           |
| `ultimateId`     | string   | yes      | Ability id resolved against the ability table for the captain ultimate      |

## Rules

- **Keywords must be unambiguous.** No keyword may appear in two factions in the same pack. Numeric
  shortcuts (`"1"`, `"2"`) are recommended so viewers can join with one character.
- **Colors must be distinguishable on a phone.** Assume a small, bright, compressed screen. Do not
  rely on hue alone; the `pattern` field carries redundant identity.
- **`captainScene` is shape-checked only in Phase 4.** The schema validates the path shape
  (`res://….tscn`); the Node validator (`npm run validate:packs`) reports a missing scene file
  under `game/` as a **warning** (exit code stays 0). Captain scenes ship in Phase 5, at which
  point missing targets get promoted to errors.
- **All art, audio, and naming must be original or licensed.** Country and city names may be used
  descriptively, but government seals, coats of arms, military insignia, municipal logos, transport
  logos, and copied skyline artwork are out. `fan_crews_original` factions are entirely fictional.
  See `IP_AND_PLATFORM_CHECKLIST.md`.
- **No gameplay logic in a pack.** Packs describe identity and references only. Combat behaviour lives
  in the engine, tuned through `gateway/config/gameplay.json`.
- **Additive changes only within a version.** New optional fields are fine; renaming or retyping a
  field requires a `schemaVersion` bump and a documented migration.

## Join keyword matching (Phase 4)

`shared/schemas/packs.ts` ships the schema (`ContentPackSchema`) and the pure keyword helpers:

- `buildKeywordIndex(pack)` — lowercased keyword → faction id. The schema already rejects packs
  with case-insensitive keyword collisions across factions; the index throws if handed an
  unvalidated colliding pack.
- `matchJoinKeyword(pack, rawText)` — treats `rawText` as untrusted: at most the first 200
  characters are inspected, the text is trimmed, lowercased, and split on whitespace, and only
  the **first token** is matched. `"lions forever"` joins the lions; `"go lions"` does not — a
  join must lead with its keyword. Returns the faction id or `null`, and never throws on weird
  input.

## SVG placeholder convention (Phase 4)

Each faction's `pattern` id names a file at `content/packs/<mode>/svg/<pattern>.svg`, and every
pack directory also carries `svg/pack_icon.svg`. Placeholder SVGs are hand-authored original
geometry: `viewBox="0 0 256 256"`, faction primary/secondary colors only, no external references
(`href`, `url(`), no `<image>`, `<script>`, fonts, or raster data, and each file starts with the
comment `<!-- Original placeholder artwork for RiftCrowd LIVE. Not derived from any third-party
brand. -->`.

## Validation

Run `npm run validate:packs` from the repository root. It validates every pack against the
schema, checks the pack-dir/mode match, pack-id uniqueness, `svg/pack_icon.svg` existence,
pattern-SVG existence, SVG self-containment (icon and patterns), and reports missing
`captainScene` files under `game/` as warnings (captain scenes are Phase 5 work). Exit code is 0
when there are no errors. See `tools/asset-validation/README.md`.
