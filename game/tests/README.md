# Godot Protocol Tests

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
