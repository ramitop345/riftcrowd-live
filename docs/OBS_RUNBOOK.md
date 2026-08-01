# OBS Runbook — RiftCrowd LIVE

Complete guide for capturing and streaming RiftCrowd LIVE with OBS Studio.

## Prerequisites

- OBS Studio 30+ installed ([download](https://obsproject.com/download)).
- RiftCrowd LIVE built (`npm install` from repository root).
- Gateway running locally (`npm run dev:gateway`).
- Dashboard running locally (`npm run dev:dashboard`).
- Godot 4.3+ installed for game client.

## Borderless Portrait Window

RiftCrowd LIVE is designed for 1080×1920 portrait capture. Launch Godot in borderless mode:

1. Set `gateway/config/window.json` to borderless mode:
   ```json
   {
     "mode": "borderless",
     "portrait": true,
     "width": 1080,
     "height": 1920,
     "vsync": true,
     "fps": 60
   }
   ```
2. Update the config via HTTP:
   ```
   POST http://127.0.0.1:8787/window/config
   Authorization: Bearer <your-token>
   Content-Type: application/json

   {"mode":"borderless","portrait":true,"width":1080,"height":1920,"vsync":true,"fps":60}
   ```
3. Launch Godot — the `WindowManager` autoload applies the borderless portrait window.

## OBS Scene Setup

### 1. Create a new scene

- Open OBS Studio.
- Click the **+** button under Scenes.
- Name it **RiftCrowd LIVE**.

### 2. Add Window Capture source

- Click **+** under Sources → **Window Capture**.
- Name it **Godot Game Window**.
- Select the Godot window from the dropdown.
- Set **Capture Method** to **Windows 10** (or **BitBlt** if Windows 10 fails).
- Resolution: 1080×1920 (portrait).

### 3. Add Audio Input Capture (microphone)

- Click **+** under Sources → **Audio Input Capture**.
- Name it **Microphone**.
- Select your microphone device.
- Adjust levels so commentary is audible over game audio.

### 4. Add Audio Output Capture (game audio)

- Click **+** under Sources → **Audio Output Capture**.
- Name it **Game Audio**.
- Select your default audio device or a virtual audio cable carrying game audio.

### 5. Add Image Overlay (optional)

- Click **+** under Sources → **Image**.
- Name it **Streamer Logo**.
- Select your logo file (PNG with transparency recommended).
- Position in a corner of the portrait canvas.

### 6. Add Text Overlay (optional)

- Click **+** under Sources → **Text (GDI+)**.
- Name it **Stream Title**.
- Enter your stream title.
- Position at the top or bottom of the portrait canvas.

## Recording Settings

Navigate to **Settings → Output → Recording**:

| Setting | Recommended Value |
|---|---|
| Output | MP4 or MKV |
| Encoder | NVENC (NVIDIA) or x264 |
| Bitrate | 6000–8000 kbps for 1080p60 |
| Audio | AAC 192 kbps |
| Preset | Quality or Max Quality |

## Streaming Settings

Navigate to **Settings → Stream**:

| Setting | Value |
|---|---|
| Service | Custom |
| Server | `rtmp://localhost` (local testing) or TikTok RTMP URL |
| Stream Key | From TikTok LIVE Studio or your RTMP server |

For TikTok, obtain the RTMP URL and stream key from TikTok LIVE Studio before starting.

## Preflight Checks

Before starting the stream, run the preflight check endpoint:

```
GET http://127.0.0.1:8787/preflight/check
Authorization: Bearer <your-token>
```

Or trigger a fresh run:

```
POST http://127.0.0.1:8787/preflight/run
Authorization: Bearer <your-token>
```

All checks should report `ok: true`:

- **gateway_health** — Gateway is responsive.
- **dashboard_reachable** — Dashboard dev server on port 5173.
- **provider** — MockLiveAdapter or TikFinity connected.
- **config_valid** — All required config fields present.
- **audio_assets** — Audio asset placeholder check.
- **vfx_config** — VFX configuration is valid.

## Starting the Stream

1. **Start gateway**: `npm run dev:gateway`
2. **Start dashboard**: `npm run dev:dashboard`
3. **Launch Godot** in borderless mode (see above).
4. **Run preflight checks**: `POST /preflight/run` — confirm all pass.
5. **Start OBS recording** (if recording locally).
6. **Start OBS streaming** (if going live).

## Stopping the Stream

1. **Stop OBS streaming**.
2. **Stop OBS recording**.
3. **Stop Godot** (close the window or Alt+F4).
4. **Stop dashboard** (Ctrl+C in the dashboard terminal).
5. **Stop gateway**: `POST http://127.0.0.1:8787/control/shutdown` with Bearer token.

## Troubleshooting

### Gateway unreachable

- Confirm gateway is running: `GET http://127.0.0.1:8787/health`.
- Check port 8787 is not occupied by another process.
- Verify `LOCAL_SESSION_TOKEN` matches in `.env`.

### Audio missing

- Check Audio Output Capture source is selecting the correct device.
- Verify game audio is playing through the selected device.
- The fallback orchestrator handles missing audio gracefully (silent, no crash).

### VFX not firing

- Check VFX config: `GET /vfx/config` with Bearer token.
- Verify quality level and pool limits are reasonable.
- Check VFX stats: `GET /vfx/stats` with Bearer token.
- If pool is exhausted, lower quality: `POST /vfx/config` with `{"quality":"low",...}`.

### OBS shows black window

- Try Window Capture instead of Game Capture.
- Run OBS and Godot with the same privilege level (both admin or both non-admin).
- Disable conflicting overlays.
- Confirm the Godot window is not minimized.

### Fallback scene activates unexpectedly

- Check fallback status: `GET /fallback/status`.
- Deactivate manually: `POST /fallback/deactivate`.
- Investigate the reason in the status response.
