# RiftCrowd LIVE — Dashboard

This is the static build of the Creator Dashboard.

## Serving

### Option 1: Via Gateway (Recommended)

The gateway serves the dashboard via `@fastify/static` at `/dashboard/` or `/` depending on configuration. Start the gateway first:

```bash
# From the gateway directory:
node index.js --port 8787 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8787/dashboard/` in your browser.

### Option 2: Standalone Static Server

```bash
npx serve . -p 5173 -s
```

Then open `http://127.0.0.1:5173`.

## Authentication

Set the `RIFTCROWD_TOKEN` environment variable or configure the token in the Auth settings page. The default is `change-me` for local development only.

## Version

The dashboard header displays the current version, schema version, and Godot version fetched from `GET /version`.
