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
  curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$port/readyz
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

On any commit on the `dev`/`main` branches (or the triggering branch for staging), look for these contexts:
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
docker exec iuga-web-<env> node --input-type=commonjs -e "
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

> **Note:** The backend is ES modules, so the `--input-type=commonjs` flag is required to use `require()` in this snippet. Replace the connection string with the actual URI (prod uses `mongo:27017`, dev uses Atlas). Run this only during incident response.

### 2.5 List pending shop purchases

Read-only. Lists each pending Venmo purchase with the student's name, email, Venmo username, items, and total. Run in `mongosh` against the environment's database:

```js
db.shoppurchases.aggregate([
  { $match: { status: "pending" } },
  { $sort: { confirmedAt: 1 } },
  { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "student" } },
  { $unwind: "$student" },
  { $project: {
      _id: 0,
      purchaseId: "$_id",
      confirmedAt: 1,
      name: "$student.uDisplayName",
      email: "$student.uEmail",
      venmoUsername: 1,
      items: { $map: { input: "$lines", in: { $concat: [{ $toString: "$$this.quantity" }, " x ", "$$this.name", " (", "$$this.size", ")"] } } },
      totalDollars: { $divide: ["$totalCents", 100] },
  } },
])
```

This lists only purchases still `pending` (Unconfirmed). Officers with the `shop.purchases.review` permission record paid, dropped, and refunded orders on `/admin/shop/orders`; see `docs/FRONTEND.md`.

### 2.6 Pause new shop checkouts before an update

A deploy signs every student out, because sign-in sessions live in the app's memory. Holds and purchases are in the database and are not lost. To avoid interrupting students who are paying, pause new checkouts first, wait for the active holds to finish, deploy, then turn checkout back on. Run in `mongosh` against the environment's database.

**With a warning (preferred).** Announce a maintenance time, here 15 minutes from now. Students with items in their cart see a countdown banner on every page, checkout keeps working until then, and holds started in the meantime end at that time. When it arrives, new checkouts stop on their own:

```js
db.shopsettings.updateOne({ key: "shop" }, { $set: { maintenanceAt: new Date(Date.now() + 15 * 60 * 1000) } }, { upsert: true })
```

After the update, clear it so checkout opens again and the banner goes away:

```js
db.shopsettings.updateOne({ key: "shop" }, { $set: { maintenanceAt: null } })
```

**Right away.** Pause new checkouts now. Students with a hold can still confirm it; everyone else sees "Checkout is paused for a few minutes":

```js
db.shopsettings.updateOne({ key: "shop" }, { $set: { newCheckoutsPaused: true } }, { upsert: true })
```

Count the holds still in progress. Deploy when this reaches 0, which takes at most one hold duration (15 minutes by default):

```js
db.shopholds.countDocuments({ status: "active", expiresAt: { $gt: new Date() } })
```

Turn checkout back on:

```js
db.shopsettings.updateOne({ key: "shop" }, { $set: { newCheckoutsPaused: false } })
```

### 2.7 Give an officer access

Officer tools need a **permission**, and permissions come only from roles. A user's `uType` ("Admin" or "Member") grants nothing. [BACKEND.md](./BACKEND.md#session-check-and-permissions) lists the permissions. Changes take effect on the officer's next request; they do not need to sign in again.

An officer with `users.roles.manage` can create roles (`POST /api/v1/roles`) and assign them (`POST /api/v1/roles/users/<userId>/assignments` with `{ roleId, expiresAt }`). Set `expiresAt` to the end of the officer's term so access ends on its own. `DELETE /api/v1/roles/users/<userId>/assignments/<assignmentId>` removes access and keeps the record.

The first role manager has to be set up in `mongosh`, because nobody can call those routes yet. Find the user, create the role, then assign it with the ids those commands return:

```js
db.users.find({ uEmail: "<officer>@uw.edu" }, { uDisplayName: 1 })
db.roles.insertOne({ roleName: "Role manager", roleKey: "role_manager", permissions: ["users.roles.manage"], isActive: true })
db.roleassignments.insertOne({ userId: ObjectId("<user id>"), roleId: ObjectId("<role id>"), isActive: true, expiresAt: null, assignedAt: new Date() })
```

**Upgrading from a release that used `uType: "Admin"`:** such accounts lose officer tools after the update until they receive a role with the permissions they need. Event request tools need `events.requests.manage`.

---

## 3. Observation Points (what to watch for)

| Symptom | Possible cause | Action |
|---|---|---|
| Container restarting repeatedly | Crash loop (DB auth, port conflict) | Check logs, verify credentials |
| HTTP 502 from public URL | nginx cannot reach container | [See Troubleshooting](TROUBLESHOOTING.md#3-502-bad-gateway) |
| HTTP 502 from host `curl` | Container not listening or wrong port | `docker ps`, check port mapping |
| Stale content served | nginx cache or old container still running | `docker ps`, verify correct image tag |
| `docker push` fails in Jenkins | Docker Hub credential expired or rate-limited | Renew `dockerhub` credential in Jenkins |
| MongoDB connection failure | Network down, Atlas IP whitelist changed, credentials rotated | Verify network, check `DB_URI` |

---

## 4. Credential Rotation

Credentials are stored in Jenkins. This repository references them by ID only.

| Credential ID | Rotation frequency | Owner |
|---|---|---|
| `github_classic` | Per GitHub token expiry | [Team lead / IT] — *Escalate to fill* |
| `dockerhub` | Per Docker Hub policy | [Team lead / IT] — *Escalate to fill* |
| `DB_URI` | As needed | [Database admin] — *Escalate to fill* |
| `SESSION_SECRET_DEV` / `_STAGING` / `_PROD` | As needed | [Team lead / IT] — *Escalate to fill* |

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
