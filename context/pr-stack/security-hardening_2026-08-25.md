# Security hardening stack

Trunk: `dev` at `63e9f70`

## Current stack

| Position | Branch | Concern | Base | GitHub PR |
| --- | --- | --- | --- | --- |
| 1 | `fix/login-hardening` | Graph-backed login hardening | `dev` | [#90](https://github.com/UW-IUGA/iuga-web-app/pull/90) — draft |
| 2 | `fix/roles-netid` | Remove obsolete NetID search | `fix/login-hardening` | [#91](https://github.com/UW-IUGA/iuga-web-app/pull/91) — draft |
| 3 | `chore/login-fetch-dependency` | Remove obsolete fetch dependency | `fix/roles-netid` | [#92](https://github.com/UW-IUGA/iuga-web-app/pull/92) — draft |

## Scope boundary

This layer covers malformed or unsupported Bearer headers, non-successful or unavailable Microsoft Graph responses, required identity fields, email fallback, profile drift on re-login, session rotation at authentication, the Graph request timeout, native Node fetch, and removal of the dead `uNetId` officer-search consumer. It must preserve the existing successful login response contract.

The session-boundary work described by the roadmap is not present in this repository commit. Environment-specific Jenkins session credentials were reported as created externally but remain deployment evidence to verify later; this PR does not claim that evidence.

## Planned follow-up layers

- `fix/ownership-boundaries`
- `fix/authorization-gaps`
- `fix/http-boundary`
- `fix/input-validation`
- `chore/backend-dependency-hardening`
- `chore/frontend-dependency-hardening`

Deployment/container hardening remains a separate stack.
