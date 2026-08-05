# Creator Dashboard

Phase 13 — Local control panel for the streamer.

## Overview

The RiftCrowd LIVE Creator Dashboard is a React-based web application that gives the
streamer safe operational control over the gateway, director, mock adapter, gift economy,
and free engagement systems — without editing files or using the terminal.

## Quick Start

### Prerequisites

- Node.js ≥ 22
- Gateway running on `127.0.0.1:8787` with all features enabled

### Development

```powershell
# Start the gateway (all features enabled by default in server.ts)
npm run dev:gateway

# In another terminal, start the dashboard dev server
npm run dev:dashboard
```

Open `http://127.0.0.1:5173` in a browser.

### Production Build

```powershell
cd dashboard
npm run build
```

Output: `dashboard/dist/` (static HTML + JS bundle, ~276 KB, ~80 KB gzipped).

## Authentication

All mutations require a session token (`Authorization: Bearer <token>`).

- **Default token**: value of `VITE_SESSION_TOKEN` env variable, or `"change-me"` if unset.
- **Override**: Use the Auth Settings page to enter a custom token and save to localStorage.
- **Test Connection**: Calls `GET /health` to verify the token and gateway connectivity.

## Screens

### Status (default)
Real-time status cards polling every 2 seconds:
- **Gateway**: connection status, uptime
- **Provider**: connected/disconnected, active scenario, events/commands counts
- **Game**: current director state, timer, pause indicator
- **Queue**: command queue size vs capacity, dropped count
- **Pipeline**: total events processed
- **Round**: current mode, rounds played, faction win counts

### Provider Settings
Runtime configuration form for pipeline parameters:
- Rate limits (per-viewer, burst, global)
- Dedupe capacity
- Command queue capacity
- Event bus capacity
- Log level

Submits `POST /config` with Zod validation.

### Mode Selection
Radio buttons for 4 content pack modes:
- Countries, Animals, Fan Crews (Clubs), Cities

Actions: Skip to next stage, Restart director.

### Gift Mapping
Table of gift ID → tier → impact mappings loaded from `GET /gifts/preview`.
Save button sends full config via `POST /gifts/config`.

### Cooldowns
Form for 5 gift cooldown timers (perUser, perFaction, ability, cinematic, global).
Submits `POST /gifts/config` with cooldown values.

### Content Packs
Lists the 4 installed content packs with metadata (mode, label, faction count).
Pack preview depends on Phase 4 asset-validation tooling.

### Test Events & Scenarios
- 8 scenario buttons: `normal_traffic`, `gift_streak`, `viral_burst`,
  `malformed_payloads`, `disconnect`, `reconnect`, `four_mode_round`,
  `technique_demo` (red/blue joins + Finger Heart / Galaxy / Lion gifts)
- **Single Event Injection**: viewer username input plus buttons for
  `Comment "blue"` / `Comment "red"` (team join) and the three technique
  gifts (Finger Heart, Galaxy, Lion). Each click sends one event through the
  live pipeline via `POST /mock/inject` — no scenario required. The toast
  shows the produced commands or the drop reason (e.g. rate limit, cooldown).
  Gifts only fire techniques for viewers who already joined a team.
- Start/Stop/Advance Clock controls
- Record and Replay session management
- Real-time mock state display (running, connected, scenario, clock, events, commands, injected)

### Emergency Actions
All actions require browser `confirm()` dialog before executing:
- **Pause/Resume**: director timer control
- **End Round**: force RESULTS state
- **Disable Gifts**: patches gift config with `enabled: false`
- **Clear Queue**: drains command queue via `GET /commands`
- **Reconnect**: stops adapter + starts `normal_traffic` scenario
- **Hide User**: viewer moderation via `POST /viewer/hide`

### Auth Settings
- Token input (masked by default, toggle show/hide)
- Test Connection button
- Save to localStorage / Clear buttons

## API Client

The typed fetch wrapper (`dashboard/src/api/client.ts`) provides:

| Function | Endpoint |
|---|---|
| `getHealth()` | `GET /health` |
| `getStatus()` | `GET /status` |
| `getConfig()` / `updateConfig(patch)` | `GET/POST /config` |
| `getDirectorState()` | `GET /director/state` |
| `skip()` / `pause()` / `resume()` / `endRound()` / `restart()` | `POST /director/*` |
| `postEvents()` / `getEvents()` / `getCommands()` | `POST /events`, `GET /events`, `GET /commands` |
| `shutdown()` | `POST /control/shutdown` |
| `getGiftConfig()` / `updateGiftConfig()` / `getGiftPreview()` / `getGiftStats()` | `/gifts/*` |
| `getEngagementConfig()` / `updateEngagementConfig()` / `getEngagementStats()` / `getTopContributors()` | `/engagement/*` |
| `mockStart()` / `mockStop()` / `mockAdvance()` / `mockState()` / `mockRecord()` / `mockReplay()` / `mockInjectEvent()` | `/mock/*` |
| `hideUser(viewerId)` | `POST /viewer/hide` |

All mutations return `ApiResult<T>`: `{ ok: true, data, status }` or `{ ok: false, error, status }`.

## Gateway Integration

Phase 13 adds:
- `POST /viewer/hide` — hide a viewer (moderation)
- `POST /viewer/unhide` — unhide a viewer
- `server.ts` now enables all features by default (director, mock routes, gift economy,
  free engagement, viewer routes)

## Architecture

- **Stack**: React 19 + Vite 6 + TypeScript (strict) + Zod
- **Navigation**: Simple state-based routing (no react-router dependency needed)
- **Styling**: Inline styles with shared `styles.ts` module (dark theme)
- **Polling**: Status cards poll every 2s; no WebSocket push
- **Proxy**: Vite dev server proxies API calls to `127.0.0.1:8787`

## Testing

```powershell
cd dashboard
npx vitest run
```

89 tests across 8 files:
- API client: 26 tests (auth header, error handling, all endpoints)
- StatusCards: 10 tests (each card, stale indicator)
- Config screens: 12 tests (forms, validation, submit, error)
- TestEvents: 14 tests (scenarios, controls, state display, single event injection)
- EmergencyActions: 10 tests (confirm, each action, hide user)
- AuthSettings: 8 tests (token, save, test connection, clear)
- App/Layout: 8 tests (navigation, header, pages)
- E2E: 1 test with 24 assertions (complete mock stream workflow)

## Known Limitations

- **No WebSocket push.** Status cards use HTTP polling (2s interval).
- **Gift mapping UI is basic.** Inline editing of individual mappings is not implemented;
  the full config must be saved via `POST /gifts/config`.
- **Content pack preview** depends on Phase 4 asset-validation tooling; only metadata is shown.
- **No mobile app.** The dashboard is responsive web only.
- **Cooldown config** requires a full `GiftEconomyConfig` payload for hot-reload; partial
  patches return a 400 error.
- **Godot not installed.** All gateway-side GDScript is hand-authored and desk-checked only.

## Next Phase

**Phase 14 — TikFinity Adapter**: Real provider integration via a configurable WebSocket
adapter for receiving LIVE events from TikFinity (or equivalent platform).
