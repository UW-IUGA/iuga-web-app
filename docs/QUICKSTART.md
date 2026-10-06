
Get the **Informatics Undergraduate Association (IUGA)** website running on your machine for development.

---

## Prerequisites

- **Node.js 22+** (matches the `node:22-alpine` Docker image used in production)
- **npm** (bundled with Node.js)
- **Git**
- **Docker Desktop / Docker Engine** — local backend startup manages MongoDB automatically. Not needed for frontend-only pages that use mock data.

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

This starts this checkout's MongoDB, then Express, then Vite with its `/api` proxy pointed at that backend. Vite normally uses port 3000 and automatically selects another if needed. The backend uses `PORT` (normally 7777) as its preferred local port and selects the next available port if occupied, even when `backend/env/.env.dev` sets `PORT`. The selected backend URL is passed to Vite. `npm run deploy` keeps an explicitly configured port fixed and does not start Docker.

### Parallel checkouts / worktrees

Run `npm start` from each checkout's root; open the Vite URL each one prints. Each checkout gets its own MongoDB container on an available loopback port, so copied `.env.dev` files cannot accidentally point them all at `27017`. Restarting the same checkout reuses its database data. Ctrl+C stops that checkout's backend and frontend; MongoDB stays available for the next run. Existing containers are not removed or imported, and new databases start empty.

Local `npm start` and backend `npm run debug` always use the managed database, ignoring `DB_URI` from both environment files and the shell. Identical copied or exported values cannot make different worktrees share a database. Deployment still uses its configured `DB_URI`. Starting Vite alone does not pair it with a dynamically selected backend; prefer root `npm start` for API-backed pages such as Shop.

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

Local backend startup prefers **http://localhost:7777** (or the configured `PORT`) and selects the next available port if it is occupied. Deployment startup keeps an explicitly configured `PORT` fixed. Backend startup requires an environment file and MongoDB connection.

Backend `npm start` and `npm run debug` also start or reuse this checkout's MongoDB automatically. `npm run docker` from `backend/` starts just the database; `scripts/dev-up.sh` remains a backend-only shortcut.

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
| `PORT` | Preferred port for local `npm start` and `npm run debug` (normally 7777); those commands select another port if it is occupied, including when `PORT` is set. `npm run deploy` treats an explicit value as fixed. |
| `DEPLOY_ENV` | `development`, `staging`, or `production` |
| `SESSION_SECRET_DEV` | Strong random string for session signing (development build reads this by `DEPLOY_ENV`) |
| `DB_URI` | Local startup supplies the checkout's managed MongoDB URI, ignoring copied and exported values. Deployment uses its configured URI unchanged. |

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
