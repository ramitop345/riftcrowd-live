# VFX, Audio, and Readability (Phase 15)

## Overview

Phase 15 transforms the functional game into an attention-grabbing show with
pooled visual effects, orchestrated audio, and TikTok-readability options.

## Architecture

```
NormalizedLiveEvent → VFXOrchestrator → SPAWN_VFX / SPOTLIGHT_CARD / SUPPORTER_CALLOUT / CAMERA_IMPULSE
NormalizedLiveEvent → AudioOrchestrator → PLAY_AUDIO
GameCommand → ReadabilityOrchestrator → modified GameCommand (patterns, safe zone, font, contrast)
```

### VFX Pipeline

1. **VFXConfig** (`gateway/config/vfx.json`) — Zod-validated config: pool limits, quality level, frame-rate budget, motion reduction, color-blind mode, safe zone.
2. **VFXPool** (`gateway/src/vfx/vfx_pool.ts`) — Bounded object pool with per-type limits (particles, flashes, trails, overlays). LRU eviction when full.
3. **VFXOrchestrator** (`gateway/src/vfx/vfx_orchestrator.ts`) — Facade deciding which VFX to trigger per event type. Emits `GameCommand` objects.

### Audio Pipeline

1. **AudioConfig** (`gateway/config/audio.json`) — Zod-validated config: volume groups (master, music, sfx, ui), track paths, SFX paths.
2. **AudioOrchestrator** (`gateway/src/audio/audio_orchestrator.ts`) — Facade deciding which audio to trigger per event type. Emits `PLAY_AUDIO` commands.

### Readability Pipeline

1. **ReadabilityConfig** (`gateway/config/readability.json`) — Zod-validated config: color-blind mode, motion reduction, safe zone, font size, contrast boost.
2. **ReadabilityOrchestrator** (`gateway/src/readability/readability_orchestrator.ts`) — Modifies commands before emission (patterns, safe zone, font size, contrast, reduced intensity/duration).

## Configuration

### VFX Config (`gateway/config/vfx.json`)

```json
{
  "pool": { "maxParticles": 100, "maxFlashes": 20, "maxTrails": 50, "maxOverlays": 30 },
  "quality": "high",
  "frameRateBudget": 60,
  "motionReduction": false,
  "colorBlindMode": false,
  "safeZone": { "topPx": 80, "bottomPx": 120, "leftPx": 20, "rightPx": 20 }
}
```

### Audio Config (`gateway/config/audio.json`)

```json
{
  "volumeGroups": { "master": 80, "music": 60, "sfx": 90, "ui": 70 },
  "tracks": { "backgroundMusic": "audio/music/background.ogg", "battleMusic": "audio/music/battle.ogg", "resultsMusic": "audio/music/results.ogg" },
  "sfx": { "hit": "audio/sfx/hit.ogg", "follow": "audio/sfx/follow.ogg", "share": "audio/sfx/share.ogg", "gift": "audio/sfx/gift.ogg", "ability": "audio/sfx/ability.ogg", "spotlight": "audio/sfx/spotlight.ogg" }
}
```

### Readability Config (`gateway/config/readability.json`)

```json
{
  "colorBlindMode": false,
  "motionReduction": false,
  "safeZone": { "topPx": 80, "bottomPx": 120, "leftPx": 20, "rightPx": 20 },
  "fontSize": "medium",
  "contrastBoost": false
}
```

## VFX Types

| Type | Description | Event Triggers |
|------|-------------|----------------|
| Particle burst | GPUParticles2D burst for like/gift | like, gift (ability sequence) |
| Hit flash | Full-screen color flash | gift |
| Trail | Line2D animated trail | share, subscription |
| Faction overlay | TextureRect fade overlay | follow, subscription |
| Camera impulse | Camera2D shake | gift (reduced if motion reduction) |
| Ability sequence | Special particle burst | chat !ability, cinematic gift |

## Audio Tracks + SFX

