# TikTok LIVE Studio Runbook — RiftCrowd LIVE

Complete guide for streaming RiftCrowd LIVE with TikTok LIVE Studio.

## Prerequisites

- TikTok LIVE Studio installed.
- TikTok account with LIVE access and in good standing.
- RiftCrowd LIVE built (`npm install` from repository root).
- TikFinity installed and configured (for live event ingestion).

## TikFinity Setup

TikFinity bridges TikTok LIVE events into RiftCrowd LIVE.

1. **Install TikFinity** — download from [tikfinity.zerody.one](https://tikfinity.zerody.one/).
2. **Configure TikFinity** to connect to your TikTok LIVE session.
3. **Note the local WebSocket URL** — default is `ws://127.0.0.1:23184/ws`.
4. **Start TikFinity** and confirm it shows "Connected" to your TikTok LIVE.

## Gateway Setup

Configure the gateway for TikFinity provider:

1. Set environment variables in `.env`:
   ```env
   LIVE_PROVIDER=tikfinity
   TIKFINITY_URL=ws://127.0.0.1:23184/ws
   TIKFINITY_TOKEN=<your-tikfinity-token>
   LOCAL_SESSION_TOKEN=<your-local-token>
   ```
2. Start the gateway:
   ```
   npm run dev:gateway
   ```
3. Verify the gateway health:
   ```
   GET http://127.0.0.1:8787/health
   ```
   The response should show `"provider": "tikfinity"`.

## TikTok LIVE Studio Scene Setup

### 1. Create a new scene

- Open TikTok LIVE Studio.
- Create a new scene or select an existing one.

### 2. Add Window Capture

- Add a **Window Capture** source.
- Select the Godot game window.
- Set resolution to **1080×1920** (portrait).

### 3. Add audio sources

- Add **Microphone** source for streamer commentary.
- Add **System Audio** or **Application Audio** source for game audio.

### 4. Add overlays (optional)

- Add image overlay (streamer logo).
- Add text overlay (stream title, donation alerts).

## Starting the Stream

1. **Start TikFinity** — connect to your TikTok LIVE session.
2. **Start gateway** with TikFinity provider (`npm run dev:gateway`).
3. **Start dashboard** (`npm run dev:dashboard`).
4. **Launch Godot** in borderless portrait mode.
5. **Run preflight checks**:
   ```
   POST http://127.0.0.1:8787/preflight/run
   Authorization: Bearer <your-token>
   ```
   Confirm all checks pass, especially the **provider** check.
6. **Start TikTok LIVE Studio streaming**.

## Stopping the Stream

1. **Stop TikTok LIVE Studio** streaming.
2. **Stop Godot** (close the window).
3. **Stop dashboard** (Ctrl+C in terminal).
4. **Stop gateway**: `POST http://127.0.0.1:8787/control/shutdown` with Bearer token.
5. **Stop TikFinity** (disconnect from TikTok LIVE).

## Troubleshooting

### TikFinity connection issues

- Confirm TikFinity is running and shows "Connected".
- Check the WebSocket URL matches `TIKFINITY_URL` in `.env`.
- Verify the TikTok stream is live (TikFinity requires an active LIVE session).
- Try returning to MockLiveAdapter (`LIVE_PROVIDER=mock`) to prove the rest of the system works.

### TikTok LIVE Studio capture problems

- Run TikTok LIVE Studio and Godot with the same privilege level.
- Confirm the Godot window is not minimized or behind other windows.
- Try Window Capture instead of Game Capture.

### Provider check fails during preflight

- Confirm TikFinity adapter is connected:
  ```
  GET http://127.0.0.1:8787/status
  Authorization: Bearer <your-token>
  ```
- If TikFinity disconnected, restart TikFinity and wait for reconnection.

### Events not arriving in game

- Confirm the TikTok stream is live and receiving engagement.
- Check gateway logs for TikFinity adapter messages.
- Test with MockLiveAdapter to verify the game pipeline works.

### Fallback scene activates

- Check `GET /fallback/status` for the reason.
- If `provider_disconnected`: restart TikFinity.
- If `gateway_disconnected`: restart the gateway.
- Deactivate manually: `POST /fallback/deactivate`.
