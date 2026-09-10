# IUGA Website — Development Guide

## Prerequisites

- **Node.js** 22+ (matching the Docker image `node:22-alpine`)
- **npm** (bundled with Node.js)
- **Git**
- **MongoDB** (only needed for backend development; dev mode uses mock data)

---

## Quick Start

```bash
# Run these commands from the repository root.
# Install dependencies once
npm run setup

# Start frontend and backend concurrently
npm start
# npm run dev is an equivalent command
```
`npm start` and `npm run dev` are equivalent. Both start the Vite frontend with hot reload at **http://localhost:3000** and the Express backend at **http://localhost:7777** concurrently. Neither command reinstalls dependencies; run `npm run setup` once first.

---

## Running Parts Individually

| Command | What it does |
|---|---|
| `npm run frontend` | Start Vite dev server only on `:3000` |
| `npm run backend`  | Start Express on `:7777` (dev env) |
| `npm run backend-debug` | Start backend with debug logging |
| `npm run debug`    | Legacy frontend build + backend debug mode |

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

> **Note:** `.env.debug` is not committed. Create the ignored `backend/env/` directory and copy the tracked template: `mkdir -p backend/env && cp backend/.env.example backend/env/.env.debug`

The backend requires:
1. A built frontend at `../frontend/build/`
2. An environment file loaded by the selected backend script
3. A MongoDB connection (Atlas for development)

---

## Environment Configuration

The tracked template is `backend/.env.example`. Runtime files live in the ignored `backend/env/` directory because the npm scripts load `env/.env.dev`, `env/.env.debug`, or `env/.env.prod`.

```
backend/
├── .env.example       ← Tracked template
└── env/
    ├── .env.dev       ← npm start
    ├── .env.debug     ← npm run debug
    └── .env.prod      ← npm run deploy
```

Required variables (see `backend/.env.example`):

| Variable | Purpose |
|---|---|
| `PORT` | Server port (default 7777) |
| `DEPLOY_ENV` | `development`, `staging`, or `production` |
| `SESSION_SECRET_DEV` | Strong random string for session signing (development build reads this by `DEPLOY_ENV`) |
| `DB_URI` | Full MongoDB connection string, e.g. `mongodb://<user>:<pass>@mongo:27017/iuga` (local dev: `mongodb://127.0.0.1:27017/iuga`) |

Frontend environment files are local and should not be committed:

| File | Variable | Value |
|---|---|---|
| `frontend/.env.development` | `VITE_API_URL` | `http://localhost:7777` |
| `frontend/.env.production` | `VITE_API_URL` | `https://dev.iuga.info` |

In dev mode, the frontend uses **mock data** from `src/assets/mock-data/` instead of fetching from the API. In production builds (`npm run build`), it uses the live API.

When the frontend runs on Vite at `http://localhost:3000`, the browser sends that value as the `Origin` header on state-changing requests, so the backend CSRF check accepts them. An authenticated session request from another origin is rejected.

---

## Project Scripts (Root `package.json`)

| Script | Action |
|---|---|
| `npm start` | Start Vite frontend and Express backend concurrently |
| `npm run dev` | Same as `npm start` |
| `npm run debug` | Build frontend → start backend (debug env) |
| `npm run frontend` | Start Vite dev server only |
| `npm run backend` | Start backend (dev env) |
| `npm run backend-dev` | Same as above |
| `npm run backend-debug` | Start backend (debug env) |

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

## Git Conventions

