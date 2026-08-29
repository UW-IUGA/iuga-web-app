# IUGA Website — Development Guide

## Prerequisites

- **Node.js** 22+ (matching the Docker image `node:22-alpine`)
- **npm** (bundled with Node.js)
- **Git**
- **MongoDB** (only needed for backend development; dev mode uses mock data)

---

## Quick Start

```bash
# Install everything and run in dev mode
npm run dev
```

This runs: `cd frontend; npm install && npm run build -- --mode development && cd ../backend; npm install && npm start`.

The app is served at **http://localhost:7777**.

---

## Running Parts Individually

| Command | What it does |
|---|---|
| `npm run frontend` | Install dependencies and start Vite dev server on `:3000` |
| `npm run backend`  | Install and start Express on `:7777` (uses production build of frontend) |
| `npm run backend-debug` | Start backend with debug logging |
| `npm run debug`    | Full rebuild + backend with debug logging |

### Frontend-only development

```bash
cd frontend
npm install
npm start
```

This starts the Vite dev server on `http://localhost:3000` with hot reload. It uses **mock data** (no backend calls) because Vite development mode is active.

### Backend-only development

```bash
cd backend
npm install
npm start                    # uses .env.dev
# or
npm run deploy               # uses .env.prod
# or
npm run debug                # uses .env.debug + verbose logging (create it first!)
```

> **Note:** `.env.debug` is not committed. Create it from `.env.example`: `cp backend/env/.env.example backend/env/.env.debug`

The backend requires:
1. A built frontend at `../frontend/build/`
2. Environment files in `backend/env/` (see below)
3. A MongoDB connection (Atlas for dev)

---

## Environment Configuration

Backend environment files live in `backend/env/` and are **gitignored** (except `.env.example`).

```
backend/env/
├── .env.example       ← Copy this to create your config
├── .env.dev           ← npm start
├── .env.debug         ← npm run debug (create from .env.example)
└── .env.prod          ← npm run deploy
```

Required variables (see `.env.example`):

| Variable | Purpose |
|---|---|
| `PORT` | Server port (default 7777) |
| `DEPLOY_ENV` | `development`, `staging`, or `production` |
| `SESSION_SECRET` | Strong random string for session signing |
| `DB_URI` | Full MongoDB connection string, e.g. `mongodb://<user>:<pass>@mongo:27017/iuga` (local dev: `mongodb://127.0.0.1:27017/iuga`) |
| `ADMIN_PREVIEW` | Set to `true` only for local development to let signed-in users preview admin pages without role assignments |

Frontend environment files are local and should not be committed:

| File | Variable | Value |
|---|---|---|
| `frontend/.env.development` | `VITE_API_URL` | `http://localhost:7777` |
| `frontend/.env.production` | `VITE_API_URL` | `https://dev.iuga.info` |

In dev mode, the frontend uses **mock data** from `src/assets/mock-data/` instead of fetching from the API. In production builds (`npm run build`), it uses the live API.

For a local admin UI preview, set `ADMIN_PREVIEW=true` in `backend/env/.env.dev` and `VITE_ADMIN_PREVIEW=true` in `frontend/.env.development.local`. This keeps UW sign-in required, grants read access plus event-request creation/editing for UI testing, and is ignored outside `DEPLOY_ENV=development`.

---

## Project Scripts (Root `package.json`)

| Script | Action |
|---|---|
| `npm run dev` | Build frontend → start backend (dev env) |
| `npm run debug` | Build frontend → start backend (debug env) |
| `npm run frontend` | Start Vite dev server only |
| `npm run backend` | Install + start backend (dev env) |
| `npm run backend-dev` | Same as above |
| `npm run backend-debug` | Install + start backend (debug env) |

---

## Codebase Conventions

### General

