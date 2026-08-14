# Deployment Guide

> **Audience:** Developers and maintainers deploying IUGA Web App.
> **Pipeline:** GitHub → Jenkins → Docker → Production server.
> **Reference:** [Architecture overview](ARCHITECTURE.md), [Quickstart](QUICKSTART.md), [Maintainers](MAINTAINERS.md), [Troubleshooting](TROUBLESHOOTING.md).

---

## Pipeline Overview

Every environment (dev, staging, production) follows the same five-stage pipeline:

| Stage | What happens | Responsibility |
|---|---|---|
| Checkout | Jenkins clones `github.com/UW-IUGA/iuga-web-app` (branch `main`) with submodules using the `github_classic` credential. | Jenkins |
| Build | `docker build` with `--build-arg DEPLOY_ENV` selects the target environment's API URL via sed transforms in the Dockerfile. | Jenkins |
| Push to Registry | `docker push` to Docker Hub after authenticating with the `dockerhub` credential. | Docker Hub |
| Deploy | `docker pull`, stop/remove old container, `docker run` with env variables and volume mounts. | Production host |
| Status report | Jenkins posts a commit status to GitHub (`iuga/jenkins/cicd/<env>`). | Jenkins |

### Trigger

- **Dev / Staging / Production:** A push to `main` triggers all three pipelines (they run independently).
- **Staging only:** Uses `checkout scm` (multibranch pipeline); the others use explicit branch `*/main`.

> **Note:** All environments deploy from the `main` branch. There is no per-environment branch strategy.

---

## Jenkinsfile Comparison

### `dev.jenkinsfile` (Development)

- **Image name:** `iuga/iuga-web-app-development`
- **Container name:** `iuga-web-dev`
- **Host port:** `6666` → container port `7777`
- **Network:** None (default bridge)
- **Volume:** `/var/lib/iuga-web-app/uploads/dev:/app/backend/public/uploads`
- **DB credentials:** `devDBUsername`, `devDBPassword` (Jenkins string credentials)
- **Database:** MongoDB Atlas (`cluster0.ejo8heu.mongodb.net`)
- **Commit status context:** `iuga/jenkins/cicd/dev`

### `staging.jenkinsfile` (Staging)

- **Source:** `checkout scm` (Jenkins multibranch pipeline — uses the branch/tag that triggered the job)
- **Image name:** `iuga/iuga-web-app-staging`
- **Container name:** `iuga-web-staging`
- **Host port:** `7777` → container port `7777`
- **Network:** `iuga-server-config_default`
- **Volume:** `/var/lib/iuga-web-app/uploads/prod:/app/backend/public/uploads`
- **DB credentials:** `prodDBUsername`, `prodDBPassword` (Jenkins string credentials — staging shares the production database)
- **Database:** MongoDB container at `mongo:27017` (via `iuga-server-config_default` network)
- **Commit status context:** `iuga/jenkins/cicd/staging`

### `prod.jenkinsfile` (Production)

- **Image name:** `iuga/iuga-web-app-production`
- **Container name:** `iuga-web-prod`
- **Host port:** `8888` → container port `7777`
- **Network:** `iuga-server-config_default`
- **Volume:** `/var/lib/iuga-web-app/uploads/prod:/app/backend/public/uploads`
- **DB credentials:** `prodDBUsername`, `prodDBPassword` (Jenkins string credentials)
- **Database:** MongoDB container at `mongo:27017` (via `iuga-server-config_default` network)
- **Commit status context:** `iuga/jenkins/cicd/prod`

---

## Credential Categories

Jenkins requires these credential IDs (values are **not** in this repository):

| Credential ID | Type | Purpose |
|---|---|---|
| `github_classic` | Username+Password | GitHub API authentication for checkout and commit status updates |
| `dockerhub` | Username+Password | Docker Hub login for image push |
| `devDBUsername` | String | MongoDB dev database username |
| `devDBPassword` | String | MongoDB dev database password |
| `prodDBUsername` | String | MongoDB production/staging database username |
| `prodDBPassword` | String | MongoDB production/staging database password |

---

## Docker Build Process

The [Dockerfile](../Dockerfile) is a multi-stage build:

1. **Build stage** (`FROM node:22-alpine AS build`)
   - Copies `frontend/` into `/app/frontend`
   - Installs npm dependencies
   - Transforms API URLs via `sed` based on `DEPLOY_ENV`:

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
    MongoDB Atlas
    (cluster0.ejo8heu.mongodb.net)
```

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
curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>/
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
Listening at 0.0.0.0:7777
connecting to <prod|dev> database
successfully connected to <prod|dev> mongodb
mongoose models created
```

### 6. Check image was pushed to Docker Hub

Visit `https://hub.docker.com/r/iuga/iuga-web-app-<env>/tags` and confirm the latest tag has the expected build timestamp.

---

## Rollback

This repo does not define an automated rollback mechanism. To roll back:

1. Identify the previous working image tag on Docker Hub.
2. On the production host, pull and run the old image:
   ```bash
   docker pull iuga/iuga-web-app-<env>:<previous-tag>
   docker rm -f iuga-web-<env>
   docker run ... iuga/iuga-web-app-<env>:<previous-tag>
   ```
3. (If appropriate) revert the Git commit and re-run the pipeline.

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
