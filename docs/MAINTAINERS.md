# Maintainers Guide

> **Audience:** Maintainers performing routine checks, maintenance, and incident response.
> **Assumes:** Access to the production host, Jenkins, and Docker Hub. Credentials are **not** in this repository.
> **Reference:** [Deployment Guide](DEPLOYMENT.md), [Troubleshooting Guide](TROUBLESHOOTING.md).

---

## 1. Safe Monitoring Checks (read-only, least privilege)

These commands are safe to run on any host. They do **not** modify state.

### 1.1 List running containers

```bash
docker ps --filter name=iuga-web-
```

Expected output shows three containers (if all are deployed):

```
CONTAINER ID   IMAGE                              COMMAND                  CREATED       STATUS       PORTS                      NAMES
abc12345       iuga/iuga-web-app-development      "npm run deploy"         2 hours ago   Up 2 hours   127.0.0.1:6666->7777/tcp   iuga-web-dev
def67890       iuga/iuga-web-app-staging          "npm run deploy"         2 hours ago   Up 2 hours   127.0.0.1:7777->7777/tcp   iuga-web-staging
ghi11223       iuga/iuga-web-app-production       "npm run deploy"         2 hours ago   Up 2 hours   127.0.0.1:8888->7777/tcp   iuga-web-prod
```

### 1.2 Check container resource usage

```bash
docker stats --no-stream iuga-web-prod iuga-web-staging iuga-web-dev
```

Watch for CPU > 80% or memory growing steadily (possible leak).

### 1.3 View recent logs

```bash
docker logs iuga-web-<env> --tail 100
```

Look for:
- Startup errors (failed DB connection, port conflicts).
- Repeated error stacks (possible runtime bug).
- `GET /` or `GET /api/v1/...` entries with non-2xx status codes.

### 1.4 Check HTTP health from the host

```bash
for port in 6666 7777 8888; do
  echo -n "localhost:$port → "
  curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$port/
  echo
done
```

All three should return `200`.

### 1.5 Check public endpoints (external)

```bash
curl -s -o /dev/null -w "%{http_code}" https://dev.iuga.info/
curl -s -o /dev/null -w "%{http_code}" https://staging.iuga.info/
curl -s -o /dev/null -w "%{http_code}" https://iuga.info/
```

All should return `200`. A `502` or `503` indicates nginx cannot reach the backend (see [Troubleshooting: 502 Bad Gateway](TROUBLESHOOTING.md#3-502-bad-gateway)).

### 1.6 Check disk space on host

```bash
df -h /var/lib/iuga-web-app/
```

Ensure the uploads volume has free space. MongoDB data and user uploads live here.

### 1.7 Verify Jenkins job status via GitHub commit status

On any commit in the `main` branch, look for these contexts:
- `iuga/jenkins/cicd/dev`
- `iuga/jenkins/cicd/staging`
- `iuga/jenkins/cicd/prod`

All must be green (`success`) for a fully healthy deployment.

---

## 2. Routine Maintenance Procedures

### 2.1 Clean up old Docker images

> **Requires host access.** Images not used by any container are safe to prune.

```bash
docker image prune -f
```

To see what would be removed first (dry-run):

```bash
docker image prune --all -f --filter "until=720h"  # Remove images older than 30 days
```

### 2.2 Restart a container cleanly

> Use when the app is running but misbehaving (e.g., memory leak, hung connections).

```bash
docker restart iuga-web-<env>
```

Wait 10 seconds, then verify:
```bash
docker ps --filter name=iuga-web-<env> --format "{{.Status}}"
docker logs iuga-web-<env> --tail 10
```

### 2.3 Check uploads directory

```bash
ls -la /var/lib/iuga-web-app/uploads/<env>/
```

Verify that files are accessible and not accumulating unexpectedly.

### 2.4 Check MongoDB connectivity (from inside the container)

```bash
docker exec iuga-web-<env> node -e "
  const mongoose = require('mongoose');
  mongoose.connect('mongodb://...').then(() => {
    console.log('OK');
    process.exit(0);
  }).catch(e => {
    console.error('FAIL:', e.message);
    process.exit(1);
  });
"
```

> **Note:** Replace the connection string with the actual URI (prod uses `mongo:27017`, dev uses Atlas). Run this only during incident response.

---

## 3. Observation Points (what to watch for)

| Symptom | Possible cause | Action |
|---|---|---|
| Container restarting repeatedly | Crash loop (DB auth, port conflict) | Check logs, verify credentials |
| HTTP 502 from public URL | nginx cannot reach container | [See Troubleshooting](TROUBLESHOOTING.md#3-502-bad-gateway) |
| HTTP 502 from host `curl` | Container not listening or wrong port | `docker ps`, check port mapping |
| Stale content served | nginx cache or old container still running | `docker ps`, verify correct image tag |
| `docker push` fails in Jenkins | Docker Hub credential expired or rate-limited | Renew `dockerhub` credential in Jenkins |
| MongoDB connection failure | Network down, Atlas IP whitelist changed, credentials rotated | Verify network, check `DB_PROD_URI`/`DB_DEV_URI` |

---

## 4. Credential Rotation

Credentials are stored in Jenkins. This repository references them by ID only.

| Credential ID | Rotation frequency | Owner |
|---|---|---|
| `github_classic` | Per GitHub token expiry | [Team lead / IT] — *Escalate to fill* |
| `dockerhub` | Per Docker Hub policy | [Team lead / IT] — *Escalate to fill* |
| `devDBUsername` / `devDBPassword` | As needed | [Database admin] — *Escalate to fill* |
| `prodDBUsername` / `prodDBPassword` | As needed | [Database admin] — *Escalate to fill* |

When rotating, update the credential in Jenkins directly. No application code changes are needed.

---

## 5. Escalation Contacts

> **Placeholder:** Fill in the actual team/individual for each area.

| Area | Contact | Notes |
|---|---|---|
| Jenkins server | <!-- E.g., DevOps team / Slack #infra --> | |
| Docker Hub org | <!-- E.g., DevOps team --> | |
| DNS / nginx | <!-- E.g., Sysadmin --> | `dev.iuga.info`, `staging.iuga.info`, `iuga.info` |
| MongoDB Atlas | <!-- E.g., Database admin --> | Dev cluster |
| Production host | <!-- E.g., Sysadmin --> | Physical server access |
| GitHub repo admin | <!-- E.g., Tech lead --> | `github_classic` token management |

---

## 6. Related Documents

- [Deployment Guide](DEPLOYMENT.md) — Full pipeline walkthrough.
- [Troubleshooting Guide](TROUBLESHOOTING.md) — Symptom-to-cause diagnosis.
- [Architecture overview](ARCHITECTURE.md) — System components and data flow.
