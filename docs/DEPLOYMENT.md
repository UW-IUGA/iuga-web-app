# Deployment Guide

> **Audience:** Developers and maintainers deploying IUGA Web App.
> **Pipeline:** GitHub → Jenkins → Docker → Production server.
> **Reference:** [Architecture overview](ARCHITECTURE.md), [Quickstart](QUICKSTART.md), [Maintainers](MAINTAINERS.md), [Troubleshooting](TROUBLESHOOTING.md).

---

## Pipeline Overview

Every environment (dev, staging, production) follows the same five-stage pipeline:

| Stage | What happens | Responsibility |
|---|---|---|
| Checkout | Jenkins clones `github.com/UW-IUGA/iuga-web-app` (dev & prod use explicit branches; staging uses `checkout scm`) with submodules using the `github_classic` credential. | Jenkins |
| Build | `docker build` receives `--build-arg DEPLOY_ENV` and the public `--build-arg VITE_API_URL` for the target environment. | Jenkins |
| Push to Registry | `docker push` to Docker Hub after authenticating with the `dockerhub` credential. | Docker Hub |
| Deploy | `docker pull`, start the new build as a candidate on a temp port, health-check it (`/readyz`), then swap onto the live port only if healthy. **A broken build never takes the site down** — the previous working container keeps serving and the pipeline fails. | Production host |
| Status report | Jenkins posts a commit status to GitHub (`iuga/jenkins/cicd/<env>`). | Jenkins |

### Trigger

- **Dev:** A push to the `dev` branch triggers the dev pipeline (checks out `*/dev`).
- **Production:** A push to `main` triggers the production pipeline (checks out `*/main`).
- **Staging:** Uses `checkout scm` (multibranch pipeline — runs for whichever branch/tag triggered the job).

> **Note:** Dev and production have their own branches; staging follows whatever branch triggered its multibranch job. There is no single shared branch for all three.

---

## Jenkinsfile Comparison

### `dev.jenkinsfile` (Development)

- **Image name:** `iuga/iuga-web-app-development`
- **Container name:** `iuga-web-dev`
- **Host port:** `6666` → container port `7777`
- **Network:** None (default bridge)
- **Volume:** `/var/lib/iuga-web-app/uploads/dev:/app/backend/public/uploads`
- **DB credentials:** `DB_URI` (Jenkins Secret text credential, injected as `DB_URI` env var), `SESSION_SECRET` (string credential)
- **Database:** MongoDB Atlas (dev database)
- **Deploy pattern:** health-gated candidate swap; temp port `6667` → live port `6666`; tags images `:${BUILD_NUMBER}` and `:last-good`
- **Commit status context:** `iuga/jenkins/cicd/dev`

### `staging.jenkinsfile` (Staging)

- **Source:** `checkout scm` (Jenkins multibranch pipeline — uses the branch/tag that triggered the job)
- **Image name:** `iuga/iuga-web-app-staging`
- **Container name:** `iuga-web-staging`
- **Host port:** `7777` → container port `7777`
- **Network:** `iuga-server-config_default`
- **Volume:** `/var/lib/iuga-web-app/uploads/staging:/app/backend/public/uploads`
- **DB credentials:** `DB_URI` (Jenkins Secret text credential, injected as `DB_URI` env var), `SESSION_SECRET` (string credential)
- **Database:** MongoDB container at `mongo:27017` (via `iuga-server-config_default` network)
- **Deploy pattern:** health-gated candidate swap; temp port `7778` → live port `7777`; tags images `:${BUILD_NUMBER}` and `:last-good`
- **Commit status context:** `iuga/jenkins/cicd/staging`

### `prod.jenkinsfile` (Production)

- **Image name:** `iuga/iuga-web-app-production`
- **Container name:** `iuga-web-prod`
- **Host port:** `8888` → container port `7777`
- **Network:** `iuga-server-config_default`
- **Volume:** `/var/lib/iuga-web-app/uploads/prod:/app/backend/public/uploads`
- **DB credentials:** `DB_URI` (Jenkins Secret text credential, injected as `DB_URI` env var), `SESSION_SECRET` (string credential)
- **Database:** MongoDB container at `mongo:27017` (via `iuga-server-config_default` network)
- **Deploy pattern:** health-gated candidate swap; temp port `8889` → live port `8888`; tags images `:${BUILD_NUMBER}` and `:last-good`
- **Commit status context:** `iuga/jenkins/cicd/prod`

