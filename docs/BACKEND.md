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
│       │   ├── feedback.js       ← Feedback form CRUD (not currently mounted — see Feedback section)
│       │   └── administration.js ← Officer/committee stubs (not currently mounted — see Administration section)
│       └── utils/
│           └── auth.js          ← (empty — auth is inline in controllers)
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

### Feedback (`/api/v1/feedback`) — *not currently wired*

⚠️ **These endpoints are defined in `controllers/feedback.js` but are NOT imported by `apiv1.js`. All requests to `/api/v1/feedback/*` currently return 404.**

The controller provides full CRUD (no auth required):

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Get a feedback form by `fID` query parameter |
| `POST` | `/` | Submit a new feedback form. Body: `{ fUID, fType, fTopic, fDescription }` |
| `DELETE` | `/` | Delete a feedback form by `fID` query parameter |

To activate, import and mount `feedbackRouter` in `apiv1.js`.

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

Route handlers check `req.session.isAuthenticated` to determine auth state. There is no dedicated middleware — each controller checks inline.

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

Three Mongoose models are registered at startup:

| Model | Schema Source | Collection |
|---|---|---|
| `Events` | `eventsSchema` | `events` |
| `Participants` | `participantsSchema` | `participants` |
| `Users` | `usersSchema` | `users` |

The schemas live in a **separate GitHub repository** (`UW-IUGA/iuga-web-schemas`) mounted as a submodule at `backend/schemas/`. If the submodule is not initialized, the backend will fail to start.

### Schema details (from submodule)

Based on controller usage, the schemas include these fields:

**Events**: `eId`, `eName`, `eStartDate`, `eEndDate`, `eLocation`, `eOrganizers`, `eDescription`, `eLabels`, `ePics`, `eParticipants` (ref → Participants), `eThumbnailPath`, `eRsvpEnabled`, `rsvpQuestions`, `eAltLink`, `eShowParticipants`

**Participants**: `pUID` (ref → Users), `eID` (ref → Events), `rsvpAnswers` (array of `{ qId, aString }`), `isAnon`

**Users**: `uFirstName`, `uLastName`, `uDisplayName`, `uEmail`, `uType` (e.g., "Admin")

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
| `@sendgrid/mail` | Email sending (installed, usage unconfirmed from source) |
| `node-cache` | In-memory caching |
| `node-cron` | Scheduled tasks |
| `handlebars` | Template engine (installed, not used in current routes) |

---

## Related Documents

- [Architecture Overview](ARCHITECTURE.md) — System components and data flow
- [Development Guide](DEVELOPMENT.md) — Setup, scripts, code conventions
- [Frontend Documentation](FRONTEND.md) — React app structure, routing, auth flow
- [Deployment Guide](DEPLOYMENT.md) — Environments, CI/CD, Docker
- [Maintainers Guide](MAINTAINERS.md) — Monitoring and maintenance
- [Troubleshooting Guide](TROUBLESHOOTING.md) — Common failures and diagnosis
