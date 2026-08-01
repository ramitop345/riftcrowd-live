# Streaming Workflow — RiftCrowd LIVE

Overview of the RiftCrowd LIVE streaming workflow, covering gateway, dashboard, Godot game client, and capture software (OBS or TikTok LIVE Studio).

## Quick Start

See [STREAM_CHECKLIST.md](./STREAM_CHECKLIST.md) for a one-page start/stop checklist.

## Detailed Guides

- [OBS Runbook](./OBS_RUNBOOK.md) — OBS Studio setup, recording, and streaming.
- [TikTok LIVE Studio Runbook](./TIKTOK_LIVE_STUDIO_RUNBOOK.md) — TikTok LIVE Studio + TikFinity setup.

## Architecture

```text
TikTok LIVE (or MockLiveAdapter)
    |
    | gifts, likes, comments, follows, shares
    v
Provider Adapter (Mock / TikFinity)
    |
    v
Event Normalizer → Rules Engine → Command Queue
    |
    +-----> Creator Dashboard (127.0.0.1:5173)
    |
    v
WebSocket Server (127.0.0.1:8788)
    |
    v
Godot Game Client (1080×1920 portrait, borderless)
    |
    v
OBS or TikTok LIVE Studio Capture
    |
    v
TikTok Viewers
```

### Components

| Component | Port | Role |
|---|---|---|
| Gateway HTTP/API | 8787 | Event processing, rules, commands, dashboard API |
| Game WebSocket | 8788 | Gateway-to-Godot command delivery |
| Dashboard | 5173 | Creator control panel (React/Vite) |
| Godot | — | Game rendering, simulation, VFX, audio |
| OBS/LIVE Studio | — | Window capture, encoding, streaming |

## Streaming Workflow Phases

### 1. Setup

1. Start the gateway: `npm run dev:gateway`
2. Start the dashboard: `npm run dev:dashboard`
3. Launch Godot in borderless portrait mode
4. Configure OBS or TikTok LIVE Studio to capture the Godot window

### 2. Preflight

Run preflight checks before going live:

```
POST http://127.0.0.1:8787/preflight/run
Authorization: Bearer <token>
```

Checks verify:
- Gateway health
- Dashboard reachability
- Provider connection (Mock or TikFinity)
- Configuration validity
- Audio assets
- VFX configuration

### 3. Stream

- Monitor health endpoints periodically
- Watch VFX pool stats for exhaustion
- The fallback scene activates automatically on critical failures

### 4. Shutdown

1. Stop capture software
2. Stop Godot
3. Stop dashboard
4. Stop gateway: `POST http://127.0.0.1:8787/control/shutdown`

## Window Modes

RiftCrowd LIVE supports three window modes via `gateway/config/window.json`:

| Mode | Description |
|---|---|
| `windowed` | Standard windowed mode with title bar |
| `borderless` | Borderless window — recommended for OBS capture |
| `fullscreen` | Exclusive fullscreen |

Default: 1080×1920 portrait at 60 FPS with vsync enabled.

## Fallback System

The FallbackOrchestrator monitors stream health and activates a "Technical Difficulties" overlay:

| Trigger | Behavior |
|---|---|
| Gateway disconnected | Activate fallback overlay |
| Provider disconnected | Activate fallback overlay |
| VFX pool exhausted | Degrade gracefully (no overlay) |
| Audio missing | Silent (no crash, no overlay) |

Control via HTTP:
- `GET /fallback/status` — current status
- `POST /fallback/activate` — manual activation with reason
- `POST /fallback/deactivate` — manual deactivation

## Godot 4.7.1 Runtime Validation

All Godot runtime components have been validated against Godot 4.7.1 Stable (x86_64 Windows):

- **Scene loading**: All 44 `.tscn` scenes load without errors.
- **Script compilation**: All 64 `.gd` GDScript files compile cleanly (`godot --headless --path game --check` returns 0 parse errors).
- **Godot test suite**: 92/92 tests pass via `test_shell.gd`.

### Orchestrator Wiring

All Phase 15/16 gateway orchestrators are now wired into the full gateway → WebSocket → Godot pipeline:

| Orchestrator | Gateway Module | Godot Consumer |
|---|---|---|
| VFX | `VFXOrchestrator` | `VFXPool` (with LRU eviction) |
| Audio | `AudioOrchestrator` | `AudioManager` |
| Readability | `ReadabilityOrchestrator` | `ReadabilityOverlay` |
| Window | `WindowOrchestrator` | `WindowManager` |
| Preflight | `PreflightOrchestrator` | `PreflightScreen` |
| Fallback | `FallbackOrchestrator` | `FallbackScene` |

Stub handlers (logged via `push_warning`, no gameplay effect) remain for: `gift_apply`, `faction_join`, `camera_impulse`.

### 4-Tier VFX Quality Ladder

A 4-tier quality ladder is active and controlled by the gateway based on Godot-reported frame times:

| Tier | Max Particles | Max Emitters | Max Trails | Max Misc |
|---|---|---|---|---|
| Ultra | 150 | 30 | 75 | 45 |
| High | 100 | 20 | 50 | 30 |
| Medium | 50 | 10 | 25 | 15 |
| Low | 25 | 5 | 12 | 7 |

- Gateway auto-steps tier using a 60-report rolling window (3 s downgrade threshold, 5 s upgrade threshold, 5 s hysteresis).
- Godot `VFXPool.set_quality_tier(tier)` applies per-tier limits and trims idle nodes on downgrade.
- Command schema: `COMMAND_SCHEMA_VERSION=6`; new types `SET_QUALITY_TIER` (gateway → Godot) and `FRAME_REPORT` (Godot → gateway).

### Battle Scene

The Battle scene is instantiated with 8 orchestrator nodes and 12 signal mappings:

- WSClient connects to `ws://127.0.0.1:8788/ws/game` using `RIFTCROWD_TOKEN` environment variable.
- CommandDispatcher routes inbound GameCommands to VFXPool, AudioManager, ReadabilityOverlay, WindowManager, PreflightScreen, and FallbackScene.
- `battle.gd` grew from 207 to 396 lines to accommodate full orchestrator integration.

### Known Runtime Limitations

- **Headless scene transition**: Godot headless mode does not stay in the Battle scene (transitions to MainMenu) — end-to-end FRAME_REPORT flow is validated via direct calls, not real Godot ↔ gateway WebSocket.
- **No real TikFinity testing**: Adapter is tested via MockLiveAdapter fixtures only.
- **No real OBS or TikTok LIVE Studio testing**: Capture instructions are based on documented behavior.

## Known Limitations

- **Placeholder audio**: Audio assets are placeholders; actual audio files are not included.
- **Dashboard check**: Preflight dashboard reachability check requires the dashboard dev server to be running on port 5173.
- **No real OBS/TikTok LIVE Studio testing**: Runbook instructions are based on documented behavior; real capture software has not been tested.
