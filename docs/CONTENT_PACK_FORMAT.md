# RiftCrowd LIVE — Content Pack Format

A content pack is the data that turns the shared combat engine into a themed mode. Adding a mode
means adding a pack, never forking gameplay code. Packs live in `content/packs/<mode>/` and are
loaded by the game from `game/content/packs/*.json`.

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
- **Resource paths are validated at load.** A missing `captainScene` is a pack error, not a runtime
  crash. The loader reports the offending pack id and field.
- **All art, audio, and naming must be original or licensed.** Country and city names may be used
  descriptively, but government seals, coats of arms, military insignia, municipal logos, transport
  logos, and copied skyline artwork are out. `fan_crews_original` factions are entirely fictional.
  See `IP_AND_PLATFORM_CHECKLIST.md`.
- **No gameplay logic in a pack.** Packs describe identity and references only. Combat behaviour lives
  in the engine, tuned through `gateway/config/gameplay.json`.
- **Additive changes only within a version.** New optional fields are fine; renaming or retyping a
  field requires a `schemaVersion` bump and a documented migration.

The Zod schema for this format and its loader arrive in **Phase 4 (Content-Pack System and Four
Launch Packs)**.
