
Get the **Informatics Undergraduate Association (IUGA)** website running on your machine for development.

---

## Prerequisites

- **Node.js 22+** (matches the `node:22-alpine` Docker image used in production)
- **npm** (bundled with Node.js)
- **Git**
- **MongoDB** — only needed if you are working on backend features. Frontend development uses mock data.

---

## Installation

```bash
# Clone the repository with submodules
git clone --recurse-submodules https://github.com/UW-IUGA/iuga-web-app
cd iuga-web-app

# If you already cloned without --recurse-submodules:
git submodule update --init backend/schemas

# Install root, backend, and frontend dependencies
npm run setup

---

## Running the App

Run the following commands from the repository root unless otherwise noted.

### Full stack (one command)

Run this from the repository root:

```bash
npm start
# npm run dev is an equivalent command
```

This starts Express first, then Vite with its `/api` proxy pointed at that backend. Vite normally uses port 3000 and automatically selects another if needed. The backend normally uses 7777 and selects another only when `PORT` is unset. If your local `backend/env/.env.dev` sets `PORT`, remove or blank it to enable fallback. MongoDB is not started by this command; use `scripts/dev-up.sh` to start a local MongoDB container and backend.

### Frontend only (hot reload)
```bash
npm run frontend
or cd frontend (from the root dir) && npm start
```

Starts the Vite dev server with hot reload (normally **http://localhost:3000**; Vite selects another port if occupied). The frontend uses **mock data** — no backend or database needed.

### Backend only

```bash
npm run backend-dev
or cd backend (from the root dir) && npm start
```

The backend prefers **http://localhost:7777** and selects the next available port if `PORT` is unset. An explicit `PORT` is fixed and startup fails if it is occupied. Backend startup requires an environment file and MongoDB connection.

For an isolated local MongoDB, run `npm run docker` from `backend/`. The helper
prints a `DB_URI=... npm start` command for the selected container; use that
command in place of `npm start` to connect this backend to that database.
For a one-command local backend + isolated database, use `scripts/dev-up.sh`; it
passes the selected MongoDB URI to the backend automatically.

---

## Environment Setup

### Backend environment files

The tracked template is `backend/.env.example`. Runtime files live in the ignored `backend/env/` directory because the npm scripts load `env/.env.dev`, `env/.env.debug`, or `env/.env.prod`.

```
backend/
├── .env.example       ← Tracked template
└── env/
    ├── .env.dev       ← Used by npm start
    ├── .env.debug     ← Used by npm run debug
    └── .env.prod      ← Used by npm run deploy
```

**To create `.env.dev`:**

```bash
mkdir -p backend/env
cp backend/.env.example backend/env/.env.dev
# Then edit the file with your actual values
```

Required variables (see `backend/.env.example`):


| Variable | Purpose |
|---|---|
| `PORT` | Optional fixed port. When set, it does not fall back. When unset, local startup prefers 7777 and tries the next ports if occupied; remove or blank it in local `.env.dev` for parallel worktrees. |
| `DEPLOY_ENV` | `development`, `staging`, or `production` |
| `SESSION_SECRET_DEV` | Strong random string for session signing (development build reads this by `DEPLOY_ENV`) |
| `DB_URI` | MongoDB connection string. `scripts/dev-up.sh` starts the local container and passes its selected URI to the backend; `npm run dev` uses the URI configured in `backend/env/.env.dev`. |

### Debug backend setup (optional)

The `npm run debug` and `npm run backend-debug` commands load `backend/env/.env.debug` with verbose logging.

```
mkdir -p backend/env
cp backend/.env.example backend/env/.env.debug
# Edit with your credentials, then:
npm run backend-debug
```

> **Note:** `.env.debug` is not committed to the repository. Create it from the tracked `backend/.env.example`. If it is missing, the debug scripts fail with a missing-file error.

### Frontend environment

Frontend environment files are local and should not be committed:

| File | Variable | Value |
|---|---|---|
| `frontend/.env.development` | `VITE_API_URL` | `http://localhost:7777` fallback for standalone Vite; root `npm run dev` overrides it with the selected backend URL |
| `frontend/.env.production` | `VITE_API_URL` | `https://dev.iuga.info` |

The full-stack `npm run dev` command injects the selected backend URL into Vite. The backend accepts HTTP origins on `localhost` for development (including Vite's alternate ports); other origins remain rejected.

---

## How API Calls Work

The frontend uses mock data for most pages in Vite development mode. The Shop page reads its catalog from `/api` in both development and production, so it needs the backend and Vite proxy. The root `npm run dev` command injects the backend's selected URL into that proxy.
- **Production build**: The frontend makes direct same-origin `fetch()` calls to `/api`. MSAL redirects back to the origin serving the frontend.
  ```js
  fetch(`/api/v1/events/upcoming`)
  ```
  In production builds the frontend is served as static files by the Express backend, and API requests go directly to the same origin.

---

## Verify It Works

1. Run `npm run dev`
2. Open the frontend URL printed by Vite (normally **http://localhost:3000**).
3. Confirm the homepage loads.
4. Open the Shop page to verify its API-backed catalog loads through the proxy.
5. Confirm no errors appear in the terminal.

---

## Next Steps

| If you want to… | Read this |
|---|---|
| Understand the project structure | [Architecture](ARCHITECTURE.md) |
| Start developing features | [Development](DEVELOPMENT.md) |
| Work on the frontend | [Frontend](FRONTEND.md) |
| Work on the backend | [Backend](BACKEND.md) |
| Deploy the app | [Deployment](DEPLOYMENT.md) |
| Maintain in production | [Maintainers](MAINTAINERS.md) |
| Fix something broken | [Troubleshooting](TROUBLESHOOTING.md) |