---

## Credential Categories

Jenkins requires these credential IDs (values are **not** in this repository):

| Credential ID | Type | Purpose |
|---|---|---|
| `github_classic` | Username+Password | GitHub API authentication for checkout and commit status updates |
| `dockerhub` | Username+Password | Docker Hub login for image push |
| `DB_URI` | Secret text | Jenkins credential holding the MongoDB connection URI; injected into the app as the `DB_URI` env var for all environments |
| `SESSION_SECRET` | String | Session signing secret for all environments |

---

## Docker Build Process

The [Dockerfile](../Dockerfile) is a multi-stage build:

1. **Build stage** (`FROM node:22-alpine AS build`)
   - Copies `frontend/` into `/app/frontend`
   - Installs npm dependencies
   - Embeds the public `VITE_API_URL` supplied by the deployment pipeline:

     | `DEPLOY_ENV` | API URL in build | Served domain |
     |---|---|---|
     | `development` | `https://dev.iuga.info` | `localhost:6666` (via nginx proxy) |
     | `staging` | `https://staging.iuga.info` | `staging.iuga.info` (via nginx proxy) |
     | `production` | `https://iuga.info` | `iuga.info` (via nginx proxy) |

   - Runs `npm run build`

2. **Runtime stage** (`FROM node:22-alpine`)
   - Installs `tzdata` (sets `TZ=America/Los_Angeles`) and `git`
   - Copies `backend/` into `/app/backend`
   - Copies built frontend from build stage into `/app/frontend/build`
   - Exposes `$PORT` (default 7777)
   - Runs **`npm run deploy`** → `dotenv -e ./env/.env.prod node ./bin/www.cjs`

---

## Runtime Architecture

```
                         External nginx
                              │
                    ┌─────────┴──────────┐
                    │ iuga-server-config  │
                    │  _default network  │
                    └─────────┬──────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
  iuga-web-dev          iuga-web-staging     iuga-web-prod
  :6666 → :7777         :7777 → :7777        :8888 → :7777
         │                    │                    │
         │              ┌─────┴─────┐              │
         │              │  mongo:27017 (MongoDB container via external config)
         │              └───────────┘
         │
    MongoDB Atlas (dev)
```

### Deploy-time health-gated swap (try and fall back)

Every deploy follows this flow per environment. The previous working container is never touched until the new build proves healthy:

```
                       ┌────────────────────────────────────────────────────────┐
                       │ 1. Build & push image iuga/iuga-web-app-<env>:${BUILD_NUMBER} │
                       └───────────────────────────┬────────────────────────────┘
                                                   ▼
                       ┌────────────────────────────────────────────────────────┐
                       │ 2. Start candidate on TEMP port                       │
                       │    (old container untouched — still serving on live)   │
                       └───────────────────────────┬────────────────────────────┘
                                                   ▼
                       ┌────────────────────────────────────────────────────────┐
                       │ 3. Health check  GET /readyz  (up to 180s)             │
                       └──────────┬─────────────────────────────┬───────────────┘
                                  │ healthy (200)               │ failure
                                  ▼                             ▼
        ┌─────────────────────────────────────┐   ┌──────────────────────────────────┐
        │ 4. Swap: retire old container,      │   │ 5. Remove candidate, pipeline    │
        │    run new image on LIVE port       │   │    FAILS — previous working      │
        └──────────────────┬──────────────────┘   │    container keeps serving       │
                           ▼                       └──────────────────────────────────┘
        ┌─────────────────────────────────────┐
        │ 6. Re-check new container on live   │
        │    port (up to 30s)                 │
        └──────────┬──────────────────────────┘
                   │ failure
                   ▼
        ┌─────────────────────────────────────┐
        │ 7. Rollback: re-run the :last-good  │
        │    image on live port, pipeline     │
        │    FAILS (site stays up)            │
        └─────────────────────────────────────┘
```

