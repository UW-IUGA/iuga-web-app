
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

This starts the Vite frontend with hot reload at **http://localhost:3000** and the Express backend at **http://localhost:7777** concurrently.

### Frontend only (hot reload)
```bash
npm run frontend
or cd frontend (from the root dir) && npm start
```

Starts the Vite dev server on **http://localhost:3000** with hot reload. The frontend uses **mock data** — no backend or database needed.

### Backend only

```bash
npm run backend-dev
or cd backend (from the root dir) && npm start
```

The backend runs on **http://localhost:7777** and requires an environment file plus a MongoDB connection.

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
| `PORT` | Server port (default 7777) |
| `DEPLOY_ENV` | `development`, `staging`, or `production` |
| `SESSION_SECRET` | Strong random string for session signing |
| `DB_URI` | Full MongoDB connection string, e.g. `mongodb://<user>:<pass>@mongo:27017/iuga` (local dev: `mongodb://127.0.0.1:27017/iuga`) |

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
| `frontend/.env.development` | `VITE_API_URL` | `http://localhost:7777` |
| `frontend/.env.production` | `VITE_API_URL` | `https://dev.iuga.info` |

When the frontend runs on Vite at `http://localhost:3000`, the browser sends that value as the `Origin` header on authenticated state-changing requests, so the backend CSRF check accepts them. Requests from another origin are rejected.

---

## How API Calls Work

The frontend switches between mock data and live API based on Vite's production mode:

- **Development**: The frontend imports **mock data** from `src/assets/mock-data/`. No backend or database is needed. This is the default when running `npm start` (Vite dev server).
- **Production build**: The frontend makes direct same-origin `fetch()` calls to `/api`. The public `VITE_API_URL` value configures the MSAL redirect URI at build time.
  ```js
  fetch(`/api/v1/events/upcoming`)
  ```
  The public `VITE_API_URL` value is substituted at build time. In production builds the frontend is served as static files by the Express backend, and API requests go directly to the same origin.

---

## Verify It Works

1. Run `npm run dev`
2. Open **http://localhost:7777** in your browser
3. You should see the IUGA homepage with upcoming events (from mock data)
4. Confirm no errors appear in the terminal

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
