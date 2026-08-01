# Stream Checklist — RiftCrowd LIVE

One-page checklist for starting, monitoring, and stopping a RiftCrowd LIVE stream.

## Before Stream

- [ ] Gateway running (`npm run dev:gateway`).
- [ ] Dashboard running (`npm run dev:dashboard`).
- [ ] Godot launched in borderless mode.
- [ ] Preflight checks pass (`POST http://127.0.0.1:8787/preflight/run` with Bearer token).
- [ ] OBS or TikTok LIVE Studio configured.
- [ ] Audio sources tested (microphone + game audio).
- [ ] VFX config set (quality level, motion reduction, color-blind mode).
- [ ] Fallback scene ready (`GET http://127.0.0.1:8787/fallback/status`).

## During Stream

- [ ] Monitor gateway health (`GET http://127.0.0.1:8787/health` every 5 min).
- [ ] Monitor VFX pool stats (`GET http://127.0.0.1:8787/vfx/stats`).
- [ ] Monitor engagement stats (`GET http://127.0.0.1:8787/engagement/stats`).
- [ ] Monitor top contributors (`GET http://127.0.0.1:8787/engagement/top`).

## After Stream

- [ ] Stop OBS or TikTok LIVE Studio.
- [ ] Stop Godot.
- [ ] Stop dashboard.
- [ ] Stop gateway (`POST http://127.0.0.1:8787/control/shutdown` with Bearer token).
- [ ] Review logs (gateway console output or log files).
- [ ] Backup recording (if OBS).

## Emergency Procedures

- [ ] **Gateway crash** → restart gateway, fallback scene activates automatically.
- [ ] **Provider disconnect** → fallback scene activates, reconnect TikFinity.
- [ ] **VFX pool exhausted** → degrade quality (`POST /vfx/config` with `{"quality":"low",...}`).
- [ ] **Audio missing** → silent, no crash.
- [ ] **Unexpected fallback** → check `GET /fallback/status`, deactivate with `POST /fallback/deactivate`.
