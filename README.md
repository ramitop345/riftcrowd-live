# RiftCrowd LIVE

RiftCrowd LIVE is an original portrait (9:16) auto-battler played by a TikTok LIVE audience. Viewers
join a faction by commenting, then influence an autonomous battle for the central Rift Crown through
free engagement (comments, likes, follows, shares) and optional gifts. The same engine drives four
selectable content modes, so themes are data, not forks of the game.

## Repository layout

- `game/` — Godot 4.7.1 client: rendering, autonomous simulation, match state. Contains no
  TikTok-specific parsing logic.
- `gateway/` — Node + TypeScript event gateway: provider adapters, normalization, validation, rules,
  command queue, dashboard API.
- `dashboard/` — React + Vite creator dashboard: provider selection, gift mapping, test buttons,
  health indicators, emergency controls.
- `shared/` — versioned Zod schemas and fixtures shared by the gateway, the dashboard, and tests.
- `content/` — data-driven content packs and gift mappings.
- `docs/` — product spec, architecture, event protocol, runbooks, compliance checklists.
- `.qoder/rules/` — project rules enforced during agent-assisted development.

### Adapter architecture, mock first

Every LIVE event source implements the same `LiveProviderAdapter` contract. `MockLiveAdapter` is
always available and works fully offline, so development, tests, and demos never depend on TikTok or
on a third-party connector. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Prerequisites

- **Node.js** — 24 LTS is recommended by the implementation guide. The project declares
  `engines.node: ">=22"` and runs on Node 22. The current development environment is **v22.16.0**,
  a deliberate, documented deviation from the guide's Node 24 recommendation.
- **Godot Engine 4.7.1**, Standard build, x86_64 for Windows. Do **not** use the .NET edition.
- **Git for Windows**.
- Optional, for real TikTok events: TikFinity Desktop. Optional, for broadcasting: OBS Studio or
  TikTok LIVE Studio.

## Quick start (Windows PowerShell)

PowerShell in this project's supported configuration does not accept `&&` as a statement separator.
Use `;` between commands.

```powershell
Copy-Item .env.example .env
npm install
npm run lint; npm run typecheck; npm run test
```

Run the gateway and the dashboard in two separate terminals:

```powershell
npm run dev:gateway
```

```powershell
npm run dev:dashboard
```

Then open the game client in Godot:

```powershell
Start-Process "game\project.godot"
```

Opening the Godot project is a manual verification step; it is not covered by `npm run test`.

> `gateway/`, `dashboard/`, and `game/` arrive in later phases. Until then the `dev:*` scripts and
> the Godot step do not resolve yet.

## Local ports

All listeners bind to the loopback interface only. Nothing is exposed to the network.

| Component        | Port | Bind address |
| ---------------- | ---- | ------------ |
| Gateway HTTP/API | 8787 | 127.0.0.1    |
| Game WebSocket   | 8788 | 127.0.0.1    |
| Dashboard (Vite) | 5173 | 127.0.0.1    |

Ports are configured in `.env`; see `.env.example` for the full list of variables.

## Known environment note: spaces in the repository path

The implementation guide recommends a path without spaces, for example `C:\Dev\riftcrowd-live`. This
checkout currently lives at `C:\Program Files\Developper\riftcrowd-live`, which contains spaces and
sits under a directory that Windows protects with elevated permissions. Always quote paths in
scripts and in Godot export presets. If a toolchain misbehaves on paths with spaces, relocating the
repository to a space-free directory is the first thing to try.

## Compliance summary

Free participation must always matter. No gambling-like mechanics, no lotteries, no cash prizes, no
hidden odds, and no pressure-based gifting. No official club, government, or municipal branding
ships in the game. See [docs/IP_AND_PLATFORM_CHECKLIST.md](docs/IP_AND_PLATFORM_CHECKLIST.md).

## Further reading

- [AGENTS.md](AGENTS.md) — rules for anyone, human or agent, changing this repository.
- [PROJECT_STATUS.md](PROJECT_STATUS.md) — phase tracker and current state.
- [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) — product scope.
- [docs/EVENT_PROTOCOL.md](docs/EVENT_PROTOCOL.md) — normalized events and game commands.
- `docs/RiftCrowd_LIVE_Complete_Qoder_Implementation_Guide.md` — the complete source blueprint.
