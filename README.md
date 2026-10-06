# IUGA Website App

React frontend + Express backend for the **Informatics Undergraduate Association (IUGA)** at the University of Washington.

## Quickstart

```bash
# Install dependencies once, then start MongoDB + backend + frontend
npm run setup
npm run dev
```

Open the URL printed by Vite (normally **http://localhost:3000**). Full-stack startup requires Docker and manages a separate, reusable MongoDB for each checkout/worktree, selecting available database, backend, and frontend ports automatically. Most frontend pages use mock data, but Shop requires the API. For frontend-only work, run `npm run frontend`.

See [Quickstart Guide](docs/QUICKSTART.md) for full setup instructions.

## Documentation

| Doc | What it covers |
|---|---|
| [Quickstart](docs/QUICKSTART.md) | Prerequisites, installation, env config, run, verify |
| [Architecture](docs/ARCHITECTURE.md) | Project structure, stack decisions, data flow |
| [Development](docs/DEVELOPMENT.md) | Setup, scripts, workflow, conventions |
| [Frontend](docs/FRONTEND.md) | Frontend structure, pages, components, styling, auth |
| [Backend](docs/BACKEND.md) | Backend structure, API routes, controllers, models, database |
| [Deployment](docs/DEPLOYMENT.md) | Environments, CI/CD, Docker |
| [Maintainers](docs/MAINTAINERS.md) | Monitoring, maintenance, incident response |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Diagnosis guide for pipeline and runtime failures |

## Project Structure

```
├── frontend/          # React SPA (Vite, MSAL auth, SCSS)
├── backend/           # Express.js API (MongoDB, express-session)
│   ├── env/           # Environment files (gitignored except .env.example)
│   └── schemas/       # Git submodule — shared Mongoose schemas
├── context/           # Git submodule (private) — internal architecture plans
├── docs/              # Project documentation (start here)
├── Dockerfile         # Multi-stage production build
├── dev.jenkinsfile    # CI/CD pipeline — development
├── staging.jenkinsfile
└── prod.jenkinsfile
```

## Scripts

| Script | Action |
|---|---|
| `npm start` / `npm run dev` | Start checkout MongoDB → backend → Vite paired with that backend |
| `npm run debug` | Build frontend → start backend (debug env) |
| `npm run frontend` | Start Vite dev server only (`:3000`, hot reload) |
| `npm run backend` | Start checkout MongoDB + backend (dev env) |
| `npm run backend-dev` | Same as above |
| `npm run backend-debug` | Install + start backend (debug env) |