| Track | Group | Event Triggers |
|-------|-------|----------------|
| sfx.hit | sfx | like |
| sfx.spotlight | sfx | like milestone (≥100), subscription |
| sfx.follow | sfx | follow, subscription |
| sfx.share | sfx | share |
| sfx.gift | sfx | gift |
| sfx.ability | sfx | cinematic gift (repeatCount ≥100) |
| backgroundMusic | music | (background loop) |
| battleMusic | music | (battle loop) |
| resultsMusic | music | (results loop) |

Volume formula: `effective = master × group / 10000` (both 0-100, output 0-1).

## Readability Options

| Option | Effect |
|--------|--------|
| Color-blind mode | Pattern hints on VFX (dots, stripes, zigzag, crosshatch) |
| Motion reduction | Camera impulse intensity -50%, trail duration -50% |
| Safe zone | Bounds added to spotlight cards and callouts |
| Font size | small/medium/large hint on text commands |
| Contrast boost | Opacity boost on overlays, contrast flag on commands |

## New Command Types (COMMAND_SCHEMA_VERSION=4)

| Command | Description | Key Metadata |
|---------|-------------|--------------|
| `SPAWN_VFX` | Spawn a visual effect | vfxType, particleCount, color, intensity, duration, pattern |
| `SPOTLIGHT_CARD` | Show viewer spotlight | viewerName, message, safeZone*, fontSize |
| `SUPPORTER_CALLOUT` | Show supporter callout | viewerName, tier, safeZone*, fontSize |
| `CAMERA_IMPULSE` | Camera shake | intensity, duration |
| `PLAY_AUDIO` | Play audio track | track, volumeGroup, volume |

## HTTP Endpoints

All endpoints are token-protected (Bearer token).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/vfx/config` | Current VFX config |
| POST | `/vfx/config` | Hot-reload VFX config |
| GET | `/vfx/stats` | Pool stats (active, idle, dropped) |
| POST | `/vfx/trigger` | Test button: trigger a VFX event |
| GET | `/audio/config` | Current audio config |
| POST | `/audio/config` | Hot-reload audio config |
| POST | `/audio/trigger` | Test button: trigger an audio event |
| GET | `/readability/config` | Current readability config |
| POST | `/readability/config` | Hot-reload readability config |

## Godot Integration

### VFXPool (`scripts/vfx/VFXPool.gd`)
- Object pool for GPUParticles2D, ColorRect, Line2D, TextureRect instances.
- Per-type limits from config (loaded via HTTP on startup).
- Signals: `vfx_acquired`, `vfx_released`.

### AudioManager (`scripts/audio/AudioManager.gd`)
- Audio playback with volume groups.
- Track caching to avoid re-loading.
- Signal handler: `_on_play_audio(command)`.

### ReadabilityOverlay (`scripts/ui/ReadabilityOverlay.gd`)
- Safe-zone overlay (toggleable via F9 debug key).
- Reads config via HTTP on startup.
- Draws safe-zone bounds and corner markers.

### Scenes
- `scenes/vfx/ParticleBurst.tscn` — GPUParticles2D template.
- `scenes/vfx/HitFlash.tscn` — ColorRect + AnimationPlayer.
- `scenes/vfx/Trail.tscn` — Line2D + AnimationPlayer.
- `scenes/vfx/FactionOverlay.tscn` — TextureRect + AnimationPlayer.
- `scenes/ui/SpotlightCard.tscn` — Panel + Labels + AnimationPlayer.
- `scenes/ui/SupporterCallout.tscn` — Panel + Labels + AnimationPlayer.
- `scenes/ui/CameraImpulse.tscn` — Camera2D + Tween.

## Known Limitations

- **Godot not installed**: GDScript and scene files are hand-authored, desk-check only.
- **Placeholder audio files**: `audio/sfx/*.ogg` and `audio/music/*.ogg` paths are configured but files do not exist yet.
- **No runtime verification**: GDScript has not been executed; behavior is based on code review.
- **Motion reduction partially implemented**: Only camera impulse and trail duration are reduced; other animations retain full motion.
