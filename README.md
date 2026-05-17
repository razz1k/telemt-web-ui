# telemt-web-ui

Standalone web panel for [Telemt](https://github.com/telemt/telemt) MTProxy, inspired by [luci-app-telemt](https://github.com/Medvedolog/luci-app-telemt).

Features: diagnostics dashboard, user management (Control API v1), General Settings (`config.toml`), and multi-server profiles (SQLite).

## Requirements

- Docker and Docker Compose v2 (recommended for running Telemt + UI)
- Node.js 20+ and [pnpm](https://pnpm.io/) (optional, for local development without Docker dev containers)

## Quick start (bundled)

Runs Telemt and the web UI together.

```bash
cp config/config.toml.example config/config.toml
cp .env.example .env
# Edit config/config.toml (secrets, tls_domain, users)

docker compose up -d --build
```

On Linux, `telemt` and `api` run as your shell `UID`/`GID` (defaults `1000`) so `./config` and `./data` stay editable. If files were created earlier as another user, fix once:

```bash
chown -R "$(id -u):$(id -g)" config data
```

- Web UI: http://localhost:8080
- MTProxy: port `443` (from `config/config.toml` → `[server].port`)

Optional: set `WEB_UI_PASSWORD` and/or `TELEMT_API_AUTH` in `.env` (see [Environment](#environment)).

## Quick start (external Telemt)

Use when Telemt is already running elsewhere, or you only want the UI stack while `telemt` runs from the bundled compose file.

```bash
cp .env.example .env
# Set TELEMT_API_URL and TELEMT_METRICS_URL (defaults: host.docker.internal:9091 / :9092)
# Telemt API/metrics must be reachable from the api container

docker compose -f docker-compose.external.yml up -d --build
```

- Web UI: http://localhost:**8081** (avoids clashing with bundled `web` on `8080`)
- `./config` is mounted read-only at `/etc/telemt` for optional config reads
- User CRUD via the Control API works without editing `config.toml` from the UI

**Same Docker network as bundled `telemt`** (external compose expects network `telemt-web-ui_telemt_net`):

```bash
docker compose up -d telemt
TELEMT_API_URL=http://telemt:9091 TELEMT_METRICS_URL=http://telemt:9092 \
  docker compose -f docker-compose.external.yml up -d --build
```

To disable **General Settings** file editing in external mode, set `TELEMT_CONFIG_PATH` to an empty value in `.env` before starting (the BFF treats an empty path as non-editable).

## Development

### Docker (no local Node/pnpm)

`npm run dev` runs `check:config`, starts `telemt` (creates the Docker network), then hot-reload dev containers. Dev/check images use `${UID:-1000}` / `${GID:-1000}` (`build.args` + runtime `user:`). Override in `.env` if your ids are not `1000`, then rebuild.

```bash
npm run dev          # telemt + Vite :5173 + API :3000
npm run dev:stop     # stops dev containers only (telemt keeps running)
```

- Web: http://localhost:5173 (proxies `/api` and `/health` to the dev API)
- API BFF: http://localhost:3000

Production build artifacts (`apps/api/dist`, `apps/web/dist`):

```bash
npm run build
```

Checks (run inside `docker-compose.check.yml`):

```bash
npm run typecheck
npm run lint
npm run shellcheck
```

Dev/check images use your `UID`/`GID` (see `.env.example`); `node_modules` and `dist` stay on the bind-mounted repo. Rebuild after changing UID:

```bash
docker compose -f docker-compose.dev.yml build --no-cache
```

If `apps/*/node_modules` were created with wrong ownership, remove once:

```bash
rm -rf apps/api/node_modules apps/web/node_modules
```

Cleanup:

```bash
npm run clean        # interactive: gitignored artifacts (keeps node_modules, config, data, .env)
npm run clean:repo   # interactive: gitignored artifacts except data/*.db
npm run clean:docker # tear down all docker-compose*.yml stacks and images
```

Host equivalents (requires pnpm + running Telemt reachable from the host):

```bash
npm run dev:local
npm run build:local
npm run typecheck:local
npm run lint:local
npm run shellcheck:local
```

### Local pnpm

Telemt must already expose the Control API and metrics (defaults in compose: `9091` / `9092`). On the host, point the BFF at them:

```bash
cp config/config.toml.example config/config.toml
cp .env.example .env
pnpm install

export TELEMT_API_URL=http://127.0.0.1:9091
export TELEMT_METRICS_URL=http://127.0.0.1:9092
export TELEMT_CONFIG_PATH="$(pwd)/config/config.toml"

pnpm -r --parallel dev
# equivalent: npm run dev:local (after exports above)
```

- Web: http://localhost:5173
- API: http://localhost:3000

## Architecture

```
Browser → Nginx (web) → BFF (api) → Telemt Control API :9091
                              └────→ Prometheus metrics :9092
                              └────→ config.toml (optional, default server)
```

Telemt [Control API documentation](https://github.com/telemt/telemt/blob/main/docs/Architecture/API/API.md).

## Multiple Telemt servers

The header **Server** dropdown switches the active Telemt instance. **Servers** opens global settings to add remote API/metrics URLs.

Server profiles and cached user secrets are stored in **SQLite** (`./data/state.db`, mounted into the API container at `/var/lib/telemt-web-ui`). The database survives container restarts.

- **Default** — editable in **Servers** (stored in SQLite). Empty API/metrics URLs fall back to `TELEMT_API_URL` / `TELEMT_METRICS_URL` from docker-compose; **General Settings** (`config.toml`) stay available for this profile.
- **Custom** — requests include `X-Telemt-Api-Url`, `X-Telemt-Metrics-Url`, optional `X-Telemt-Api-Auth`, and `X-Telemt-Server-Id`; the BFF proxies to that host.
- Editing `config.toml` via **General Settings** is only available for the default server; remote servers still support user CRUD through the Control API.
- User **secrets** in the Users table are read from SQLite (synced from `config.toml` on startup for the default server, updated on create/rotate/PATCH).

## Environment

| Variable | Used by | Description |
|----------|---------|-------------|
| `WEB_UI_PASSWORD` | api | Optional HTTP basic auth for the UI/BFF |
| `TELEMT_API_AUTH` | api | Optional `Authorization` header to Telemt Control API |
| `UID` / `GID` | telemt, api, dev/check | Host user for bind mounts (default `1000`) |
| `TELEMT_API_URL` | api | Control API base URL |
| `TELEMT_METRICS_URL` | api | Prometheus metrics URL |
| `TELEMT_CONFIG_PATH` | api | Path to `config.toml` inside the api container; empty disables file editing |
| `API_PORT` | api | BFF listen port (default `3000`) |
| `UI_DB_PATH` | api | SQLite path inside the container (host: `./data/state.db`) |

Copy `.env.example` to `.env` and adjust. See `docker-compose.yml`, `docker-compose.external.yml`, and `docker-compose.dev.yml` for per-profile defaults.

## Project layout

```
apps/web/              React SPA (Vite, Tailwind)
apps/api/              Fastify BFF (proxy, config.toml, SQLite)
config/                Runtime Telemt config (gitignored except config.toml.example)
data/                  SQLite state (state.db, gitignored)
deploy/docker/         Production Dockerfiles
deploy/nginx/          Nginx config for web image
scripts/               clean.sh, clean-repo.sh, clean-docker.sh
docker-compose.yml           Bundled telemt + api + web (:8080)
docker-compose.external.yml  UI only, external Telemt (:8081)
docker-compose.dev.yml       Hot-reload dev api + web
docker-compose.check.yml     typecheck, lint, shellcheck, build
pnpm-workspace.yaml
```

## License

MIT
