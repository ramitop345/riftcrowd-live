# RiftCrowd LIVE — Streaming Runbook

> **Placeholder. To be completed in a later phase.**
> Owner: **Phase 16 — OBS and TikTok LIVE Studio Runbook**.

## Purpose

This runbook will be the operator's checklist for putting the RiftCrowd LIVE game window on TikTok.
It covers capturing the **1080 x 1920 portrait game window** with **OBS Studio** or **TikTok LIVE
Studio** and going live safely and repeatably.

## Planned contents

- Godot window and display settings for a clean 1080 x 1920 capture.
- OBS Studio scene setup: window capture source, canvas and output resolution, scaling filter,
  encoder and bitrate guidance for portrait output.
- TikTok LIVE Studio equivalent setup, and when to prefer it over OBS.
- Safe-zone overlay: keeping timers, meters, and the instruction bar clear of TikTok's right-side
  interaction controls and bottom chat area.
- Audio routing and levels, including muting anything unlicensed.
- Pre-stream checklist: `.env` present, gateway healthy on 127.0.0.1:8787, game connected on
  127.0.0.1:8788, provider status green, dashboard reachable, mock round verified.
- Go-live sequence and the first-minute sanity checks.
- Failure playbook: provider drops, gateway restart, game reconnect, queue clear, safe round end.
- Post-stream: session log location, clipping the logged highlight moments, what not to keep.

Nothing here is authoritative yet. Until Phase 16 lands, treat the pre-stream checklist above as an
informal outline rather than a verified procedure.
