# Troubleshooting Guide

> **Audience:** Developers and maintainers diagnosing failures in the IUGA Web App pipeline or runtime.
> **Approach:** Symptoms → probable causes → diagnosis steps.
> **Reference:** [Deployment Guide](DEPLOYMENT.md), [Maintainers Guide](MAINTAINERS.md).

---
## Local development sign-in

If clicking sign-in shows a backend/Docker reminder, start the Docker-based MongoDB environment used for local development, then run:

```bash
npm run dev
```

Development checks `http://localhost:7777/readyz` before redirecting to UW NetID. This prevents a missing local MongoDB/backend from leaving the developer on a blank or incomplete authentication flow. Production does not run this local Docker check.

---

## 1. Pipeline Failures

### 1.1 Checkout: GitHub authentication failure

**Symptom:** Jenkins pipeline fails at the Checkout stage with:
```
stderr: fatal: could not read Username for 'https://github.com': terminal prompts disabled
```
or
```
ERROR: Error cloning remote repo 'origin'
```

**Probable causes:**
1. The `github_classic` Jenkins credential has expired (GitHub Personal Access Token expired).
2. The credential was deleted or renamed in Jenkins.
3. GitHub app installation permissions changed.

**Diagnosis steps:**
1. **(Requires Jenkins admin)** Navigate to Jenkins → Credentials → System → Global credentials → `github_classic`.
2. Verify the credential exists and check its expiry date.
3. If expired, generate a new GitHub Personal Access Token (`Settings → Developer settings → Personal access tokens → Fine-grained tokens`) with **Contents: Read** and **Metadata: Read** scopes for `UW-IUGA` org repos.
4. Update the credential in Jenkins.

**Prevention:** Set a calendar reminder 2 weeks before the token's expiry date.

---

### 1.2 Checkout: Submodule fetch failure

**Symptom:** Pipeline fails at the Checkout or Initialize Submodules stage with:
```
fatal: could not read Username for 'https://github.com/UW-IUGA/iuga-web-schemas'
```

**Probable causes:**
1. The `github_classic` credential lacks access to the submodule repository (`UW-IUGA/iuga-web-schemas`).
2. The submodule URL in `.gitmodules` has changed (currently: `https://github.com/UW-IUGA/iuga-web-schemas`).

**Diagnosis steps:**
1. Verify the submodule URL in `.gitmodules` is reachable:
   ```bash
   git ls-remote https://github.com/UW-IUGA/iuga-web-schemas
   ```
   If this fails from the Jenkins host, the credential or network is the issue.
2. Confirm the PAT used in `github_classic` has access to `UW-IUGA/iuga-web-schemas`.

---

### 1.3 Build: Docker build fails

**Symptom:** Jenkins fails at the Build stage with:
```
The command '/bin/sh -c npm run build' returned a non-zero code
```

**Probable causes:**
1. A frontend dependency changed without a lockfile update.
2. The `VITE_API_URL` build argument is missing or incorrect.
3. Out of disk space on the Jenkins worker.

**Diagnosis steps:**
1. Check the Jenkins build log for the specific `npm` or `VITE_API_URL` error.
2. Verify the pipeline passes the intended `VITE_API_URL` build argument.
3. Reproduce locally:
   ```bash
   docker build . -t test --build-arg DEPLOY_ENV=development --build-arg VITE_API_URL=http://localhost:7777
   ```

---

### 1.4 Push: Docker Hub authentication failure

**Symptom:** Jenkins fails at the Push to Registry stage with:
```
denied: requested access to the resource is denied
```
or
```
unauthorized: authentication required
```

**Probable causes:**
1. The `dockerhub` Jenkins credential is expired or invalid.
2. Docker Hub rate limits reached (anonymous pull limits).

**Diagnosis steps:**
1. **(Requires Jenkins admin)** Check Jenkins → Credentials → `dockerhub` expiry date.
2. Verify credentials work manually:
   ```bash
   echo <password> | docker login --username <username> --password-stdin
   docker push iuga/iuga-web-app-<env>:latest  # verify push permission
   ```

