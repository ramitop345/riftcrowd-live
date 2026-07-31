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

## Shell test

Headless smoke test for the Phase 3 application shell (`tests/test_shell.gd`). It loads and
instantiates all six shell scenes (Boot, MainMenu, Lobby, Battle, Results, ErrorOverlay) asserting
a Control root for each, checks the `AppState` transition table (allowed and forbidden pairs),
confirms every `SCENE_PATHS` entry points at an existing scene file, asserts the `UiConfig`
safe-zone margins are positive and the typography constants stay at or above the 20 px readability
floor, and exercises the static `ErrorOverlay._sanitize` (control characters stripped, 400-char
input truncated to `MAX_MESSAGE_LENGTH`, plain text untouched). Exit code 0 on success, 1 on any
failure.

```powershell
cd "c:\Program Files\Developper\riftcrowd-live\game"
& "C:\path\to\Godot_v4.3-stable_win64.exe" --headless --script res://tests/test_shell.gd
```

Expected output: `SHELL TESTS: 37 passed, 0 failed`.

## Interactive dev run

`project.godot` intentionally sets no `window/size/*_override` values, because those would also
shrink exported and streaming builds. The design resolution is 1080x1920 portrait with
`canvas_items` stretch and `keep` aspect, so for a dev run you can resize the window freely (or
start it small) — the stretch mode scales the whole shell and the safe-zone margins with it.

```powershell
cd "c:\Program Files\Developper\riftcrowd-live\game"
& "C:\path\to\Godot_v4.3-stable_win64.exe" .
```