- **JavaScript** (ES Modules with `import`/`export`). Backend uses `.js` with `"type": "module"` in package.json except `bin/www.cjs` (CommonJS for bootstrapping).
- **JSX** for React components (`.jsx` extension).
- **SCSS** for styles, organized in the [7-1 pattern](https://sass-guidelin.es/#architecture).
- Indentation: 4 spaces.

### Frontend

- One component per file.
- Pages go in `pages/`, reusable UI in `components/`, shared state in `context/`.
- CSS class naming follows BEM-like conventions (`.nav-container`, `.nav-items-wrapper`).
- Shared SCSS tokens live in `stylesheets/abstracts/_variables.scss`; use those tokens for
  navigation dimensions and radii instead of adding one-off values.
- The shared `Navbar` has a desktop sidebar presentation and a mobile top-navbar
  presentation. Mobile layout rules are in `layout/_navigation-mobile.scss`; desktop
  rules are in `layout/_navigation-desktop.scss`.

### Backend

- Route handlers in `routes/api/v1/controllers/`.
- Middleware and utilities in `routes/api/v1/utils/`.
- Mongoose models registered in `models.js`, schemas imported from the submodule.
- Error responses use shape: `{ status: "error", message: "..." }`

### Git

- **Submodule**: `backend/schemas` — after cloning, run `git submodule init && git submodule update`
- Branches: feature branches from `main`, PRs into `main`
- Jenkins pipelines build and deploy from specific branches

---

## Common Tasks

### Add a new page

1. Create `frontend/src/pages/YourPage.jsx`
2. Add `<Route>` in `frontend/src/App.jsx`
3. Add a matching `GET /your-page` route in `backend/app.js` (to serve SPA on direct navigation)
4. Add a link to the shared responsive `Navbar` component in `frontend/src/layouts/Navbar.jsx` (desktop presentation: sidebar rail; mobile presentation: centered logo with left hamburger)
5. Create page-specific SCSS at `frontend/src/stylesheets/pages/_yourpage.scss` and import in `main.scss`

### Add a new API endpoint

1. Create or edit a controller in `backend/routes/api/v1/controllers/`
2. Mount it in `backend/routes/api/v1/apiv1.js` with `router.use()`
3. If a new collection is needed, add a schema in the `iuga-web-schemas` submodule and register the model in `backend/models.js`

### Work with the schema submodule

```bash
# After cloning this repo
git submodule update --init --recursive

# After updating schemas in the remote
git submodule update --remote

# The submodule is pinned to a commit in the main repo
```

---

## Testing

The repository has a small but real test surface, although coverage is incomplete:

- **Frontend:** Vitest and React Testing Library tests under `frontend/src/`. Run them with:
  ```bash
  cd frontend
  npm test
  ```
- **Backend:** two Node built-in test suites under `backend/test/` (`sendError` and `sendSuccess`), plus their test fixture. Run them with:
  ```bash
  cd backend
  node --test
  ```
- **CI deploy helper:** regression tests for the health-gated deploy sequence in `ci/deploy.groovy`, under `ci/test/`. They stub `docker` and assert the invoke/rollback behavior, so no daemon is needed. Run them with:
  ```bash
  node --test 'ci/test/*.test.js'
  ```
- **CI deploy end-to-end test:** `ci/test/e2e-deploy.sh` runs the same sequence against a real Docker daemon. It builds the actual app image, pushes it to a temporary local registry, starts a disposable Mongo 7 container, then runs the exact deploy commands from `ci/deploy.groovy` with test-only credentials. It only uses loopback ports (16766/16767/5011), never touches the live deployment, and cleans up after itself. Requires Docker; run it with:
  ```bash
  bash ci/test/e2e-deploy.sh
  ```
- **Root:** `npm test` runs the backend and frontend suites.

### Required verification workflow

For every code, CI, Docker, or runtime behavior change:

1. Define the intended observable behavior and reproduce the current failure or boundary.
2. Add or update a behavior-focused test or script. Ideally **before** implementation — it can be written either before or after, but before is the best way: it proves the test actually detects the issue and keeps the change honest.
3. If no existing test surface covers the behavior, invent the smallest deterministic regression test at the public boundary.
4. Run the test against the current state. It should fail or reproduce the current issue when applicable; if it already passes, confirm that it covers the intended behavior.
5. Implement the smallest change, rerun the test until it passes, and complete the narrow integration/build smoke check before considering a Jenkins build — the local test suites listed in the Testing section above, plus (for deploy/pipeline changes) the full end-to-end test `ci/test/e2e-deploy.sh`.

Tests must verify behavior through public interfaces, rendered output, HTTP responses, logs, or real integration boundaries. Do not replace a test with a source-text assertion. For MongoDB or backend changes, use a disposable Docker MongoDB setup when feasible. One-off scripts written to diagnose a single issue should stay out of the repository (for example in /tmp); only reusable tests belong in the codebase.

---

## Docker Build

```bash
docker build --build-arg DEPLOY_ENV=development --build-arg VITE_API_URL=http://localhost:7777 -t iuga-web-app .
```

The Dockerfile performs a multi-stage build:

1. Installs and builds the React frontend
2. Embeds the public `VITE_API_URL` value for the selected environment
3. Copies only production backend dependencies into the final image
4. Runs `npm run deploy` as the container command

---

## Troubleshooting

> For diagnosis of common issues, see the **[Troubleshooting Guide](TROUBLESHOOTING.md)** — it covers pipeline failures, runtime failures, 502 errors, stale content, and more.