---

### 1.5 Deploy: Container fails to start

**Symptom:** Jenkins Deploy stage succeeds but the container exits immediately.

**Probable causes:**
1. Port conflict on the host (e.g., another process already bound to the port).
2. MongoDB credentials are incorrect or the DB is unreachable.
3. Volume mount path `/var/lib/iuga-web-app/uploads/<env>` does not exist on the host.

**Diagnosis steps:**
1. Check if the container exists:
   ```bash
   docker ps -a --filter name=iuga-web-<env>
   ```
2. Check logs:
   ```bash
   docker logs iuga-web-<env> --tail 50
   ```
3. Common log errors:
   - `MongooseServerSelectionError: getaddrinfo ENOTFOUND mongo` → MongoDB container unreachable (staging/prod only).
   - `MongooseError: uri` or `Authentication failed` → DB credentials issue.
   - `EADDRINUSE` → Port already in use on the host.
4. Verify the uploads directory exists:
   ```bash
   ls -la /var/lib/iuga-web-app/uploads/<env>/
   ```

---

## 2. Runtime Failures

### 2.1 MongoDB connection failure

**Symptom:** Application starts but API requests fail or return 500 errors. Logs show:
```
MongooseServerSelectionError: Connection timed out
```

**Probable causes:**
1. **Staging / Production:** The `mongo` container is not running or the `iuga-server-config_default` network is disconnected.
2. **Development:** The MongoDB Atlas cluster IP whitelist has changed (the Jenkins worker's IP may have changed).
3. Database credentials were rotated in Jenkins but the container was not re-deployed (environment variables are injected at `docker run` time).

**Diagnosis steps:**

*Staging / Production:*
```bash
# Check MongoDB container
docker ps --filter name=mongo
# Check network
docker network inspect iuga-server-config_default | grep iuga-web-<env>
# Test connectivity from app container
docker exec iuga-web-<env> ping mongo
```

*Development:*
Check that the Jenkins worker's public IP is whitelisted in MongoDB Atlas (Project → Network Access → IP Whitelist).

---

### 2.2 Application crashes on startup

**Symptom:** Container exits within seconds of starting. `docker ps -a` shows `STATUS Exited`.

**Probable causes:**
1. Missing `.env.prod` file (the runtime stage copies `backend/` but `.env.prod` is gitignored and must exist on the build host).
2. Node.js `app.js` throws an uncaught exception during `import`.

**Diagnosis steps:**
1. Check full logs:
   ```bash
   docker logs iuga-web-<env>
   ```
2. Look for the exact stack trace.
3. Common pattern: `Error [ERR_MODULE_NOT_FOUND]` — a new import was added but the dependency is missing.

---

### 2.3 Uploads directory missing

**Symptom:** File uploads fail or return 500 errors. Logs show `ENOENT: no such file or directory`.

**Cause:** The volume mount path `/var/lib/iuga-web-app/uploads/<env>` does not exist on the host.

**Fix (requires host access):**
```bash
sudo mkdir -p /var/lib/iuga-web-app/uploads/<env>
# Then redeploy or restart the container
```

---

## 3. 502 Bad Gateway

**Symptom:** `https://<domain>/` returns HTTP 502 from nginx. The page shows "502 Bad Gateway" or a generic nginx error.

**Diagnosis sequence (least to most invasive):**

### Step 1 — Is the container running?

```bash
# Requires host access
docker ps --filter name=iuga-web-<env>
```

If the container is not running, check `docker ps -a` to see if it exited:
- **Exited:** follow [Application crashes on startup](#22-application-crashes-on-startup).
- **Not found:** the deployment may not have run yet, or the container was manually removed.

### Step 2 — Is the container listening on the expected port?

The application listens on port 7777 inside the container. The host port depends on the environment:

| Environment | Host port | Container port |
|---|---|---|
| Dev | 6666 | 7777 |
| Staging | 7777 | 7777 |
| Production | 8888 | 7777 |

Verify the port mapping:
```bash
docker port iuga-web-<env>
```

Expected output: `7777/tcp → 127.0.0.1:<host-port>`

If no ports are shown, the `-p` flag was omitted from `docker run`.

### Step 3 — Can you reach the application from the host?

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:<host-port>/readyz
```

- **200:** The app is healthy. The issue is in nginx configuration (TLS, proxy_pass URL, upstream definition). **Not managed by this repo.**
- **000 or connection refused:** The container is not listening. Check logs.
- **Other status:** The app returned a response but nginx may be misconfigured.

### Step 4 — Check nginx configuration (external boundary)

The nginx proxy is not managed by this repository. Common issues:

- `proxy_pass` URL points to the wrong port.
- The upstream server is defined but the container is on a different network.
- TLS certificate expired (shows as certificate error in browser, or nginx refuses to start).

**Check nginx config (if accessible):**
```bash
nginx -t
```

**Expected:** `syntax is ok` / `test is successful`

### Step 5 — Restart steps

Only try these if Steps 1–4 confirm the container is healthy and nginx is the issue.

1. Restart nginx (requires host access):
   ```bash
   sudo nginx -s reload
   ```
2. Or check if the container needs restarting:
   ```bash
   docker restart iuga-web-<env>
   ```

---

## 4. Stale Content

**Symptom:** The live site shows old content even after a successful Jenkins deployment.

**Probable causes:**
1. Browser cache (hard refresh usually fixes — `Cmd+Shift+R` on macOS).
2. nginx cache is serving a stale response.
3. The old container was not stopped (check `docker ps` for multiple `iuga-web-` containers).
4. The deployment is still in progress (check Jenkins build for that environment).

**Diagnosis:**
1. Append a query parameter: `https://<domain>/?_t=<timestamp>`.
2. Run from the host:
   ```bash
   curl -s -I https://<domain>/ | grep -i "x-cache\|age\|etag"
   ```
3. Check container images:
   ```bash
   docker inspect iuga-web-<env> --format '{{.Config.Image}}'
   ```
   Compare with the latest tag on Docker Hub.

---

## 5. Jenkins Build Status Not Updating in GitHub

**Symptom:** Jenkins pipeline runs successfully but the GitHub commit status remains yellow/pending or doesn't appear.

**Probable causes:**
1. The `github_classic` credential is expired (affects the `setBuildStatus` API calls).
2. The GitHub API URL in `setBuildStatus` is wrong (currently: `https://api.github.com/repos/UW-IUGA/iuga-web-app/statuses/$gitCommit`).

**Diagnosis:**
1. Check if the `setBuildStatus` calls succeed in Jenkins build logs. Search for `curl -X POST` output.
2. Verify the credential:
   ```bash
   curl -u <username>:<token> https://api.github.com/repos/UW-IUGA/iuga-web-app
   ```
   Should return repo metadata, not `401`.

---

## 6. Pipeline Stage Summary

| Stage | What to check if it fails | Credential required |
|---|---|---|
| Checkout | `github_classic` validity, repo access, network | `github_classic` |
| Initialize Submodules | Submodule repo access, `.gitmodules` correctness | `github_classic` |
| Build | `npm` errors, `sed` transform, disk space | None |
| Push to Registry | Docker Hub auth, rate limits, image name | `dockerhub` |
| Deploy | Port conflict, DB credentials, volume path, network | `devDBUsername`/`devDBPassword` or `prodDBUsername`/`prodDBPassword` |

---

## 7. Known Failure Modes Not Yet Documented

If you encounter a failure not covered by this guide, capture the following and escalate:

1. Exact error message from Jenkins build log.
2. Container status and logs (`docker ps -a`, `docker logs iuga-web-<env> --tail 100`).
3. Any recent changes to Jenkins credentials, Docker Hub, or host configuration.

---

## 8. Related Documents

- [Deployment Guide](DEPLOYMENT.md) — Verified pipeline steps and expected outcomes.
- [Maintainers Guide](MAINTAINERS.md) — Safe monitoring and maintenance procedures.
