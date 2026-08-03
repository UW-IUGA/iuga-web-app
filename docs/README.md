# IUGA Web App — Documentation Index

This directory contains the full documentation set for the **Informatics Undergraduate Association (IUGA)** website application.

> **Looking for the project overview?** See the [project README](../README.md) for quickstart, scripts, and project structure.

## Documents

| Document | Audience | Content |
|---|---|---|
| [Quickstart](QUICKSTART.md) | New developers | Prerequisites, installation, environment setup, running the app, verification |
| [Architecture](ARCHITECTURE.md) | All | Repository structure, system architecture, request flow, authentication flow, deployment boundary |
| [Development](DEVELOPMENT.md) | Developers | Setup, scripts, environment configuration, code conventions, common tasks, testing |
| [Frontend](FRONTEND.md) | Frontend devs | Tech stack, directory layout, routing, data flow, authentication, styling, dependencies |
| [Backend](BACKEND.md) | Backend devs | Entry points, directory layout, SPA routes, API routes, authentication, database, middleware stack, dependencies |
| [Deployment](DEPLOYMENT.md) | Maintainers | Pipeline overview, Jenkinsfile comparison, credentials, Docker build, runtime architecture, verification, rollback |
| [Maintainers](MAINTAINERS.md) | Maintainers | Monitoring checks, maintenance procedures, observation points, credential rotation |
| [Troubleshooting](TROUBLESHOOTING.md) | Developers & maintainers | Pipeline failures, runtime failures, 502 Bad Gateway, stale content, diagnosis sequences |

## Reading Order

1. **New to the project?** Start with [Quickstart](QUICKSTART.md) to get the app running.
2. **Understand the system?** Read [Architecture](ARCHITECTURE.md) for the big picture.
3. **Working on a feature?** See [Development](DEVELOPMENT.md) for workflow and conventions, then dive into [Frontend](FRONTEND.md) or [Backend](BACKEND.md).
4. **Deploying or maintaining?** Read [Deployment](DEPLOYMENT.md) and [Maintainers](MAINTAINERS.md).
5. **Something broken?** Check [Troubleshooting](TROUBLESHOOTING.md).

## Related

- [UW-IUGA/iuga-web-app](https://github.com/UW-IUGA/iuga-web-app) — Main repository on GitHub
- [UW-IUGA/iuga-web-schemas](https://github.com/UW-IUGA/iuga-web-schemas) — Shared Mongoose schema definitions (git submodule)
