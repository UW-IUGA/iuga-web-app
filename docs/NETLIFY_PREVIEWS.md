# Pull Request Previews (Netlify)

> **Audience:** Maintainers who review pull requests or manage deployment credentials.
> **Pipeline:** GitHub Actions → Netlify. This is separate from the Jenkins → Docker pipeline in [Deployment](DEPLOYMENT.md).

Every pull request from a branch in this repository gets a frontend-only preview on Netlify. The workflow builds the app with mock data, publishes it, comments the preview URL on the PR, and checks that a deep link resolves.

| | |
|---|---|
| Workflow | `.github/workflows/netlify-preview.yml` |
| Preview URL | `https://pr-<number>--iuga.netlify.app` |
| Production site | `https://iuga.netlify.app` |
| Backend | Not deployed with previews |

---

## What runs

The workflow triggers on `pull_request` for `opened`, `synchronize`, and `reopened`.

It is skipped when:

- **The PR comes from a fork.** Fork PRs do not receive repository secrets.
- **The PR author is Dependabot.** Dependabot runs do not receive Actions secrets, even when the branch lives in this repository.

Two jobs run in order:

### 1. `build` — no secrets

1. Checks out the PR merge commit with `submodules: false`, so the private `context` submodule is never cloned.
2. Installs frontend dependencies with `npm ci`.
3. Builds with `npm run build -- --mode development`.
4. Uploads `frontend/build` as the `frontend-build` artifact.

Development mode matters: it makes the frontend use its in-repo mock data and avoids the `VITE_API_URL is required for production builds` error in `frontend/vite.config.mjs`.

### 2. `deploy` — uses repository secrets

1. Downloads the `frontend-build` artifact.
2. Deploys it with `nwtgck/actions-netlify`, pinned to a commit SHA.
3. Comments the preview URL on the PR.
4. Requests `/events` from the preview and fails the job if the response is not 2xx.

The `build` and `deploy` split keeps the Netlify credentials out of the job that runs PR build scripts. It does not protect against a PR that edits the workflow's deploy job; see [Trust boundary](#trust-boundary).

---

## Why previews use mock data

The Express backend is not deployed with a preview. `frontend/src/runtime.js` sets `isProduction` from `import.meta.env.MODE`, and non-production builds read the mock calendar and event data in the frontend. That keeps previews self-contained, fast, and free of production data.

A preview is for reviewing layout, copy, navigation, and client-side behavior. It is not a backend integration test.

---

## Deep links

`frontend/public/_redirects` contains one rule:

```text
/*    /index.html   200
```

Vite copies it to `frontend/build/_redirects`. Netlify serves `index.html` for unknown paths, so a direct visit or refresh on a client route such as `/events` resolves instead of returning 404.

The deploy job checks `/events` on the preview URL for exactly this reason. If the redirect is missing, the smoke test fails before the PR can claim a working preview.

---

## Netlify configuration

The Netlify site is **not linked to Git**. It was created with Netlify Drop, and GitHub Actions is the only deployer.

That is deliberate. A Git-linked Netlify site clones every submodule before building, including the private `context` submodule, and fails during "preparing repo" with `could not read Username for 'https://github.com'`.

### Repository secrets

Stored in GitHub under **Settings → Secrets and variables → Actions**:

| Secret | Value | Where to find it |
|---|---|---|
| `NETLIFY_SITE_ID` | The Netlify Project ID | Project configuration → General → Project details |
| `NETLIFY_AUTH_TOKEN` | A Netlify personal access token | Netlify user settings → Applications → Personal access tokens |

Both are required. A missing or stale value makes the deploy step fail with `##[error]Unauthorized`.

### Netlify access setting

**Deploy previews must be public** (Project configuration → Access & security → Deploy previews).

If previews are password-protected, the smoke test receives `401` even when the production site is public, and the job fails. This was the cause of the first failed preview run for this pipeline.

---

## Trust boundary

`pull_request` workflows run the workflow file from the PR's merge commit. A same-repository PR can therefore change `.github/workflows/netlify-preview.yml`, including the deploy job that receives `NETLIFY_AUTH_TOKEN`.

Only collaborators with write access can push same-repository branches, so **treat write access to this repository as deploy access to the Netlify site**.

The `build`/`deploy` split keeps secrets away from PR build scripts. It does not isolate them from a PR that edits the workflow itself. If that risk becomes unacceptable, the options are:

- move the deploy job to a workflow that runs from the base branch, or
- put the deploy job behind a protected environment with required reviewers.

Fork and Dependabot PRs are skipped because they do not receive the secrets in the first place.

---

## Verifying a preview

1. Open the PR's **Checks** tab and confirm the `Netlify PR preview` run is green.
2. Confirm the PR has a comment: `🚀 Deployed on https://pr-<number>--iuga.netlify.app`.
3. Visit the preview URL and a deep link such as `/events`.

The workflow takes about 40 seconds end to end: roughly 25 seconds to build and 15 seconds to deploy and smoke test.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `##[error]Unauthorized` in the deploy step | `NETLIFY_AUTH_TOKEN` or `NETLIFY_SITE_ID` is missing, stale, or belongs to another site | Recreate both repository secrets from the current Netlify site and token |
| Smoke test fails with `curl: (22) ... 401` | Netlify deploy previews are password-protected | Set Deploy previews access to public |
| Smoke test fails with `curl: (22) ... 404` | `frontend/public/_redirects` is missing or was not copied into the build | Confirm the file exists and `frontend/build/_redirects` is present |
| Build fails with `VITE_API_URL is required for production builds` | The workflow built without `--mode development` | Use `npm run build -- --mode development` |
| Workflow does not run | The PR is from a fork or Dependabot | Open the PR from a branch in this repository |
| Netlify clone fails with `could not read Username` | The Netlify site is Git-linked and is cloning the private `context` submodule | Keep the Netlify site unlinked; GitHub Actions must be the deployer |

---

## Changing the Netlify site

To move previews to a different Netlify site:

1. Create the site with Netlify Drop or an unlinked deploy. Do not connect it to Git.
2. Set Deploy previews access to public.
3. Update `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN` in GitHub repository secrets.
4. Open a PR and confirm the workflow posts a working preview URL.

No workflow change is needed when only the site or token changes.

---

## What previews do not do

- Do not deploy the backend or connect to a database.
- Do not use production data.
- Do not replace the Jenkins → Docker pipeline for `dev` or `main`.
- Do not run for fork or Dependabot PRs.

---

## Related

- [Deployment Guide](DEPLOYMENT.md) — Jenkins → Docker pipeline for `dev`, staging, and production.
- [Maintainers Guide](MAINTAINERS.md) — credential rotation and monitoring.
- [Frontend Guide](FRONTEND.md) — routing and mock data.
- Workflow: [`.github/workflows/netlify-preview.yml`](../.github/workflows/netlify-preview.yml)
