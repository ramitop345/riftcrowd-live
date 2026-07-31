# Shared fixtures

Deterministic sample data for the RiftCrowd LIVE event protocol. These files exist so event
processing can be tested **without TikTok, without a provider, and without internet access**.

Everything here is fixed: stable ids, fixed ISO timestamps, invented handles. Nothing is derived from
a real TikTok session, and no real viewer data is stored.

## Files

- `valid-events.json` — one valid `NormalizedLiveEvent` per `LiveEventType`, eight in total
  (`chat`, `like`, `follow`, `share`, `gift`, `subscribe`, `join`, `provider_status`), with ids
  `evt-0001` through `evt-0008`. Every entry carries `schemaVersion: 1` and a
  `sha256:<64 hex>`-shaped `rawHash`, and must satisfy `NormalizedLiveEventSchema`. The `gift`
  entry carries a complete gift object including `streakId`, `streakEnded`, and `providerValue`.
- `invalid-events.json` — labelled rejection cases. Every entry must **fail**
  `NormalizedLiveEventSchema`, each for exactly one documented reason: missing `id`, unknown `type`,
  `likeCount` as a string, missing `user.handle`, `gift.repeatCount` of zero, negative
  `gift.repeatCount`, an unknown extra field rejected by `.strict()`, a non-ISO `receivedAt`,
  a missing `schemaVersion`, and an unsupported `schemaVersion: 2`.
- `valid-messages.json` — one valid `ProtocolMessage` per envelope kind, six in total (`event`,
  `command`, `ack`, `error`, `snapshot`, `heartbeat`), all with `protocolVersion: 1`. Every entry
  must satisfy `ProtocolMessageSchema`.
- `invalid-messages.json` — labelled envelope rejection cases in the same wrapper format as
  `invalid-events.json` (the invalid message payload lives under the `event` key), seven in total:
  unknown `kind`, missing `protocolVersion`, unsupported `protocolVersion: 2`, `ack` without
  `commandId`, `heartbeat` with a negative `sequence`, an `event` message embedding a malformed
  event, and a `command` message embedding a malformed command (missing `sourceEventIds`).
- `valid-packs.json` — two valid `ContentPack` samples: a minimal two-faction pack
  (`minimal_duel`) and an inline copy of the shipping `animals_launch` pack (kept byte-identical
  in content to `content/packs/animals/animals_launch.json` by the pack tests). Every entry must
  satisfy `ContentPackSchema`.
- `invalid-packs.json` — ten labelled pack rejection cases in the wrapper format below (the
  malformed pack lives under the `pack` key): wrong `schemaVersion`, missing `mode`, unknown
  `mode`, fewer than 2 factions, more than 4 factions, a non-`#RRGGBB` color, an uppercase
  faction id, duplicate faction ids, a case-insensitive join-keyword collision across factions
  (reported by `superRefine` at the colliding duplicate), and an unknown extra root key rejected
  by `.strict()`.

## Shape of the `invalid-*.json` files

Unlike the valid files, which are plain arrays of payloads, each invalid entry is a wrapper so a
test can assert _why_ the sample is rejected:

- `label` — short stable identifier, safe to use as a test name.
- `reason` — human-readable explanation.
- `expectedInvalidPath` — the Zod issue path the failure is expected to point at.
- `event` — the malformed payload to feed into the schema (an event in `invalid-events.json`, a
  protocol message in `invalid-messages.json`). In `invalid-packs.json` the payload key is `pack`
  instead of `event`.

## Who consumes these

- **Gateway tests** (Phase 2 onward) parse all six files and assert that every valid entry passes
  and every invalid entry fails at the documented path. This is the regression net for the schemas
  in `shared/schemas/`.
- **Godot DTO tests** (Phase 2) parse the same files so TypeScript and GDScript accept and reject
  identical payloads.
- **`MockLiveAdapter`** (Phase 9) replays `valid-events.json` to drive fully offline rounds.
- **Dashboard test buttons** (Phase 13) reuse the valid entries as canned events.

```ts
import { readFileSync } from 'node:fs';
import { NormalizedLiveEventSchema } from '@riftcrowd/shared';

const valid = JSON.parse(readFileSync('shared/fixtures/valid-events.json', 'utf8'));

for (const event of valid) {
  NormalizedLiveEventSchema.parse(event);
}
```

```ts
const cases = JSON.parse(readFileSync('shared/fixtures/invalid-events.json', 'utf8'));

for (const { label, event } of cases) {
  const result = NormalizedLiveEventSchema.safeParse(event);
  expect(result.success, label).toBe(false);
}
```

## Rules for changing fixtures

- Keep ids and timestamps stable. Tests may snapshot them.
- Adding a `LiveEventType` means adding a matching entry to `valid-events.json` in the same commit.
- One invalid entry demonstrates exactly one failure, so a test failure names the real cause.
- Never paste a captured real payload here. Fixtures are authored, not recorded.
