# RiftCrowd LIVE Agent Rules

- Read PRODUCT_SPEC.md, ARCHITECTURE.md, EVENT_PROTOCOL.md, and PROJECT_STATUS.md before modifying code.
- Preserve separation between provider adapters, normalized events, rules, game commands, and Godot simulation.
- Use TypeScript strict mode and GDScript static typing where practical.
- Treat every provider payload as untrusted.
- Bind all development servers to localhost unless a task explicitly changes it.
- Never commit secrets, generated builds, logs, or downloaded profile images.
- Prefer deterministic behavior and configuration files.
- Keep the game playable in mock mode with no TikTok connection.
- Include tests, error handling, reconnect behavior, and useful logs.
- Complete only the current phase and report remaining risks honestly.
