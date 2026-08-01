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

## Known Limitations

- **Godot not installed**: GDScript files are desk-check only; no runtime verification possible without Godot.
- **Placeholder audio**: Audio assets are placeholders; actual audio files are not included.
- **No real OBS/TikTok LIVE Studio testing**: Runbook instructions are based on documented behavior; real capture software has not been tested.
- **Dashboard check**: Preflight dashboard reachability check requires the dashboard dev server to be running on port 5173.
