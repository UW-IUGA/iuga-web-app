> **See also:** [Architecture overview](ARCHITECTURE.md) · [Development guide](DEVELOPMENT.md) · [Frontend docs](FRONTEND.md) · [Troubleshooting](TROUBLESHOOTING.md)

> This document describes the backend structure and API. For the frontend, see [FRONTEND.md](./FRONTEND.md).

---

# IUGA Website — Backend

**Tech stack:** Express.js 4, Mongoose 6, MongoDB, express-session, Microsoft MSAL

---

## Entry Points

| File | Role |
|---|---|
| `bin/www.cjs` | HTTP server bootstrap — imports `app.js`, listens on `PORT` (default 7777) |
| `app.js` | Express application setup — middleware stack, static serving, API mount |
| `models.js` | MongoDB connection + Mongoose model registration |

---

## Directory Layout

backend/
├── bin/
│   └── www.cjs              ← Server entry point (CommonJS)
├── app.js                   ← Express app config and middleware order
├── httpBoundaryConfig.js    ← Shared body-size and browser-origin policy
├── httpErrorHandler.js      ← Safe JSON responses for parser/server errors
├── models.js                ← Database connection + model registration
├── schemas/                 ← Git submodule → UW-IUGA/iuga-web-schemas
├── routes/
│   └── api/v1/
│       ├── apiv1.js         ← API router (mounts controller modules)
│       ├── controllers/
│       │   ├── user.js           ← Login, logout, user info
│       │   ├── events.js         ← Event browsing and RSVP
│       │   ├── feedback.js       ← Feedback form CRUD
│       │   ├── roles.js           ← Role catalog and role assignments
│       │   ├── eventRequests.js   ← Event request workflow and operations
│       │   └── administration.js ← Unmounted officer/committee stubs
│       └── utils/
│           ├── auth.js        ← Authentication and permission middleware
│           ├── csrf.js        ← Origin checks for session mutations
│           └── rateLimit.js   ← Process-local request limits
├── .env.example            ← Tracked runtime template
├── env/                    ← Ignored runtime environment files
└── package.json            ← ES module ("type": "module")
```

---

## SPA Routes

These routes in `app.js` serve the built frontend (`frontend/build/index.html`) for every path the React Router handles. This enables **deep linking** — users can navigate directly to `/events` and get the SPA shell.

| Route | Purpose |
|---|---|
| `GET /` | Home page |
| `GET /events` | Events calendar |
| `GET /resources` | Resources page |
| `GET /get-involved` | Get involved page (team, committees, idea engagement) |
| `GET /electionfaq` | Election FAQ |
| `GET /contact` | Contact page |

Each handler reads `../frontend/build/index.html` and sends it. If the build directory is missing, these routes return 500.

Express also serves:
- Static files from `../frontend/build/` (line: `app.use(express.static("../frontend/build"))`)
- Uploaded files from `public/uploads/` via `GET /uploads`

---

## API Routes
### Events (`/api/v1/events`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | No | All events for the calendar. Authenticated callers also receive `hasRSVPd`; anonymous callers receive `false`. |
| `GET` | `/upcoming` | No | Latest 3 events (sorted by start date descending). Used by the homepage. |
| `GET` | `/id/:eId` | No | Single event details. Includes RSVP questions, participant count, thumbnail, and the caller's RSVP answers when authenticated. |
| `POST` | `/rsvp` | Yes | RSVP to an event. Requires a valid event ID and an array of string answers; also checks event state and duplicate participation. |
| `DELETE` | `/withdraw/:eId/:pId` | Yes | Withdraw only the caller's participant from the matching event. Admins may withdraw any participant. |
| `GET` | `/:pId` | Yes | Return protected participant details only to the participant owner or an admin. |

### User (`/api/v1/user`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/login` | No* | Exchange MS access token for a server session. Validates token via Microsoft Graph API. Creates user in MongoDB if new. |
| `POST` | `/logout` | Yes | Destroy server session. |
| `GET` | `/` | Yes | Return current session user info (firstName, lastName, displayName, email, memberType). |
| `GET` | `/:uId` | Yes | Validate a user ID before entering the current owner/admin view stub. |
| `POST` | `/:uId` | Yes | Validate a user ID before entering the current self/admin update stub. |

