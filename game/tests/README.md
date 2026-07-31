# Godot Headless Tests

## Protocol test

Headless fixture test for the GDScript protocol mirror (`scripts/protocol/protocol_validator.gd`).
It loads the shared fixtures directly from `../shared/fixtures/` (single source of truth, same files
the TypeScript tests use) and asserts that every valid event/message parses ok and every invalid
payload is rejected. Exit code 0 on success, 1 on any failure.

Run from the `game/` directory in Windows PowerShell (quote the Godot path if it contains spaces):

```powershell
cd "c:\Program Files\Developper\riftcrowd-live\game"
& "C:\path\to\Godot_v4.3-stable_win64.exe" --headless --script res://tests/test_protocol.gd
```

Expected output: `PROTOCOL TESTS: 30 passed, 0 failed`.

## Content pack test

Headless content-pack test for the GDScript mirror of `shared/schemas/packs.ts`
(`scripts/packs/pack_validator.gd`) and the loader (`scripts/packs/pack_loader.gd`). It reads the
same sources of truth the TypeScript tests use — `../shared/fixtures/valid-packs.json` and
`invalid-packs.json`, plus the four shipping launch packs under `../content/packs` — and asserts
that every valid fixture parses, every invalid fixture is rejected at the documented field path,
each launch pack ships exactly four factions with a `mode` equal to its directory, every launch
pack directory carries `svg/pack_icon.svg` at the loader-provided path (existence only — SVG
rasterization needs the SVG module, which headless runs do not exercise), that
`load_packs_from_dir` on the real content root returns 4 packs and 0 failures, and that the keyword
helpers match the TypeScript rules (case-insensitive, numeric shortcuts, first token only,
200-character inspection cap, no crash on multi-kilobyte input, `""` for non-string input). Exit
code 0 on success, 1 on any failure.

```powershell
cd "c:\Program Files\Developper\riftcrowd-live\game"
& "C:\path\to\Godot_v4.3-stable_win64.exe" --headless --script res://tests/test_packs.gd
```

Or from the repository root, without changing directory:

```powershell
& "C:\path\to\Godot_v4.3-stable_win64.exe" --headless --path game --script tests/test_packs.gd
```

Expected output: `PACK TESTS: 61 passed, 0 failed`.

## Shell test

Headless smoke test for the application shell (`tests/test_shell.gd`). It loads and
instantiates all seven shell scenes (Boot, MainMenu, Lobby, Battle, Results, PackPreview,
ErrorOverlay) asserting a Control root for each, checks the `AppState` transition table (allowed
and forbidden pairs, including the Phase 4 menu <-> pack-preview side trip),
confirms every `SCENE_PATHS` entry points at an existing scene file, asserts the `UiConfig`
safe-zone margins are positive and the typography constants stay at or above the 20 px readability
floor, and exercises the static `ErrorOverlay._sanitize` (control characters stripped, 400-char
input truncated to `MAX_MESSAGE_LENGTH`, plain text untouched). Exit code 0 on success, 1 on any
failure.

```powershell
cd "c:\Program Files\Developper\riftcrowd-live\game"
& "C:\path\to\Godot_v4.3-stable_win64.exe" --headless --script res://tests/test_shell.gd
```

Expected output: `SHELL TESTS: 43 passed, 0 failed`.

## Interactive dev run

`project.godot` intentionally sets no `window/size/*_override` values, because those would also
shrink exported and streaming builds. The design resolution is 1080x1920 portrait with
`canvas_items` stretch and `keep` aspect, so for a dev run you can resize the window freely (or
start it small) — the stretch mode scales the whole shell and the safe-zone margins with it.

```powershell
cd "c:\Program Files\Developper\riftcrowd-live\game"
& "C:\path\to\Godot_v4.3-stable_win64.exe" .
```
