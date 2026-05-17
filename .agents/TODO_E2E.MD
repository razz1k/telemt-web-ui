# E2E tests with Playwright

Task for a developer: introduce end-to-end test coverage for **telemt-web-ui** using [Playwright](https://playwright.dev/). Tests must run against the **real Docker stack** (bundled profile), not against Vite dev server alone.

## Context

| Layer | Role |
|-------|------|
| `telemt` | MTProxy + Control API `:9091`, metrics `:9092` |
| `api` (BFF) | Fastify: proxy `/api/v1/*`, `GET/PUT /api/config`, `GET /api/metrics`, `CRUD /api/servers`, SQLite state |
| `web` | Nginx + React SPA on host port **8080** |

**UI routes:** `/` (Dashboard), `/users`, `/settings`.

**Header (global):** server `<select>`, **Servers** button (modal: add/edit/delete telemt connections).

**Persistence:**

- `./config/config.toml` — telemt config (needs `chmod 777 config && chmod 666 config/config.toml` before first run).
- `./data/state.db` — SQLite: server profiles, active server id, cached user secrets.

**Known API quirks (cover in tests or fixtures):**

- `GET /api/v1/users` does not return secrets from telemt; BFF enriches from SQLite.
- `DELETE` requests must not send `Content-Type: application/json` without a body (Fastify `FST_ERR_CTP_EMPTY_JSON_BODY`).
- Remote server (custom profile): General Settings / `config.toml` editing is read-only; Users CRUD still works via proxy.

## Goals

1. Automated regression suite for critical user flows in the browser.
2. Repeatable local run: one command brings up stack + runs tests.
3. CI-ready job (GitHub Actions or similar) with artifacts (trace, screenshot on failure).
4. No flaky dependence on external networks except optional `Get IP` on Settings (mock or skip).

## Out of scope (for MVP e2e)

- MTProxy data-plane connectivity (port 443) and real Telegram clients.
- `docker-compose.external.yml` profile (optional follow-up).
- Load / performance testing.
- Unit tests for BFF or React (separate task if needed).

## Proposed layout

```
e2e/
  playwright.config.ts
  global-setup.ts          # docker compose up, wait for health
  global-teardown.ts       # optional: compose down
  fixtures/
    test-server.ts         # unique server name / user prefix per run
  specs/
    smoke.spec.ts
    servers.spec.ts
    users.spec.ts
    settings.spec.ts
  .env.e2e.example
```

Add root `package.json` scripts, e.g.:

- `test:e2e` — run Playwright
- `test:e2e:ui` — Playwright UI mode (local debug)

Pin `@playwright/test` in root `devDependencies` or a dedicated `e2e/package.json` (prefer workspace package `e2e/` if using pnpm).

**Code language:** English only (spec names, comments, selectors `data-testid` if added).

## Environment & prerequisites

### Docker (required)

Tests target **`http://localhost:8080`** after:

```bash
cp config/config.toml.example config/config.toml
chmod 777 config && chmod 666 config/config.toml
docker compose up -d --build
```

Use a **dedicated test config** in CI (copy example, minimal users) or reset `./data` and `./config` between runs to avoid cross-run pollution.

### Playwright

- Install browsers: `npx playwright install --with-deps chromium` (Chromium-only is enough for CI).
- `baseURL`: `process.env.E2E_BASE_URL ?? 'http://localhost:8080'`.
- Timeouts: generous for first telemt health (30–60s global setup).

### Optional: `data-testid`

If role/text selectors are brittle, add minimal `data-testid` in `apps/web` (e.g. `server-select`, `servers-modal`, `user-add`, `user-row-{username}`). Prefer accessible roles where stable.

## Global setup / teardown

**`global-setup.ts` should:**

1. Verify Docker is available.
2. Run `docker compose up -d --build` (or skip if `E2E_SKIP_COMPOSE=1` and stack already up).
3. Poll until all pass:
   - `GET http://localhost:8080/api/v1/health` → `ok: true`
   - `GET http://localhost:8080/api/servers` → `ok: true`
4. Optionally seed: ensure Default server active; delete leftover servers from failed runs (via API).

**`global-teardown.ts`:** optional `docker compose down` when `E2E_TEARDOWN=1`.

Do **not** use blocking commands like `docker compose up` without `-d` in setup.

## Test scenarios (minimum)

### 1. Smoke (`smoke.spec.ts`)

- [ ] Open `/` — title **Telemt**, Dashboard tab visible.
- [ ] Navigate to `/users` and `/settings` via ServiceTabs.
- [ ] Header: server dropdown contains **Default (env)**.

### 2. Servers (`servers.spec.ts`)

- [ ] Open **Servers** modal.
- [ ] Add server: name + `apiUrl` `http://telemt:9091`, `metricsUrl` `http://telemt:9092` (reachable from BFF container network; same as bundled stack).
- [ ] **Test connection** shows success (or assert API response via `page.waitForResponse`).
- [ ] Server appears in dropdown; switch to it — Dashboard still loads (health via proxy).
- [ ] Delete server — no 400 (regression for empty JSON body on DELETE).
- [ ] Switch back to Default.

### 3. Users (`users.spec.ts`)

Use unique username prefix: `e2e_${Date.now()}_`.

- [ ] Users page loads table (at least header row).
- [ ] Create user via **Add** — user appears in list.
- [ ] Secret field is non-empty after create (from SQLite enrichment) OR after **Gen** (rotate).
- [ ] **Gen** updates secret; old value no longer shown.
- [ ] Delete user — row removed; `GET /api/v1/users` no longer lists user (optional API check in test).
- [ ] Export CSV triggers download (or verify network request) — optional.

### 4. Settings (`settings.spec.ts`) — Default server only

- [ ] On Default: form fields enabled when `config.toml` is writable.
- [ ] Change `log_level` or `public_host`, **Save & Apply** — success message.
- [ ] Reload page — value persisted (read from UI or `GET /api/config`).
- [ ] Switch to remote server (from servers spec) → open Settings → read-only banner / disabled inputs.

### 5. Auth (if `WEB_UI_PASSWORD` set)

- [ ] With password in `.env`, unauthenticated access returns 401 — document Basic auth in Playwright `httpCredentials` or skip when empty.

## Assertions & stability

- Prefer `getByRole`, `getByLabel`, `getByText` over CSS classes (Tailwind changes often).
- Use `expect.poll` or `toPass` for dashboard metrics that refresh every 3s.
- Isolate data: unique names per test worker (`testInfo.parallelIndex`).
- Parallel: `fullyParallel: true` only if each worker uses isolated DB — otherwise run **serial** (`workers: 1`) for MVP.

## CI sketch (GitHub Actions)

```yaml
# .github/workflows/e2e.yml (to be added)
# - checkout
# - setup Node 22 + pnpm
# - cp config example, chmod config
# - docker compose up -d --build
# - pnpm exec playwright install --with-deps chromium
# - pnpm test:e2e
# - upload playwright-report on failure
```

Runner must support Docker (nested Docker or DinD). Document if self-hosted runner is required.

## Documentation deliverables

- [ ] Section in root `README.md`: how to run e2e locally.
- [ ] `e2e/.env.e2e.example` with `E2E_BASE_URL`, `E2E_SKIP_COMPOSE`, `WEB_UI_PASSWORD`.
- [ ] Update `.gitignore` for `e2e/test-results/`, `e2e/playwright-report/`, `playwright/.cache/`.

## Acceptance criteria

1. `pnpm test:e2e` (or documented equivalent) passes on a clean machine with Docker, after README prep steps.
2. Covers: navigation smoke, server CRUD + delete without 400, user create/delete + secret visibility, settings save on Default.
3. Failed tests produce trace/screenshot artifacts.
4. No Russian in test code; no secrets committed (use generated usernames only).

## References in repo

| Path | Notes |
|------|--------|
| `docker-compose.yml` | Bundled stack, ports, volumes |
| `apps/web/src/App.tsx` | Routes |
| `apps/api/src/routes/servers.ts` | Server API |
| `apps/api/src/index.ts` | Proxy + user secret enrichment |
| `apps/web/src/lib/api.ts` | Client API (Content-Type fix for DELETE) |
| `README.md` | Setup and architecture |

## Follow-ups (not blocking MVP)

- E2E for `docker-compose.external.yml`.
- API-level contract tests (BFF) separate from Playwright.
- Visual regression (screenshots).
- Seed telemt with fixed `config.toml` fixture committed as `e2e/fixtures/config.toml`.
