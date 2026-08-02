# RiftCrowd LIVE — Release Notes

## Version 1.0.0

**Release Date:** August 2026

### Overview

RiftCrowd LIVE v1.0.0 is the first public release — a portrait TikTok LIVE interactive arena game where viewers influence a real-time faction battle through gifts, follows, likes, chat, and free engagement actions.

### Features

- **Portrait Arena:** 1080x1920 resolution optimized for TikTok LIVE and vertical streaming
- **Faction System:** Viewers join factions and compete in multi-phase battles
- **Gift Economy:** Tiered gift mappings that trigger visual and gameplay effects
- **Free Engagement:** Follows, likes, shares, and chat all have meaningful gameplay impact
- **Mock Mode:** Full offline testing without TikTok connection
- **Creator Dashboard:** React-based web UI for session control and monitoring
- **TikFinity Integration:** WebSocket adapter for TikFinity provider
- **VFX & Audio Orchestrators:** Dynamic visual effects and sound triggered by events
- **Readability Compliance:** Color-blind mode, safe zones, motion reduction
- **Streaming Workflow:** OBS and TikTok LIVE Studio runbook support

### Schema Version History

| Schema Version | Phase | Changes |
|---------------|-------|---------|
| 1 | Phase 2 | Initial `NormalizedLiveEvent` and `GameCommand` schemas |
| 2 | Phase 6 | Added director state commands (START_ROUND, END_ROUND) |
| 3 | Phase 7 | Added viewer identity (JOIN_FACTION, viewerId) |
| 4 | Phase 11 | Added gift economy commands (GIFT_APPLY, ADD_SCORE) |
| 5 | Phase 15 | Added VFX/audio commands (SPAWN_VFX, PLAY_AUDIO) |
| 6 | Phase 17 | Added FRAME_REPORT and SET_QUALITY_TIER for 4-tier VFX ladder |

### Known Limitations

1. **Godot Export Templates:** Windows export templates are not bundled. Download separately from:
   `https://github.com/godotengine/godot/releases/download/4.7.1-stable/Godot_v4.7.1-stable_export_templates.tpz`

2. **Audio Assets:** Background music and SFX files are placeholder paths — actual audio files must be provided.

3. **TikFinity Dependency:** Production mode requires TikFinity running locally on port 23184.

4. **Single Creator:** This release supports a single creator session; multi-creator support is planned.

5. **No Persistent Storage:** Session data is in-memory only; restart clears all state.

### Upgrade Instructions

#### From Development (Pre-1.0)

1. **Stop all running services** (gateway, dashboard, Godot)
2. **Backup your config files:**
   ```bash
   cp -r gateway/config gateway/config.backup
   ```
3. **Run the launcher** (config migration is automatic):
   ```bash
   # Windows
   START.bat
   ```
4. **Update token** in `START.bat` or set `RIFTCROWD_TOKEN` environment variable
5. **Verify health:** Open `http://127.0.0.1:8787/health`

#### Schema Migration

The launcher automatically migrates config files on startup. If validation fails:
- Original files are restored from backups (`*.json.bak.<timestamp>`)
- Review errors in launcher output
- Manually edit config files and restart

### Platform Compliance

- **IP Clearance:** No club brands, player identities, copyrighted music, or copied artwork
- **TikTok LIVE Rules:** Color-blind safe, 30% max screen flash, no obscuring gameplay
- **No Gambling:** No prizes, hidden odds, or pressure-based gifting
- **Privacy:** No viewer personal data beyond in-session handle

### Technical Requirements

- **Node.js:** v22.16.0 or higher
- **Godot:** 4.7.1 Standard (x86_64 Windows) for export
- **Ports:** Gateway 8787, Game WebSocket 8788, Dashboard 5173
- **Binding:** All services bind to 127.0.0.1 by default

### Next Steps

- **Phase 19:** Community Feedback and Iteration
- **Phase 20:** Multi-creator Support
- **Phase 21:** Mobile Companion App

---

**Support:** See `docs/STREAMING_RUNBOOK.md` for OBS setup and `docs/MOCK_LIVE_ADAPTER.md` for testing.
