# IUGA Website — Architecture Overview

## Repository Boundary

This repository (`iuga-web-app`) contains two deployable units plus shared infrastructure:

```
iuga-web-app/
├── frontend/          → React SPA (Vite)
├── backend/           → Express.js API server
├── backend/schemas/   → Git submodule: UW-IUGA/iuga-web-schemas (Mongoose schemas)
├── Dockerfile         → Multi-stage build for production deployment
├── dev.jenkinsfile    → Jenkins pipeline (dev environment)
├── staging.jenkinsfile
├── prod.jenkinsfile
└── package.json       → Root convenience scripts (dev, debug, frontend, backend)
```

**Not in this repository:**

- Production nginx reverse proxy configuration
- Docker Compose host setup (MongoDB, networking, env secrets)
- CI/CD pipeline definitions (managed in Jenkins)
- Domain DNS / TLS certificates

---

## System Architecture

```
Browser
   │
   ├──[SPA route]──→ React (frontend/build/)
   │                    │
   │                    ├── page components (pages/)
   │                    ├── shared UI (components/ + layouts/)
   │                    ├── auth context (context/AuthContext.jsx)
   │                    └── API calls via fetch()
   │                         │
   ├──[API call]───→ Express (backend/)
   │                    │
   │                    ├── app.js          (middleware stack + route mount)
   │                    ├── models.js       (Mongoose model registration)
   │                    ├── routes/api/v1/  (controller modules)
   │                    └── schemas/        (Mongoose schema definitions, submodule)
   │                         │
   │                    MongoDB (Atlas dev / local prod)
   │
   └──[static asset]──→ Express serves frontend/build/
```

### Frontend Responsibilities

- Serve the single-page application (SPA) shell (`index.html`)
- Client-side routing with React Router v6
- Render pages: Home, Events, Resources, About, Get Involved, Shop, Student Voice,
  Elections, and Election FAQ
- Render shared responsive navigation and footer layouts around the routed pages
- Manage authentication state via Azure MSAL (Microsoft Authentication Library)
- In **production**: fetch data from same-origin `/api` routes. The public `VITE_API_URL` build value configures the MSAL redirect URI.
- In **development**: use mock data from `src/assets/mock-data/` — no backend needed

### Backend Responsibilities

- Express.js HTTP server (default port **7777**)
- Serve the built SPA as static files (`GET /`, `/events`, `/resources`, etc.)
- Mount REST API at `/api/v1`
- Apply explicit CORS, security headers, body-size, rate-limit, CSRF, and safe-error boundaries
- Manage server-side sessions with `express-session`
- Connect to MongoDB (Mongoose ODM)
- Attach registered models to requests for controllers
- Handle Microsoft Graph token exchange for authentication

### Database (MongoDB)

Connection depends on `DEPLOY_ENV`:

| Environment | Connection String | Host |
|---|---|---|
| `production` | `mongodb://user:pass@mongo:27017/iuga` | Docker container |
| `staging` | same as production | Docker container |
| `development` | `mongodb+srv://user:pass@cluster0.mongodb.net/` | MongoDB Atlas |

The **schemas** live in a separate GitHub repository (`UW-IUGA/iuga-web-schemas`) mounted as a submodule at `backend/schemas/`. The main repo imports `eventsSchema`, `participantsSchema`, and `usersSchema` from `./schemas/schemas.js`.

---

## Request Flow (Production)

```
1.  Browser loads https://iuga.info
2.  nginx (external) → Express :7777
3.  Express serves frontend/build/index.html
4.  React boots, React Router reads URL path
5.  Browser renders matched page component
6.  If page needs live data (events):
    fetch("/api/v1/events/upcoming")
7.  Express API controller queries MongoDB
8.  Response flows back: MongoDB → Mongoose → Controller → Browser JSON → React state → DOM
```

**SPA routes** (handled by Express sending the same `index.html`):
`/`, `/events`, `/resources`, `/get-involved`, `/electionfaq`, `/contact`

**API routes** (JSON responses):
All mounted under `/api/v1` — see [BACKEND.md](./BACKEND.md).

---

## Authentication Flow

```
Frontend                         Backend                       Azure AD / Graph
   │                                │                              │
   ├─ loginRedirect() ──────────────┼────────────────────────────►│
   │◄──── redirect back ────────────┼─────────────────────────────│
   │                                │                              │
   ├─ acquireTokenSilent() ─────────┼────────────────────────────►│
   │◄──── access token ─────────────┼─────────────────────────────│
   │                                │                              │
   ├─ POST /api/v1/user/login ─────►│                              │
   │   Authorization: Bearer <tok>  │                              │
   │                                ├─ GET /v1.0/me (Graph) ─────►│
   │                                │◄── user profile ────────────│
   │                                │                              │
   │                                ├─ Rotate anonymous session    │
   │                                ├─ Create/Fetch MongoDB user   │
   │                                ├─ Store authenticated session │
   │◄── { user object } ───────────│                              │
   │                                │                              │
   ├─ Session cookie set            │                              │
   └─ AuthContext updated           │                              │
```

Authentication uses **Microsoft Azure AD** (UW enterprise directory). The frontend never sees the user's password — only MSAL access tokens. The backend validates tokens via Microsoft Graph API, then creates its own server-side session.

After login, session-authenticated state changes must include an `Origin` header whose value is in the configured frontend/IUGA origin list. CORS and CSRF share that list; backend listening ports are not browser origins.

---

## Deployment Boundary

**What the Dockerfile does** (multi-stage build):

1. **Build stage**: Install frontend dependencies, compile the Vite app with the `VITE_API_URL` build argument
2. **Production stage**: Install backend production dependencies, copy built frontend, run Express server

The Docker image runs the backend Node.js process which serves both the API and the static SPA. In production, a reverse proxy (nginx, external to this repo) forwards requests to the container.

**Jenkins pipelines** (`dev.jenkinsfile`, `staging.jenkinsfile`, `prod.jenkinsfile`) handle the CI/CD process — they are not documented here because they reference external infrastructure.

---
## Navigation

| Document | Content |
|---|---|
| [QUICKSTART.md](./QUICKSTART.md) | Prerequisites, installation, environment setup, running, verification |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Setup, scripts, workflow, conventions |
| [FRONTEND.md](./FRONTEND.md) | Frontend structure, pages, components, styling, auth |
| [BACKEND.md](./BACKEND.md) | Backend structure, API routes, controllers, models, database |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Environments, CI/CD, Docker build and deploy |
| [MAINTAINERS.md](./MAINTAINERS.md) | Monitoring, maintenance, incident response |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Diagnosis guide for pipeline and runtime failures |