Branches, commits, and pull requests all start with the same **type prefix** — `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, or `build`. The prefix answers one question (*what kind of change is this?*) in the same vocabulary everywhere, so `fix/` always means "broken before, working after" and `chore/` always means "no behavior change expected". Reviewers know what to expect before reading the code, and `git log` stays scannable. If you can pick a row in the tables below, you picked correctly.

### Branch names

Format: `<type>/<short-description>` — lowercase, words separated by hyphens, describing the single concern the branch delivers. Real examples from this repository: `fix/session-secret-per-env`, `feat/events-metadata`, `chore/mongoose-9`, `docs/stylesheets-architecture`.

| Prefix | Use it when | Example |
|---|---|---|
| `feat/` | You add or change something a user can see or do. | `feat/events-filter` |
| `fix/` | Something is broken and your branch makes it work again. | `fix/spa-route-reloads` |
| `chore/` | Maintenance with no behavior change: dependencies, config, scripts. | `chore/mongoose-9` |
| `docs/` | Only documentation. | `docs/stylesheets-architecture` |
| `refactor/` | The code changes shape; the behavior does not. | `refactor/role-permission` |
| `test/` | Only tests. | `test/event-routes` |
| `ci/` | Pipeline and automation files (`.jenkinsfile`, workflow files). | `ci/buildkit-builds` |
| `build/` | Build system and runtime (Dockerfile, npm scripts, Node version). | `build/root-dev-runner` |

### Choosing the prefix

Start with one question: **did anything behave differently afterward?** Yes means `feat/` (new capability) or `fix/` (broken behavior restored). No means pick the prefix for what you touched.

| You did this | Use | Why |
|---|---|---|
| Fixed the events page showing past events | `fix/` | Behavior was wrong, now it is right |
| Added a category filter to the events page | `feat/` | New capability |
| Upgraded Express to a newer version | `chore/` | Maintenance; no behavior you changed |
| Fixed a typo in this guide | `docs/` | Documentation-only, even though it is a "fix" |
| Renamed confusing helpers, output unchanged | `refactor/` | Same behavior, cleaner code |
| Added missing tests for the webhook route | `test/` | Tests-only |
| Switched the Jenkinsfile to BuildKit | `ci/` | Pipeline files |
| Changed the Dockerfile or root npm scripts | `build/` | Build system and runtime |
| Fixed a bug and added the test proving it | `fix/` | One concern; the test belongs to the fix |

Still torn between two prefixes? That usually means two concerns — split them into two branches and two pull requests. (`perf/` and `style/` show up occasionally for performance-only and formatting-only changes; they work the same way.)

### Commit messages

Commits use the same eight words, in the standard Conventional Commits format: `<type>(<scope>): <imperative summary>`.

- **scope** names the area you touched: `events`, `auth`, `shop`, `deps`, `ci`, etc.
- The summary is lowercase, imperative ("add", "fix", "remove"), and has no trailing period; keep the whole subject within ~72 characters where practical.

Real examples from `git log`:

```text
fix(session): resolve signing secret by deployment environment
feat(events): publish leader and past-photo metadata
docs(stylesheets): document adopted 7-1 folder structure
chore(deps): harden production dependency graph
test(events): cover event route behavior
refactor(auth): name role permission middleware explicitly
```

One commit = one logical change. If a message needs "and", it is usually two commits.

### Day-to-day workflow

One branch = one concern = one worktree = one pull request. A worktree per branch keeps the main checkout on `dev` and lets other work continue untouched.

1. Start from the latest `dev` and create a worktree:

    ```bash
    git fetch origin
    git worktree add -b fix/events-pagination ../fix-events-pagination origin/dev
    ```

    The worktree directory is the branch name with `/` replaced by `-`.

2. Make the change and commit it: `git commit -m "fix(events): show only upcoming events"`.

3. Push the branch and open the pull request against `dev` — never push directly to `dev` or `main`. Stacked work (a branch built on another unmerged branch) targets the parent branch until it merges.

4. After the PR merges, clean up the branch and its worktree. Squash merges make Git think the branch was never merged, so delete it with `-D` (only once the PR is merged):

    ```bash
    git worktree remove ../fix-events-pagination
    git branch -D fix/events-pagination
    ```

Merged pull requests appear in `git log` with the PR number appended, e.g. `(#150)`. Where a branch lands matters: merging into `dev` deploys dev.iuga.info, and `main` is production (iuga.info) — nothing reaches production except through the pull request flow.

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

### Work with submodules

#### 1. Mongoose Schemas (`backend/schemas`) — Required
```bash
# Initialize schemas after cloning
git submodule update --init backend/schemas

# Pull updated schemas from the remote
git submodule update --remote backend/schemas
```

#### 2. Agent Documentation & Plans (`context`) — Optional (Private)
For authorized officers and developers with access to `UW-IUGA/iUGA-Agent-Docs`:
```bash
# Initialize or pull the internal planning repository
git submodule update --init context

# Pull the latest architecture plans from main
git submodule update --remote context
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