\* `/login` does not require a session but does require a Bearer token from Microsoft.

### Feedback (`/api/v1/feedback`)

The controller provides CRUD. `POST /` requires a logged-in session (`fUID` comes from the session, not the request body):

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Get a feedback form by `fID` query parameter |
| `POST` | `/` | Submit a new feedback form (requires session). Body: `{ fType, fTopic, fDescription }` — `fUID` comes from the session, not the body |
| `DELETE` | `/` | Delete a feedback form by `fID` query parameter |

### Role catalog (`/api/v1/roles`)

These endpoints require the `users.roles.manage` permission. They manage role definitions, inspect assignments, and create or deactivate role assignments.

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List active and inactive role definitions |
| `POST` | `/` | Create a role using backend-approved permission keys |
| `PATCH` | `/:id` | Update role details without changing `roleKey` |
| `GET` | `/users?search=` | Search users by display name, email, or NetID |
| `GET` | `/users/:id/assignments` | Read a user's active role assignments |
| `POST` | `/users/:id/assignments` | Assign an active role to a user. Body: `{ roleId, committeeId?, reportsToUserId?, expiresAt? }` |
| `DELETE` | `/users/:id/assignments/:assignmentId` | Deactivate an assignment without deleting its history |

`roleName` is the display name. `roleKey` is the stable internal identifier, such as `finance_director`. The API validates role keys, field lengths, booleans, and recognized permissions. It returns only deliberate user identity fields during search.

Assignment creation validates the target user, role, optional committee, optional reporting user, expiration date, duplicate active assignments, inactive roles, and self-reporting. Assignment creation records `assignedBy` from the authenticated session. Deactivation records `deactivatedBy` and `deactivatedAt` while preserving the assignment record.

### Event administration (`/api/v1/event-requests`)

