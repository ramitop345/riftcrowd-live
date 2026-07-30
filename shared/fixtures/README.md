# Shared fixtures

Deterministic sample data for the RiftCrowd LIVE event protocol. These files exist so event
processing can be tested **without TikTok, without a provider, and without internet access**.

Everything here is fixed: stable ids, fixed ISO timestamps, invented handles. Nothing is derived from
a real TikTok session, and no real viewer data is stored.

## Files

- `valid-events.json` — one valid `NormalizedLiveEvent` per `LiveEventType`, eight in total
  (`chat`, `like`, `follow`, `share`, `gift`, `subscribe`, `join`, `provider_status`), with ids
  `evt-0001` through `evt-0008`. Every entry must satisfy `NormalizedLiveEventSchema`. The `gift`
  entry carries a complete gift object including `streakId`, `streakEnded`, and `providerValue`.
- `invalid-events.json` — labelled rejection cases. Every entry must **fail**
  `NormalizedLiveEventSchema`, each for exactly one documented reason: missing `id`, unknown `type`,
  `likeCount` as a string, missing `user.handle`, `gift.repeatCount` of zero, negative
  `gift.repeatCount`, an unknown extra field rejected by `.strict()`, and a non-ISO `receivedAt`.

## Shape of `invalid-events.json`

Unlike `valid-events.json`, which is a plain array of events, each invalid entry is a wrapper so a
test can assert _why_ the sample is rejected:

- `label` — short stable identifier, safe to use as a test name.
- `reason` — human-readable explanation.
- `expectedInvalidPath` — the Zod issue path the failure is expected to point at.
- `event` — the malformed payload to feed into the schema.

## Who consumes these

- **Gateway tests** (Phase 2 onward) parse both files and assert that every valid entry passes and
  every invalid entry fails at the documented path. This is the regression net for the schemas in
  `shared/schemas/`.
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