On a successful deploy, the image is tagged `:last-good` so the fallback image is always the last build that passed the health check.

### What is managed by this repository

- Application code (backend Express server + frontend React SPA)
- Docker build
- Jenkins pipeline definitions (`dev.jenkinsfile`, `staging.jenkinsfile`, `prod.jenkinsfile`)

### What is NOT managed by this repository (external boundaries)

- **Jenkins server:** URL, configuration, plugins, and credential storage are outside this repo.
- **Nginx reverse proxy:** TLS termination and domain routing are configured externally (likely in a separate `iuga-server-config` repository or host config).
- **MongoDB container:** The `mongo` service and the `iuga-server-config_default` Docker network are created and managed externally.
- **MongoDB Atlas cluster:** Dev database is a SaaS resource configured outside this repo.
- **Docker Hub account:** The `iuga/` organization on Docker Hub is managed separately.
- **DNS records:** `dev.iuga.info`, `staging.iuga.info`, `iuga.info` are configured outside this repo.
- **Upload volume directory:** `/var/lib/iuga-web-app/uploads/` must exist on the host before deployment.

---

## How to Verify a Deployment

### 1. Check Jenkins build status

Navigate to the Jenkins job for the target environment and confirm the pipeline is green. Alternatively, check the GitHub commit status (look for `iuga/jenkins/cicd/<env>`).

### 2. Check the container is running

```bash
# Requires host access
docker ps --filter name=iuga-web-<env>   # e.g., iuga-web-prod, iuga-web-staging, iuga-web-dev
```

Expected output: `STATUS Up <time>`, port mapping matches the table above.

### 3. Check the application health

```bash
# From the host
curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>/readyz
# Dev: 6666, Staging: 7777, Prod: 8888
```

Expected: `200`

### 4. Check API endpoint

```bash
curl -s https://<domain>/api/v1/   # Replace with target domain
```

Expected: JSON response (empty array or API result — not a 404/502).

### 5. Check container logs for startup errors

```bash
docker logs iuga-web-<env> --tail 50
```

Expected: The last lines should show:
```
[startup] connecting to mongodb at <ISO timestamp>
[startup] successfully connected to mongodb after <N>ms
[startup] mongoose models created after <N>ms
[startup] Listening at 0.0.0.0:7777 after <N>ms
```

### 6. Check image was pushed to Docker Hub

Visit `https://hub.docker.com/r/iuga/iuga-web-app-<env>/tags` and confirm a tag for the latest `BUILD_NUMBER` exists. After a successful deploy, the matching `last-good` tag is also updated — that tag always points at the last build that passed the health check.

---

## Rollback

The pipeline now deploys with an **automated health gate**, so a broken build does not take the site down:

1. **Before switchover:** the new build starts as a candidate on a temp port and is health-checked against `GET /readyz` (up to 180s). If it fails, the candidate is removed, the old container keeps serving, and the pipeline fails — **no action needed**.
2. **After switchover:** the promoted container is re-checked on the live port (up to 30s). If it fails, the pipeline automatically rolls back to the `:last-good` image (the last build that passed the health check) and reports failure.
3. **Immutable images:** every build is tagged with its Jenkins `BUILD_NUMBER`, so the previous working image is always available on Docker Hub.

### Manual rollback (if ever needed)

```bash
docker pull iuga/iuga-web-app-<env>:last-good
docker rm -f iuga-web-<env>
docker run ... iuga/iuga-web-app-<env>:last-good
```

---

## Common Port Reference

| Environment | Internal Port | Host Port | Container Name |
|---|---|---|---|
| Development | 7777 | 6666 | `iuga-web-dev` |
| Staging | 7777 | 7777 | `iuga-web-staging` |
| Production | 7777 | 8888 | `iuga-web-prod` |

All environments bind to `127.0.0.1` only. External access goes through nginx.

---

## Related Documents

- [Maintainers Guide](MAINTAINERS.md) — Safe monitoring and maintenance procedures.
- [Troubleshooting Guide](TROUBLESHOOTING.md) — Common failures and diagnosis sequences.
- [README](../README.md) — Project overview, scripts, and quickstart.