Officer-only event operations use separate EventRequests records before publishing an Events record. The requesting group is the committee, student organization, or IUGA group asking to run the event; it is not the authenticated requester. All actor fields come from the authenticated session. Leadership actions require `events.leadership.approve`; budget changes require `events.finance.manage`; purchase checkpoint changes require `events.purchases.complete`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/` | Submit an event request. Requester and organizer come from the session. |
| `PATCH` | `/:id` | Resubmit a request after leadership requests changes; only its requester may edit it. |
| `GET` | `/templates/slides` | Return configured OneDrive slide templates from `EVENT_SLIDE_TEMPLATES`. |
| `GET` | `/mine` | List requests submitted by the current officer. |
| `GET` | `/` | List officer requests, optionally filtered by `status` or `requesterId`. |
| `GET` | `/:id` | Read one request and its checkpoints. |
| `POST` | `/:id/request-changes` | Leadership returns a request with a required reason. |
| `POST` | `/:id/deny` | Leadership denies a request with a required reason. |
| `POST` | `/:id/approve` | Leadership approves and publishes an Events record; this completes the `proposal` checkpoint. |
| `PATCH` | `/:id/checklist/:step` | Update an independent checkpoint. The sequence is `proposal`, `meeting`, `finance`, `room`, `marketing`, `purchases`, `completion`, `review`. |
| `PATCH` | `/:id/budget` | Finance records allocated and actual cents. |
| `PATCH` | `/:id/booking` | Record room booking details and actor audit fields. |
| `PATCH` | `/:id/review-tracking` | Store the external OneDrive/Microsoft Forms review link and manually record receipt. |
| `POST` | `/:id/reviews` | Submit an organizer or distinct-member post-event review. |
| `GET` | `/:id/reviews` | List post-event reviews. |
| `POST` | `/:id/complete` | Close an approved request after all checkpoints and both reviews are complete. |
Money is displayed as dollars and cents in the UI, then converted to an integer number of cents before the API call. For example, `$125.50` becomes `{ "allocatedCents": 12550 }`; the backend never stores floating-point currency.

### Administration (`/api/v1/administration`) — *not currently wired*

⚠️ **These endpoints are defined in `controllers/administration.js` but are NOT imported by `apiv1.js`. All requests to `/api/v1/administration/*` currently return 404.**

All endpoints are **stubs** returning placeholder text:

| Method | Path | Description |
|---|---|---|
| `POST` | `/officers` | Save/update officer (stub) |
| `GET` | `/officers` | Retrieve officer (stub) |
| `DELETE` | `/officers` | Remove officer (stub) |
| `POST` | `/committees` | Save/update committee (stub) |
| `GET` | `/committees` | Retrieve committee (stub) |
| `DELETE` | `/committees` | Remove committee (stub) |

To activate, import and mount `administrationRouter` in `apiv1.js`.

---

## Authentication

The backend uses **server-side sessions** with `express-session`.

### Session creation (login flow)

1. Frontend sends `POST /api/v1/user/login` with `Authorization: Bearer <ms-access-token>`
2. Backend calls `https://graph.microsoft.com/v1.0/me` with the token to verify identity
3. On success, the backend:
   - Sets `req.session.isAuthenticated = true`
   - Stores profile data (displayName, email, firstName, lastName) in session
   - Looks up or creates a `Users` document in MongoDB
   - Stores `userId`, `memberType`, and `isAdmin` in session
4. Responds with the user document

### Session check

`utils/auth.js` provides session and permission middleware:

- `requireAuth` — requires a logged-in session
- `requireAdmin` — requires a logged-in admin/officer session
- `requireOfficerRolePermission("users.roles.manage")` — requires an active role assignment granting the permission.

The permission middleware loads active role assignments for the session user and checks the populated role permissions before calling `next()`.

| Middleware | Blocks when | Returns |
|---|---|---|
| `requireAuth` | No session (`req.session.isAuthenticated` falsy) | `401` not authenticated |
| `requireAdmin` | No session, or logged in but not an officer (`req.session.isAdmin` falsy) | `401` not authenticated / `403` not authorized |

Attach them in the route chain, e.g. `router.post("/", requireAuth, handler)` or `router.post("/:id/approve", requireAdmin, handler)`. They run before the route handler; `next()` passes the request through.

### Session destruction

`POST /api/v1/user/logout` destroys the session. A successful response is `{ status: "success" }`; a session-store failure returns the generic 500 error envelope.

### HTTP security boundaries

The application applies these checks before API handlers:

- `SESSION_SECRET` must be supplied at startup; there is no source-controlled fallback.
- Session cookies are `httpOnly`, use `SameSite=Lax`, and are `secure` in staging and production.
- Authenticated `POST`, `PUT`, `PATCH`, and `DELETE` requests must include an allowed browser `Origin`. Login is exempt because it uses a Microsoft Bearer token instead of a session cookie.
- CORS allows only `http://localhost:3000`, `http://localhost:5173`, and the documented IUGA domains. Backend ports such as `7777` are not browser origins.
- JSON and URL-encoded bodies are limited to 32 KB. API traffic is limited to 100 requests per 15 minutes, and login is limited to 10 requests per minute per client address.
- Malformed JSON, oversized bodies, CORS failures, and unexpected server failures return the repository JSON error envelope rather than HTML or stack traces.

Production dependency audits currently pass for the backend. The frontend audit still reports two moderate React Router advisories:

- `GHSA-wrjc-x8rr-h8h6` — open redirect through backslash handling.
- `GHSA-337j-9hxr-rhxg` — constructor injection in SSR hydration error deserialization.

The current frontend uses React Router 6 with `BrowserRouter` and does not use SSR hydration. Existing navigation targets are internal paths, so no affected external redirect flow is currently documented; future route-input changes must preserve that property. The available fix requires a breaking React Router 7 upgrade. **Owner:** frontend maintainer, in a separate migration.

---

## Database

### Connection

Connection logic is in `models.js` and depends on `DEPLOY_ENV`:

```javascript
if (DEPLOY_ENV === "production" || DEPLOY_ENV === "staging") {
  // mongodb://user:pass@mongo:27017/iuga  (Docker network)
} else {
  // mongodb+srv://user:pass@cluster0.mongodb.net/  (Atlas)
}
```

### Models

Mongoose models are registered at startup:

| Model | Schema Source | Collection |
|---|---|---|
| `Events` | `eventsSchema` | `events` |
| `Participants` | `participantsSchema` | `participants` |
| `Users` | `usersSchema` | `users` |
| `Roles` | `rolesSchema` | `roles` |
| `RoleAssignments` | `roleAssignmentsSchema` | `roleassignments` |
| `EventRequests` | `eventRequestsSchema` | `eventrequests` |
| `EventReviews` | `eventReviewsSchema` | `eventreviews` |

The schemas live in a **separate GitHub repository** (`UW-IUGA/iuga-web-schemas`) mounted as a submodule at `backend/schemas/`. If the submodule is not initialized, the backend will fail to start.

### Schema details (from submodule)

Based on controller usage, the schemas include these fields:

**Events**: `eId`, `eName`, `eStartDate`, `eEndDate`, `eLocation`, `eOrganizers`, `eDescription`, `eLabels`, `ePics`, `eParticipants` (ref → Participants), `eThumbnailPath`, `eRsvpEnabled`, `rsvpQuestions`, `eAltLink`, `eShowParticipants`

**Participants**: `pUID` (ref → Users), `eID` (ref → Events), `rsvpAnswers` (array of `{ qId, aString }`), `isAnon`

**Users**: `uFirstName`, `uLastName`, `uDisplayName`, `uEmail`, `uNetId`, `uType` (e.g., "Admin")

**Roles**: `roleName`, `roleKey`, `roleDescription`, `permissions`, `isActive`, `createdBy`, `updatedBy`

**RoleAssignments**: `userId`, `roleId`, optional `committeeId`, optional `reportsToUserId`, `assignedBy`, `assignedAt`, optional `expiresAt`, `deactivatedBy`, `deactivatedAt`, `isActive`

**EventRequests**: session-derived requester/organizer, requesting group, event details, lifecycle status, ordered checkpoints, finance and booking data, selected slide template, external review link/receipt, published event link, and actor/timestamp audit fields.

**EventReviews**: request id, session-derived reviewer, enforced `organizer` or `member` role, review responses, attendee count, and integer-cent total spend.

---

## Middleware Stack (in order)

1. `cors()` — allows only configured browser origins and credentials
2. Security-header middleware — adds `nosniff`, `DENY`, and strict referrer policy
3. `morgan('dev')` — HTTP request logging
4. `express.json()` and `express.urlencoded()` — parse bodies up to 32 KB
5. `cookie-parser` — parses incoming cookies
6. `express.static("../frontend/build")` — serves built frontend assets
7. `express-session` — creates explicit, environment-aware session cookies
8. CSRF middleware — rejects authenticated mutations without a trusted `Origin`
9. Model middleware — attaches `req.models` to each request
10. SPA route handlers — serve `index.html` for browser routes
11. `/uploads` static delivery — serves public uploaded files
12. `/api/v1` rate limiter and router — limits API traffic before dispatch
13. `httpErrorHandler` — converts parser, CORS, and unexpected failures to safe JSON

ETags are disabled with `app.disable('etag')`, so responses do not use conditional-cache headers.

---

## Key Backend Dependencies

| Package | Purpose |
|---|---|
| `express` | HTTP framework |
| `mongoose` | MongoDB ODM |
| `express-session` | Server-side sessions |
| `morgan` | HTTP request logging |
| `cors` | Cross-origin resource sharing |
| `cookie-parser` | Cookie parsing |
| `dotenv-cli` | Load environment files |
| Native `fetch` | HTTP requests to Microsoft Graph API |

---

## Related Documents

- [Architecture Overview](ARCHITECTURE.md) — System components and data flow
- [Commenting Guide](COMMENTING.md) — House style for code comments
- [Development Guide](DEVELOPMENT.md) — Setup, scripts, code conventions
- [Frontend Documentation](FRONTEND.md) — React app structure, routing, auth flow
- [Deployment Guide](DEPLOYMENT.md) — Environments, CI/CD, Docker
- [Maintainers Guide](MAINTAINERS.md) — Monitoring and maintenance
- [Troubleshooting Guide](TROUBLESHOOTING.md) — Common failures and diagnosis
