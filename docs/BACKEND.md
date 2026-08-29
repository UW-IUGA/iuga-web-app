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

```
backend/
├── bin/
│   └── www.cjs              ← Server entry point (CommonJS)
├── app.js                   ← Express app config
├── models.js                ← Database connection + model registration
├── schemas/                 ← Git submodule → UW-IUGA/iuga-web-schemas
├── routes/
│   └── api/v1/
│       ├── apiv1.js         ← API router (mounts controller modules)
│       ├── controllers/
│       │   ├── user.js           ← Login, logout, user info
│       │   ├── events.js         ← Event CRUD, RSVP
│       │   ├── feedback.js       ← Feedback form CRUD
│       │   ├── roles.js           ← Role catalog and role-assignment API
│       │   ├── eventRequests.js   ← Event request workflow and operations API
│       │   ├── utils/eventWorkflow.js ← Canonical request states, transitions, and audit helper
│       │   ├── cycles.js          ← Academic-year cycle setup and closure
│       │   ├── charter.js         ← Charter and guideline content
│       │   ├── journal.js         ← Advocacy journal entries
│       │   ├── contacts.js        ← Board contact directory
│       │   └── administration.js ← Officer/committee stubs (not currently mounted — see Administration section)
│       └── utils/
│           └── auth.js          ← requireAuth / requireAdmin / requirePermission middleware
├── env/
│   ├── .env.example          ← Template for environment files
│   └── (actual .env.* files are gitignored)
└── package.json             ← ES module ("type": "module")
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
| `GET /admin/*` | Admin SPA shell for the board workspace |

Each handler reads `../frontend/build/index.html` and sends it. If the build directory is missing, these routes return 500.

Express also serves:
- Static files from `../frontend/build/` (line: `app.use(express.static("../frontend/build"))`)
- Uploaded files from `public/uploads/` via `GET /uploads`

---

## API Routes

All API routes are mounted under `/api/v1`. They return JSON.

### Events (`/api/v1/events`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | No | All events for the calendar. Populates participant info only if authenticated; otherwise `hasRSVPd: false`. |
| `GET` | `/upcoming` | No | Latest 3 events (sorted by start date descending). Used by the homepage. |
| `GET` | `/id/:eId` | No | Single event details. Includes RSVP questions, participant count, thumbnail. If authenticated, includes user's RSVP answers. |
| `POST` | `/rsvp` | Yes | RSVP to an event. Body: `{ eId, rsvpAnswers }`. Validates: event exists, RSVP enabled, event hasn't started, user not already RSVPed. |
| `DELETE` | `/withdraw/:eId/:pId` | Yes | Withdraw from an event. |
| `GET` | `/:pId` | No | Get participant info by participant ID. |

### User (`/api/v1/user`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/login` | No* | Exchange MS access token for a server session. Validates token via Microsoft Graph API. Creates user in MongoDB if new. |
| `POST` | `/logout` | Yes | Destroy server session. |
| `GET` | `/` | Yes | Return current session user info (firstName, lastName, displayName, email, memberType). |
| `GET` | `/:uId` | Yes | Get user by ID (stub — controller has empty branches for owner/admin/outsider views). |
| `POST` | `/:uId` | Yes | Update user by ID (stub — branches for self-edit and admin-edit, no implementation). |

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
| `POST` | `/users/:id/assignments` | Assign an active role to a user for an academic year. Body: `{ roleId, cycleId, committeeId?, reportsToUserId?, expiresAt? }` |
| `DELETE` | `/users/:id/assignments/:assignmentId` | Deactivate an assignment without deleting its history |

`roleName` is the display name. `roleKey` is the stable internal identifier, such as `finance_director`. The API validates role keys, field lengths, booleans, and recognized permissions. It returns only deliberate user identity fields during search.

Assignment creation validates the target user, role, academic cycle, optional committee, optional reporting user, expiration date, duplicate active user/role/cycle assignments, inactive/closed records, and self-reporting. Assignment creation records `assignedBy` from the authenticated session. Deactivation records `deactivatedBy` and `deactivatedAt` while preserving the assignment record.

### Academic cycles (`/api/v1/cycles`)

Academic-year cycles are explicit date ranges with a half-open active interval: a cycle is active at or after `startsAt` and before `endsAt`. Role assignments reference `cycleId`; assignments remain stored after a cycle closes but no longer contribute permissions outside the active cycle.

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List academic cycles. Requires `users.cycles.manage`. |
| `POST` | `/` | Create a cycle with `cycleKey`, `cycleName`, `startsAt`, `endsAt`, and optional integer `budgetTotalCents`. Requires `users.cycles.manage`. |
| `GET` | `/:id/ledger` | Read immutable funding commitments for a cycle. Requires `events.finance.manage`. |
| `PATCH` | `/:id/close` | Close a cycle while retaining its history. Requires `cycles.archive`. |

The permission middleware resolves the active cycle from the current timestamp and filters role assignments by that cycle, active assignment state, active role state, and assignment expiration. If no active academic year exists, permission-protected admin requests receive `403`.

### Institutional memory (`/api/v1/charter`, `/api/v1/journal`, `/api/v1/contacts`)

These routes are available only through named permissions and keep board reference material separate from public pages. Charter readers can list sections or deep-link to one section; charter managers can edit content, with each prior version retained in revision history. Journal entries derive `authorId` and the active academic `cycleId` from the session; only the author can edit an entry. Contacts are searchable by name, organization, and notes, and contact creation derives the relationship owner from the session.

| Method | Path | Permission | Description |
|---|---|---|---|
| `GET` | `/charter` or `/charter/:sectionKey` | `charter.read` | Read charter/guideline sections. |
| `PATCH` | `/charter/:sectionKey` | `charter.manage` | Update a section and append its previous content to revision history. |
| `GET` | `/journal` | `journal.read` | Filter advocacy entries by author, tag, and date range. |
| `POST` | `/journal` | `journal.create` | Create an anonymized advocacy entry for the signed-in author. |
| `PATCH` | `/journal/:id` | `journal.edit_own` | Edit only the signed-in author's entry. |
| `GET` | `/contacts` | `contacts.read` | Search the private contact directory and show linked event history. |
| `POST` | `/contacts` | `contacts.manage` | Create a contact owned by the signed-in user. |
| `PATCH` | `/contacts/:id` | `contacts.manage` | Update contact details. |

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
Canonical event requests use `DRAFT → PVP_REVIEW → AGENDA → FINANCE_REVIEW → MARKETING_QUEUED → SCHEDULED → AWAITING_REVIEW → REVIEWED → ARCHIVED`, with `REJECTED` terminal. Legacy lowercase statuses remain readable during migration, but new spec-form requests use the canonical states. P/VP advance, return, and reject actions require the leadership permission; agenda outcomes require a discussion note; finance decisions write a cycle ledger entry; PR completion moves an approved request to `SCHEDULED`; and publication is a separate `events.publication.manage` action.

| Method | Path | Permission | Description |
|---|---|---|---|
| `POST` | `/:id/advance` | `events.leadership.approve` | Advance a P/VP-reviewed request to the next agenda. |
| `POST` | `/:id/return` | `events.leadership.approve` | Return a request to draft with a required revision comment. |
| `POST` | `/:id/reject` | `events.leadership.approve` | Reject a request with a required comment. |
| `POST` | `/:id/agenda-outcome` | `events.meeting.manage` | Record proceed, table, or decline plus discussion note. |
| `POST` | `/:id/finance` | `events.finance.manage` | Approve requested/partial funding or deny against the academic-year budget. |
| `POST` | `/:id/marketing-complete` | `events.marketing.manage` | Complete the PR handoff after funding approval. |
| `POST` | `/:id/publish` | `events.publication.manage` | Explicitly publish a scheduled event to the public Events collection. |
| `GET` | `/:id/audit` | `events.requests.view` | Read the append-only decision history. |

The reporting routes `/api/v1/exports/event-requests.csv`, `/api/v1/exports/reviews.csv`, and `/api/v1/exports/budget-ledger.csv` require `exports.manage` and return server-generated CSV files. `/api/v1/dashboard` requires `dashboard.read` and returns role-scoped queues, the user's requests, stalled requests, and the active budget when relevant. `/api/v1/notifications` and `/api/v1/notifications/preferences` provide in-app notifications and channel/frequency preferences.

Money is displayed as dollars and cents in the UI, then converted to integer cents before the API call. For example, `$125.50` becomes `{ "fundingRequestedCents": 12550 }`; the backend never stores floating-point currency.

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
- `requirePermission("users.roles.manage")` — requires an active role assignment granting the permission

The permission middleware loads active role assignments for the session user and checks the populated role permissions before calling `next()`.

| Middleware | Blocks when | Returns |
|---|---|---|
| `requireAuth` | No session (`req.session.isAuthenticated` falsy) | `401` not authenticated |
| `requireAdmin` | No session, or logged in but not an officer (`req.session.isAdmin` falsy) | `401` not authenticated / `403` not authorized |

Attach them in the route chain, e.g. `router.post("/", requireAuth, handler)` or `router.post("/:id/approve", requireAdmin, handler)`. They run before the route handler; `next()` passes the request through.

### Session destruction

`POST /api/v1/user/logout` destroys the session and responds with `{ status: "success" }`.

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

1. `cors()` — enabled only when `DEPLOY` environment variable is not set (dev)
2. `morgan('dev')` — HTTP request logging
3. `express.json()` — JSON body parsing
4. `express.urlencoded({ extended: false })` — URL-encoded body parsing
5. `cookie-parser` — Cookie parsing
6. `express.static("../frontend/build")` — Static file serving
7. `express-session` — Server-side session management
8. Custom middleware — attaches `req.models` (Mongoose models) to each request
9. SPA route handlers — serve `index.html` for browser routes
10. `app.use('/api/v1', apiv1Router)` — API route mount

Note: ETag is **disabled** (`app.disable('etag')`) to ensure clients always get the latest version.

---

## Key Backend Dependencies

| Package | Purpose |
|---|---|
| `express` | HTTP framework |
| `mongoose` | MongoDB ODM |
| `express-session` | Server-side sessions |
| `morgan` | HTTP request logging |
| `cors` | Cross-origin resource sharing (dev only) |
| `cookie-parser` | Cookie parsing |
| `dotenv-cli` | Load environment files |
| `node-fetch` | HTTP requests to Microsoft Graph API |

---

## Related Documents

- [Architecture Overview](ARCHITECTURE.md) — System components and data flow
- [Commenting Guide](COMMENTING.md) — House style for code comments
- [Development Guide](DEVELOPMENT.md) — Setup, scripts, code conventions
- [Frontend Documentation](FRONTEND.md) — React app structure, routing, auth flow
- [Deployment Guide](DEPLOYMENT.md) — Environments, CI/CD, Docker
- [Maintainers Guide](MAINTAINERS.md) — Monitoring and maintenance
- [Troubleshooting Guide](TROUBLESHOOTING.md) — Common failures and diagnosis
