# telemt-web-ui

Standalone web panel for [Telemt](https://github.com/telemt/telemt) MTProxy, inspired by [luci-app-telemt](https://github.com/Medvedolog/luci-app-telemt).

MVP features: dashboard, user management (Control API v1), and basic `config.toml` settings.

## Requirements

- Docker and Docker Compose v2
- Node.js 20+ and pnpm 9+ (for local development)

## Quick start (bundled)

Runs Telemt and the web UI together.

```bash
cp config/config.toml.example config/config.toml
cp .env.example .env
# Edit config/config.toml (secrets, tls_domain, users)

docker compose up -d --build
```

On Linux, `telemt` and `api` use your shell `UID`/`GID` (defaults `1000`) so `./config` and `./data` stay editable. If files were created earlier as another user, fix once: `chown -R "$(id -u):$(id -g)" config data`.

- Web UI: http://localhost:8080
- MTProxy: port `443` (from `config/telemt.toml`)

Optional UI password: set `WEB_UI_PASSWORD` in `.env`.

## Quick start (external Telemt)

Use when Telemt is already running elsewhere (another host, or only the `telemt` container from bundled stack).

```bash
cp .env.example .env
# Set TELEMT_API_URL and TELEMT_METRICS_URL (default: host.docker.internal:9091/9092)
# Telemt API/metrics must be reachable from the api container

docker compose -f docker-compose.external.yml up -d --build
```

Web UI listens on port **8080** by default. If bundled `web` is still running, stop it first or change the port mapping.

**Docker network example** (UI + telemt on the same compose network):

```bash
docker compose up -d telemt
TELEMT_API_URL=http://telemt:9091 TELEMT_METRICS_URL=http://telemt:9092 \
  docker compose -f docker-compose.external.yml up -d
```

Config is read from `./config` mounted at `/etc/telemt` (read-only). User CRUD via API still works when Telemt can write `config/config.toml` (see bundled setup `chmod` notes).

## Development

### Docker (no local Node/pnpm)

Start telemt (and optional production BFF) first:

`npm run dev` runs `check:config`, starts `telemt` (creates Docker network), then hot-reload dev servers. Dev/check images are built with `${UID:-1000}` / `${GID:-1000}` (`build.args` + runtime `user:`). Override in `.env` if your ids are not `1000`, then rebuild.

Hot-reload dev servers:

```bash
npm run dev          # telemt + Vite :5173 + API :3000
npm run dev:stop     # stops dev containers only (telemt keeps running)
```

- Web: http://localhost:5173
- API BFF: http://localhost:3000

Build artifacts (`apps/api/dist`, `apps/web/dist`):

```bash
npm run build
```

Lint / typecheck:

```bash
npm run typecheck
npm run lint
```

Check/dev images are built with your `UID`/`GID` (see `.env.example`); `node_modules` and `dist` stay on the bind-mounted repo. Rebuild after changing UID: `docker compose -f docker-compose.dev.yml build --no-cache`. If `apps/*/node_modules` were created with wrong ownership, remove once: `rm -rf apps/api/node_modules apps/web/node_modules`. `npm run clean` only removes host `dist` / `.vite` — not `config.toml`.

```bash
npm run clean        # interactive: dist + Vite cache only
npm run clean:repo   # interactive: all ignored files except data/*.db
```

Local pnpm equivalents: `npm run dev:local`, `npm run build:local`, `npm run typecheck:local`, `npm run lint:local`.

### Local pnpm

```bash
pnpm install
pnpm dev
```

## Architecture

```
Browser → Nginx (web) → BFF (api) → Telemt Control API :9091
                              └────→ Prometheus metrics :9092
                              └────→ config.toml (optional)
```

Telemt [Control API documentation](https://github.com/telemt/telemt/blob/main/docs/Architecture/API/API.md).

## Multiple Telemt servers

The header **Server** dropdown switches the active telemt instance. **Servers** opens global settings to add remote API/metrics URLs.

Server profiles and cached user secrets are stored in **SQLite** (`./data/state.db`, mounted into the API container at `/var/lib/telemt-web-ui`). The database survives container restarts.

- **Default (env)** — BFF uses `TELEMT_API_URL` / `TELEMT_METRICS_URL` from docker-compose.
- **Custom** — requests include `X-Telemt-Api-Url`, `X-Telemt-Metrics-Url`, optional `X-Telemt-Api-Auth`, and `X-Telemt-Server-Id`; the BFF proxies to that host.
- Editing `config.toml` via **General Settings** is only available for the default server; remote servers still support user CRUD through the Control API.
- User **secrets** in the Users table are read from SQLite (synced from `config.toml` on startup for the default server, updated on create/rotate/PATCH).

## Project layout

```
apps/web/     React SPA
apps/api/     Fastify BFF (proxy + config)
config/       telemt.toml (runtime, gitignored)
deploy/       Docker and nginx configs
```

## License

MIT
