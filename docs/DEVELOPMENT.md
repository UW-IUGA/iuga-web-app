# IUGA Website — Development Guide

## Prerequisites

- **Node.js** 22+ (matching the Docker image `node:22-alpine`)
- **npm** (bundled with Node.js)
- **Git**
- **Docker Desktop / Docker Engine** (local backend startup manages MongoDB automatically)

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
`npm start` and `npm run dev` are equivalent. They start or reuse this checkout's MongoDB, then Express, then Vite with its `/api` proxy pointed at the backend's selected port. Vite normally uses port 3000 and chooses another port if it is occupied. The backend uses `PORT` (normally 7777) as its preferred local port and selects the next available port if occupied, even when each worktree has a copied `.env.dev`. Dependencies are installed once with `npm run setup`. See [parallel checkout startup](QUICKSTART.md#parallel-checkouts--worktrees) for database isolation and restarts.

---

## Running Parts Individually

| Command | What it does |
|---|---|
| `npm run frontend` | Start Vite only (usually `:3000`; Vite selects another port if occupied) |
| `npm run backend`  | Start Express (usually `:7777`; uses the next available port if occupied) |
| `npm run backend-debug` | Start backend with debug logging |
| `npm run debug`    | Legacy frontend build + backend debug mode |

### Frontend-only development

```bash
cd frontend
npm install
npm start
```

This starts Vite with hot reload, normally at `http://localhost:3000`; if that port is occupied, Vite prints the alternate URL it selected. Most pages use mock data. The Shop page reads its catalog from `/api`, so run a backend for that page.

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
3. Docker for local automatically managed MongoDB; deployment uses its configured database

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
| `PORT` | Preferred local server port (normally 7777). Local `npm start` and `npm run debug` select the next available port if it is occupied, even when this value is set. `npm run deploy` treats an explicit value as fixed. |
| `DEPLOY_ENV` | `development`, `staging`, or `production` |
| `SESSION_SECRET_DEV` | Strong random string for session signing (development build reads this by `DEPLOY_ENV`) |
| `DB_URI` | Local startup chooses the database and ignores `DB_URI` in `.env.dev` / `.env.debug` and the shell. It always uses the replica-set container from `scripts/start-replica-set-mongodb.sh`, because Venmo holds and officer order review use transactions. `SHOP_MANUAL_CHECKOUT_EXPOSED` only opens student checkout; it does not change the database. The container is checkout-specific, on a Docker-selected loopback port, and reused across restarts. Data in an older standalone container from `scripts/start-mongodb.sh` is not read by `npm start`. Deployment uses its configured URI unchanged. |

Frontend environment files are local and should not be committed:

| File | Variable | Value |
|---|---|---|
| `frontend/.env.development` | `VITE_API_URL` | `http://localhost:7777` fallback for standalone Vite; root `npm run dev` overrides it with the selected backend URL |
| `frontend/.env.production` | `VITE_API_URL` | `https://dev.iuga.info` |

In Vite development mode, most pages use **mock data** from `src/assets/mock-data/`. The Shop page calls the API in development and production, so it requires the backend and the `/api` proxy. The root `npm run dev` command configures that proxy for the backend's selected port.

The root `npm run dev` command passes the backend's selected URL to Vite. Development CORS and CSRF checks accept HTTP origins on `localhost`, including dynamically selected Vite ports; other origins are rejected.

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
| `npm run seed:shop` | Seed local shop orders and students for the Orders dashboard. Needs `DB_URI`; see [Development Data](#development-data) |

To add a script, see [Writing Project Scripts](SCRIPTS.md).

---

## Development Data

### Shop orders for the Orders dashboard

The Orders dashboard (`/admin/shop/orders`) reads purchases from the database, so a fresh database shows nothing. The seed writes realistic fictional data into your local database so you can work on the dashboard straight away.

The script writes five students (logins `seed-*`, emails on `example.com`, phone numbers in the fictional 555-01xx range) and eleven orders that cover every status, one short payment, and one order whose buyer has no user record. Stock for seeded orders is kept on a separate seed drop (`seed-fall-2026`), so seeding never changes the counts real checkout uses.

#### Seed on `npm start` (recommended)

Add this line to `backend/env/.env.dev`:

```
SEED_SHOP=1
```

On each `npm start`, the backend checks the local database after it is up. If a previous seed stopped partway, it adds the missing orders; if the seed is complete, it leaves orders alone, so your edits survive restarts. Set `SEED_SHOP=0` or remove the line to turn it off. A seed failure stops startup, so the error is visible.

#### Seed by hand

Run this from the repository root, with `DB_URI` set to your local MongoDB:

```bash
DB_URI='mongodb://127.0.0.1:<port>/iuga?replicaSet=rs0&directConnection=true' npm run seed:shop
```

A manual run always resets the seeded rows: it removes them first, then writes a fresh set. Use it when you want the original data back.

- **Port:** find it with `docker ps`, in the mapping for your MongoDB container. Docker can assign a new port after a restart, so check again if the connection is refused.
- **Replica set:** local startup always uses the replica-set container, so keep `?replicaSet=rs0&directConnection=true`.
- **Standalone MongoDB:** the seed script itself uses sequential writes and does not need transactions. It also works with the standalone container; the app uses a replica set because shop checkout needs transactions.

To add more pending orders, pass `--extra N` (0–500). Use more than 25 to test "Load more". If that run is interrupted, resume it with `--if-empty` and the same `--extra N` value:

```bash
DB_URI='...' npm run seed:shop -- --extra 200
DB_URI='...' npm run seed:shop -- --if-empty --extra 200 # resume this run if interrupted
```

Seeded orders that are Pending or Paid hold stock on the seed drop, and the stock counts match those orders. Dropping or refunding one returns its units, and changing it back takes them again. If the drop has no room for them, that change is refused with a "Not enough ... left in this drop" message and nothing changes. The eleven base orders fit within the drop's cap and the per-student limit. `--extra` adds orders without that check, so with a large count, taking extra orders back can be refused for lack of room. Marking paid, recording amounts, and follow-ups work as usual.

The script refuses any database that is not on this machine. See [Writing Project Scripts](SCRIPTS.md) for the rules that apply to scripts like this one.

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
- The shared `Navbar` is a top navbar on desktop, with a hamburger menu that
  reveals the links in a dropdown panel below the sm-desktop breakpoint. Mobile
  rules are in `layout/_navigation-mobile.scss`; laptop spacing is in
  `layout/_navigation-desktop.scss`.

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
4. Add a link to the shared top `Navbar` component in `frontend/src/layouts/Navbar.jsx` (its mobile menu uses the same links)
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
- **Backend:** Node built-in tests under `backend/test/`. Run them with:
  ```bash
  npm test --prefix backend
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
