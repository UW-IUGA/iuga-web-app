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

This runs: `cd frontend; npm install && npm run build && cd ../backend; npm install && npm start`

The app is served at **http://localhost:7777**.

---

## Running Parts Individually

| Command | What it does |
|---|---|
| `npm run frontend` | Install and start CRA dev server on `:3000` |
| `npm run backend`  | Install and start Express on `:7777` (uses production build of frontend) |
| `npm run backend-debug` | Start backend with debug logging |
| `npm run debug`    | Full rebuild + backend with debug logging |

### Frontend-only development

```bash
cd frontend
npm install
npm start
```

This starts the Create React App dev server on `http://localhost:3000` with hot reload. It uses **mock data** (no backend calls) because `NODE_ENV` is `development`.

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
| `DB_DEV_USERNAME` | MongoDB Atlas username (dev) |
| `DB_DEV_PASSWORD` | MongoDB Atlas password (dev) |
| `DB_PROD_USERNAME` | MongoDB username (prod/staging) |
| `DB_PROD_PASSWORD` | MongoDB password (prod/staging) |

Frontend environment (checked in):

| File | Variable | Value |
|---|---|---|
| `frontend/.env.dev` | `REACT_APP_API_URL` | `http://localhost:7777` |
| `frontend/.env.production` | `REACT_APP_API_URL` | `https://dev.iuga.info` |

In dev mode, the frontend uses **mock data** from `src/assets/mock-data/` instead of fetching from the API. In production builds (`npm run build`), it uses the live API.

---

## Project Scripts (Root `package.json`)

| Script | Action |
|---|---|
| `npm run dev` | Build frontend → start backend (dev env) |
| `npm run debug` | Build frontend → start backend (debug env) |
| `npm run frontend` | Start CRA dev server only |
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
4. Add a Navbar link in `frontend/src/layouts/Navbar.jsx`
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

The project currently has **limited test infrastructure**:

- Frontend includes `@testing-library/react` (installed) but no test files were found during documentation authoring.
- Backend has no test runner or test files.

To add tests, the project would benefit from:

- **Frontend**: `react-scripts test` (Jest) — add tests alongside components in `__tests__/` directories
- **Backend**: Jest or Mocha for controller integration tests with a test MongoDB

---

## Docker Build

```bash
docker build --build-arg DEPLOY_ENV=development -t iuga-web-app .
```

The Dockerfile performs a multi-stage build:

1. Installs and builds the React frontend
2. Replaces the API URL based on `DEPLOY_ENV` (production → `iuga.info`, staging → `staging.iuga.info`, development → `dev.iuga.info`)
3. Copies only production backend dependencies into the final image
4. Runs `npm run deploy` as the container command

---

## Troubleshooting

> For diagnosis of common issues, see the **[Troubleshooting Guide](TROUBLESHOOTING.md)** — it covers pipeline failures, runtime failures, 502 errors, stale content, and more.
