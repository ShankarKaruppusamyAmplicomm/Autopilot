# Changelog

All notable changes to Autopilot are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased] — 2026-06-23

### Added
- **Cloudflare Worker backend** (`backend/`) — full portfolio CRUD API (projects, versions,
  phases, tasks, dependencies, activity log) backed by Cloudflare D1 (SQLite).
- **`/api/v1/import`** route on the Worker — wipes and reloads all portfolio data from a
  backup JSON; respects D1's 90-statement batch limit with chunked inserts.
- **`/api/v1/portfolio`** snapshot endpoint — returns the full portfolio in a single GET.
- **Hono** web framework for the Worker; `corsMiddleware` and `adminAuth` middleware.
- **`PATCH` + `X-Actor` CORS headers** — middleware now allows `PATCH` method and the
  `X-Actor` header that the frontend sends on every mutating request.
- **Frontend API client** (`autopilot-app/src/api/`) — typed wrappers for every backend
  endpoint; gracefully falls back to local IndexedDB when server is unreachable.
- **`AuthPromptModal`** — modal that prompts for the admin password the first time a
  write is attempted; password is stored in `sessionStorage` for the tab lifetime.
- **`useAuthPrompt` store** — Zustand slice managing the auth prompt lifecycle.
- **`withAuth` helper** — wraps any mutating store action; intercepts `401/403` and
  re-prompts instead of silently failing.
- **`offline` flag in `useStore`** — set to `true` when the server is unreachable; the
  UI shows a banner and all writes go to IndexedDB only.
- **`refresh()` action** — re-fetches the full portfolio from the server and syncs
  IndexedDB.
- **Server-mirrored backups** — `createBackupVersion` in `db/index.ts` now mirrors each
  local backup to `/api/backups` (best-effort, non-blocking).
- **Cross-browser visitor analytics** — `recordVisit` pushes to `/api/visitors`; the
  Settings view reads from the server so visit counts aggregate across all devices.
- **Publish to Server modal** in Settings — replaces the old single-click "Publish
  seed.json" button; requires admin password before posting to `/api/seed`.
- **Server backup count** shown inline in the Settings backup section.
- **`VITE_API_URL` secret** wired into GitHub Actions build step.
- **`deploy-worker` CI job** — deploys the Cloudflare Worker via `wrangler deploy` on
  every push to `main`.
- **Docker Compose** (`docker-compose.yml`) — one-command local stack:
  `docker compose up --build` starts backend (port 8787) and frontend (port 5173).
- **Backend `Dockerfile`** — Node 20 Alpine, native build tools for `better-sqlite3`,
  persistent `.data/` volume mount.
- **Frontend `Dockerfile`** — multi-stage build (Vite → `serve`); `VITE_API_URL` and
  `VITE_BASE` baked in as build args.
- **`backend/.gitignore`** — ignores `node_modules/`, `.wrangler/`, `.data/`, `dist/`.
- **`backend/.dockerignore`** — prevents `node_modules` and `.data` leaking into the image.
- **`backend/.env.example`** — documents the `PORT` env var for local dev.
- **`autopilot-app/.env.example`** — updated with both production Workers URL and local
  Docker URL variants.

### Changed
- **`useStore`** now reads from the server on init (`fetchPortfolio`) and writes to both
  server and IndexedDB; server is authoritative, IndexedDB is the offline cache.
- All store mutations (`addProject`, `updateProject`, `deleteProject`, `reorderProjects`,
  `addVersion` … `removeDependency`, `renameWorkspace`) route through the backend API
  and fall back to local-only when offline.
- **`mapProject / mapVersion / mapPhase / mapTask / mapDependency`** helper functions
  normalise server `snake_case` responses to frontend `camelCase` types.
- **`publishSeedFile`** now accepts an optional `adminPassword`; when provided it also
  POSTs the snapshot to `/api/seed` and returns `{ serverOk, error }`.
- **`recordVisit`** mirrors visit data to `/api/visitors` after writing to IndexedDB.
- **`listVisitors`** prefers server data (cross-browser aggregation) and falls back to
  local IndexedDB.
- **`restoreFromStaticSeed`** removed — server API is now the primary source of truth;
  the static `public/data/seed.json` fallback is no longer needed.
- **`SettingsView`** — "Publish seed.json" button replaced with password-protected
  "Publish to Server" button; server backup count shown in the backup section header.
- **`docker-compose.yml`** — removed obsolete `version: '3.9'` attribute; added
  `restart: unless-stopped` to both services.
- **`vite.config.ts`** — `VITE_BASE` env var overrides the base path so the same
  Dockerfile serves correctly at `/` (Docker) vs `/Autopilot/` (GitHub Pages).
- **`ProjectActivitiesView`** — activity feed now fetches from `/api/v1/activity` and
  merges with local IndexedDB activity.
- **Admin password hash** updated to match the Worker's `middleware.ts` hash
  (`e3f479…`) so the same password works across local Docker and production.

### Fixed
- `PATCH` requests from the frontend were blocked by the Worker CORS middleware (only
  `GET, POST, DELETE` were listed); all update operations now reach the server.
- `X-Actor` header was stripped by CORS preflight; actor attribution in the activity log
  now works end-to-end.
- `docker-compose.yml` emitted a deprecation warning about the `version:` key — removed.
- Frontend Docker image built with `VITE_BASE=/` so the SPA routes correctly at `/`
  instead of the GitHub Pages path `/Autopilot/`.

---

## [0.6.0] — 2026-06-22

### Added
- Static `seed.json` fallback for incognito / new-device data recovery.
- Hourly save reminder toast.
- Visitor analytics stored in IndexedDB.

---

## [0.5.0] — 2026-06-20

### Added
- Deploy-safe restore from `seed.json` on first load.
- Password-protected "Clear All" action in Settings.

---

## [0.4.0] — 2026-06-19

### Added
- `BrowserRouter` `basename` fix for GitHub Pages SPA routing.

---

## [0.3.0] — 2026-06-18

### Added
- Versioned backup history (local IndexedDB) with download and restore.
- GitHub Pages deployment via GitHub Actions.

---

## [0.2.0] — 2026-06-17

### Added
- Per-project PERT network visualization (SVG, auto-layout via dagre).
- Project Activities feed (local audit log).
- Intra-project phase dependencies.

---

## [0.1.0] — 2026-06-16

### Added
- Initial release: portfolio dashboard, project CRUD, Gantt chart, local IndexedDB
  persistence, JSON backup/restore, PWA offline shell.
