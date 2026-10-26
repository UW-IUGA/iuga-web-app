> **See also:** [Architecture overview](ARCHITECTURE.md) · [Development guide](DEVELOPMENT.md) · [Frontend docs](FRONTEND.md) · [Troubleshooting](TROUBLESHOOTING.md)

> This document describes the backend structure and API. For the frontend, see [FRONTEND.md](./FRONTEND.md).

---

# IUGA Website — Backend

**Tech stack:** Express.js 4, Mongoose 6, MongoDB, express-session, Microsoft MSAL

---

## Entry Points

| File | Role |
|---|---|
| `bin/www.cjs` | HTTP server bootstrap — imports `app.js`; local `start`/`debug` scripts use `PORT` as a preference and select the next port on collision, while deployment keeps an explicit `PORT` fixed |
| `app.js` | Express application setup — middleware stack, static serving, API mount |
| `models.js` | MongoDB connection + Mongoose model registration |

---

## Directory Layout

backend/
├── bin/
│   └── www.cjs              ← Server entry point (CommonJS)
├── app.js                   ← Express app config and middleware order
├── http/
│   ├── boundary.js          ← Shared body-size and browser-origin policy
│   ├── errors.js            ← Safe JSON responses for parser/server errors
│   ├── session.js           ← Session signing secret and cookie policy
│   └── spaRoutes.js         ← SPA shell routes served from the compiled frontend
├── models.js                ← Database connection + model registration
├── committeeRecruitment.js  ← Local recruitment campaign schema and Creative seed
├── publishedEvents.js       ← Events inserted at startup, with poster, categories, and RSVP link
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
│       │   ├── recruitment.js     ← Public committee recruitment campaign status
│       │   ├── shop.js            ← Merch catalog browsing and checkout
│       │   └── administration.js ← Unmounted officer/committee stubs
│       └── utils/
│           ├── auth.js        ← Authentication and permission middleware
│           ├── csrf.js        ← Origin checks for session mutations
│           ├── rateLimit.js   ← Process-local request limits
│           ├── shopCatalog.js ← Merch catalog source of truth and validation
│           └── stripeClient.js ← Stripe client factory with fail-closed key validation
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
| `GET /admin`, `/admin/shop/orders`, `/admin/shop/pickup` | Officer admin pages. Keep in step with `ADMIN_SECTIONS` in `frontend/src/adminSections.js`. |

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
| `GET` | `/upcoming` | No | Nearest 3 future events (ascending start time). Used by the homepage. |
| `GET` | `/id/:eId` | No | Single event details. Includes RSVP questions, participant count, thumbnail, and the caller's RSVP answers when authenticated. |
| `POST` | `/rsvp` | Yes | RSVP to an event. Requires a valid event ID and an array of string answers; also checks event state and duplicate participation. |
| `DELETE` | `/withdraw/:eId/:pId` | Yes | Withdraw only the caller's participant from the matching event. Admins may withdraw any participant. |
| `GET` | `/:pId` | Yes | Return protected participant details only to the participant owner or an admin. |

#### Publishing an event

Events normally become public when leadership approves an event request (see
Event administration). That path cannot set a poster, categories, or an
outside RSVP link, so events that need them are listed in
`backend/publishedEvents.js`. At startup the server inserts each listed event
whose `_id` is not in the database yet, using `$setOnInsert`, the same way the
Creative recruitment record is seeded. It never updates an existing record, so
edits and RSVPs made after publishing are kept.

To publish an event:

1. Convert the poster to WebP and put it in `frontend/public/assets/events/`,
   named in lowercase words joined by hyphens:
   `cwebp -q 86 -resize 900 0 poster.png -o frontend/public/assets/events/<name>.webp`.
   The image ships with the frontend; the database stores only its path.
2. Add an entry to `publishedEvents` with a new `_id`
   (`node -e 'console.log(new (require("mongoose").Types.ObjectId)().toString())'`
   from `backend/`), the event's name, host, start and end, location,
   description, `eLabels`, and `eThumbnailPath: "/assets/events/<name>.webp"`.
   Write times with their UTC offset, for example `2026-10-26T17:30:00-07:00`.
3. Choose how students sign up. Set `eRsvpEnabled: true` with `rsvpQuestions`
   to use the site's RSVP, or `eRsvpEnabled: false` with `eAltLink` (`title`
   and `url`) to send them to an outside form. Use `eRsvpEnabled: false`
   alone when no sign-up exists.
4. Run `npm test --prefix backend`; `test/publishedEvents.test.js` checks each
   entry against the Events schema and these rules.

Take every detail from the event's announcement. Name the real host in
`eOrganizers`, use the public category names (Academic, Social, Professional),
leave out emojis, and omit a field rather than guessing it.

The event goes live when the change is deployed. To change an event that is
already live, edit its record in the database; editing its entry here has no
effect once it has been inserted. Removing an entry does not delete the
record.

### User (`/api/v1/user`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/login` | No* | Exchange MS access token for a server session. Validates token via Microsoft Graph API. Creates user in MongoDB if new. |
| `POST` | `/logout` | Yes | Destroy server session. |
| `GET` | `/` | Yes | Return current session user info (firstName, lastName, displayName, email, memberType). |
| `GET` | `/:userId` | Yes | Validate a user ID before entering the current owner/admin view stub. |
| `POST` | `/:userId` | Yes | Validate a user ID before entering the current self/admin update stub. |

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

### Recruitment (`/api/v1/recruitment`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/creative` | No | Report whether the Creative Committee application is open. Returns `{ application: { isOpen: true, formUrl, closesAt } }` while an open campaign exists, otherwise `{ application: { isOpen: false } }`. Responses set `Cache-Control: no-store`. |

The campaign comes from the locally defined `CommitteeRecruitment` model (not the shared schemas submodule). Startup seeds one Creative record with `$setOnInsert`, so later database edits persist. The server decides openness (`closesAt > now`); the client falls back to the contact dialog on any error.

### Shop (`/api/v1/shop`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/catalog` | No | Public catalog: `catalogId`, `catalogVersion`, currency, sale window, and each item's sku, name, allowed sizes, `unitPriceCents`, and `perStudentLimit`. |
| `POST` | `/checkout` | Yes | Returns 503 for a valid cart while online checkout is not exposed in production. When `stripeCheckoutExposed` is enabled, creates a Stripe Checkout Session for the authenticated cart and returns its hosted URL. |
| `GET` | `/checkout/:sessionId` | Yes | Confirm a returning Checkout Session belongs to the signed-in buyer and reports paid by Stripe before the browser removes purchased items from its cart. |
| `GET` | `/status` | No | Whether new checkouts are paused, and an announced maintenance time: `{ shop: { checkoutPaused, maintenanceAt } }`. `maintenanceAt` is `null` when none is planned or once it has passed. Where checkout is not exposed it always answers not paused. The site uses it to warn students who have items in their cart. |
| `POST` | `/holds` | Yes | Holds the whole cart for the hold duration (15 minutes unless `SHOP_HOLD_MINUTES` is set), or none of it. Returns 503 unless `manualCheckoutExposed` is true. Reserves stock (24 per product per drop) and the student's per-product limit in one transaction. Stock is counted per drop (`catalogId`), not per `catalogVersion`, so editing the catalog during a drop keeps the count. Returns 503 with a "paused" message while an officer has paused new checkouts (see below). A student has one active hold: a new hold cancels their earlier active hold in the same transaction, and a refused hold leaves the earlier one active. |
| `GET` | `/holds/:holdId` | Yes | Returns the student's own hold. Expires it first if its deadline has passed. Also returns `savedVenmoUsername`: the username saved by the student's earlier purchase, or `null`. |
| `DELETE` | `/holds/:holdId` | Yes | Cancels an active hold and releases its units. |
| `PATCH` | `/holds/:holdId/lines` | Yes | Removes one line (`{ sku, size }`) and releases its units. The deadline does not change. Removing the last line cancels the hold. |
| `POST` | `/holds/:holdId/confirm` | Yes | Confirms an active hold before its deadline with `{ venmoUsername, phoneNumber }`. The phone number may be US or international: 7 to 15 digits with an optional leading `+` for a country code; spaces, dashes, periods, and parentheses are removed. Creates a pending purchase with an item and price snapshot, and saves the Venmo username and phone number to the profile (`uVenmoUsername`, `uPhoneNumber`). The Venmo username is lowercased. A student who already has a saved Venmo username must confirm with the same one: a different one returns 409 and leaves the hold active, and only an officer can change the saved username in the database. |
| `GET` | `/purchases` | `shop.purchases.review` | Officer order list, oldest first, 25 per page (up to 50). Query: `status` (`pending` by default, `paid`, `not_paid`, `refunded`, or `all`), `balance` (`all`, or `short` for Pending and Not paid orders with an amount received below the total), `followUp` (`all`, `awaiting`, or `none`), `pickup` (`all`, `ready` for orders not marked picked up, or `picked_up`), `q` (search, up to 120 characters), `limit`, `cursor`. Returns `{ purchases, nextCursor }`. |
| `GET` | `/purchases/counts` | `shop.purchases.review` | Counts by status, Paid orders split into `ready` and `picked_up` by the pickup mark, `says_paid` (open follow-ups where the student says they already paid), totals for pending orders (expected, received, and owed amounts), and `confirmedCents`, the money received on Paid orders (a Paid order with no amount recorded counts its total; refunded orders are left out). |
| `GET` | `/purchases/:purchaseId` | `shop.purchases.review` | One order. Adds the buyer's phone number for follow-up; the list omits it. |
| `PATCH` | `/purchases/:purchaseId/payment` | `shop.purchases.review` | Body `{ status, note?, expectedRevision }`. Any status can change to any other. Moving between Pending or Paid and Not paid or Refunded returns or retakes stock. `note` is an optional reason (up to 500 characters) saved on the history entry. A picked-up order moved to any status but Paid needs a `note`; without one the request gets 409 and nothing changes. Such a change keeps the pickup mark, marks its history entry `afterPickup: true`, and writes one server log line, `Shop purchase changed after pickup: purchase <id>, <from> → <to>`, with no buyer details. |
| `PATCH` | `/purchases/:purchaseId/amount-received` | `shop.purchases.review` | Body `{ amountReceivedCents, expectedRevision }`, in whole cents. Only Pending or Not paid orders can change. Reaching the total marks the order Paid. |
| `PATCH` | `/purchases/:purchaseId/follow-up` | `shop.purchases.review` | Body `{ followUpStatus, note?, expectedRevision }`. `followUpStatus` is `contacted`, `will_pay`, `says_paid`, or `none` to clear. `note` is up to 500 characters. |
| `GET` | `/purchases/pickup` | `shop.purchases.review` | Every order ready for pickup (Paid, not picked up), oldest first, with buyer names for the Husky Card check, Venmo name, items with sizes, and revision. Capped at 1000 orders: `truncated` says when some are left out, and `counts: { ready, pickedUp }` still counts all of them. The page sorts the list itself. Registered before `/purchases/:purchaseId`. |
| `PATCH` | `/purchases/:purchaseId/pickup` | `shop.purchases.review` | Body `{ pickedUp, expectedRevision }`: `true` marks a Paid order handed over at pickup (sets `pickedUpAt` and `pickedUpBy`), `false` clears the mark. Only Paid orders can be marked picked up; the order's payment, amount, follow-up, and stock never change. Each order also reports `pickup: { pickedUpAt, pickedUpBy }`, where `pickedUpBy` is the officer's name. |
| `POST` | `/purchases/:purchaseId/notes` | `shop.purchases.review` | Body `{ title, note?, expectedRevision }`: an officer's activity entry. `title` is 1 to 80 characters; `note` is up to 500. |

**Order review:** these routes are mounted whether or not checkout is exposed, so accepted orders stay reviewable when new checkouts are paused or off. Every request checks the permission (401 when signed out, 403 without it). Each write sends `expectedRevision`, the order's `revision` from the last read. A different current revision returns 409 and changes nothing. `/payment` and `/amount-received` run in transactions and need a replica set; `/follow-up`, `/notes`, and `/pickup` do not. Errors: 400 for invalid input or an out-of-date cursor; 404 for an unknown order (a malformed id too); 409 for a stale revision or a refused change (an amount received on a Paid or Refunded order, a picked-up order changed without a reason, or no room to retake stock or the per-student limit); 500 for inconsistent stock counters (nothing changes) or a database failure. Responses are `Cache-Control: private, no-store`.

**Cart consolidation:** a cart is a list of entries, each naming a product (`sku`), a `size`, and a `quantity`. When the same `sku` and `size` appears more than once, the backend merges those entries into one and adds their quantities — two "hoodie / size M" entries become a single line with quantity 2. Adding the same product and size again therefore raises the quantity rather than creating a duplicate. This is what the backend calls a cart **line**: one product and size carrying a combined quantity.

**Per-student limits:** the most units of one product a student may hold or buy, counted across sizes. The default for every product is one document in the `shoplimitdefaults` collection (`key: "default"`, `perStudentLimit`). A product can have its own document in `shopproductlimits` (`sku`, `perStudentLimit`) that replaces the default for that product. If the default document is missing, the code default of 5 (`DEFAULT_PER_STUDENT_LIMIT`) applies. Changing a limit needs no deploy. For example, to set the default to 5 and Hoodie to 2, run in `mongosh` against your database: `db.shoplimitdefaults.updateOne({ key: "default" }, { $set: { perStudentLimit: 5 } }, { upsert: true })` and `db.shopproductlimits.updateOne({ sku: "info-hoodie" }, { $set: { perStudentLimit: 2 } }, { upsert: true })`. Limits are read through an in-memory cache that holds them for 60 seconds (`SHOP_LIMIT_CACHE_SECONDS`), so a database change reaches holds and the catalog within a minute. A change made through the app clears the cache at once. A browser's cached catalog catches up within 5 minutes. The catalog returns each limit, the bag blocks checkout over it, and holds enforce it on the server.

**Pausing new checkouts:** an officer can stop new holds without a deploy by setting `newCheckoutsPaused: true` on the `shopsettings` document with `key: "shop"`. It is read on every `POST /holds`, so it applies at once. Only new holds are refused; a student who already has a hold can still view, change, cancel, or confirm it. A missing document means not paused. `docs/MAINTAINERS.md` has the commands.

**Announcing maintenance:** setting `maintenanceAt` on the same document gives students a countdown instead of an abrupt stop. Until that time checkout works as usual, and a hold started in the meantime ends at `maintenanceAt` instead of running its full length, so nobody is still paying when the update starts. From that time on new holds are refused, the same as a pause, until an officer clears it.

Required environment variables for Shop checkout:

- `STRIPE_SECRET_KEY` — Stripe secret API key (`sk_test_...` in development). When unconfigured, `/checkout` fails closed with 503.
- `SHOP_RETURN_BASE_URL` — Return base URL for redirecting buyers after completion or cancellation (e.g. `http://localhost:3000`, no trailing slash). When unconfigured, `/checkout` fails closed with 503.
- `SHOP_MANUAL_CHECKOUT_EXPOSED` — Optional. `true` opens the manual Venmo checkout (`/holds` routes). Off by default. Keep it off in production until the production database is a replica set and its replica-set tests pass.
- `SHOP_LIMIT_CACHE_SECONDS` — Optional. How long per-student limits stay in memory before the database is read again. Defaults to 60. `0` turns the cache off; the smoke test sets it so limit changes apply at once.
- `SHOP_HOLD_MINUTES` — Optional. How long a checkout hold lasts, in minutes. Defaults to 15. A testing environment can set a shorter value such as `1`; production keeps the default. Must be a positive number, or the backend fails at startup.

Online checkout is not exposed in production: `POST /checkout` returns 503 for a valid cart unless `createShopRouter()` receives `stripeCheckoutExposed: true`, and production wiring does not set it. The Stripe path is kept in the repository. Checkout returns a session ID alongside the hosted URL. The success redirect includes that ID; the frontend keeps a per-session cart snapshot and only removes purchased lines after `/checkout/:sessionId` confirms payment. A canceled or unconfirmed return keeps the cart. Stripe does not automatically email payment receipts for sandbox purchases. Live-mode email receipts depend on Stripe's customer-email settings and an email address collected at checkout.

Manual Venmo checkout uses the `/holds` routes. Signed-out requests get 401 first. Other requests get 503 unless `createShopRouter()` receives `manualCheckoutExposed: true`, which `apiv1.js` sets from `SHOP_MANUAL_CHECKOUT_EXPOSED=true`. Holds use transactions, which need a replica set. Local `npm start` starts a replica-set container when the flag is true (see `docs/DEVELOPMENT.md`). Deployments set the flag from `shopManualCheckout` in each Jenkinsfile's `cfg` (see `docs/DEPLOYMENT.md`): on for dev, off for staging and production until their MongoDB is a replica set.

Each hold creation first writes the student's `ShopStudentCheckouts` document inside the transaction. This serializes concurrent checkouts even with disjoint products: the later committed hold replaces the earlier active hold. A refused replacement rolls back, leaving the earlier hold and its units intact.

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
   - Stores `userId` and `memberType` in session (`memberType` is a label; it grants no access)
4. Responds with the user document

### Session check and permissions

`utils/auth.js` decides who may use protected endpoints. Signing in proves who a
user is; everything beyond that is a named **permission**. A user holds a
permission only through an active, unexpired role assignment to an active role
that lists it. The account type (`uType`) grants nothing. Permissions are read
from the database on every check, so granting or removing a role takes effect
on the user's next request without signing in again.

- `requireAuth` — requires a logged-in session.
- `requirePermission(name)` — requires the permission. Building it with a name
  that is not in the permission list throws when routes load, so a typo fails
  loudly instead of refusing everyone.
- `isOwnerOrPermitted(req, ownerId, name)` — for records a student owns: the
  owner, or a user with the permission.
- `permissionsOf(req)` — the session user's permissions; `GET /api/v1/user/permissions`
  returns them so the frontend can offer the matching officer tools.

| Middleware | Blocks when | Returns |
|---|---|---|
| `requireAuth` | No session (`req.session.isAuthenticated` falsy) | `401` not authenticated |
| `requirePermission(name)` | No session, or no active role granting `name`; role lookup failure | `401` / `403` not authorized / `500` |

Attach them in the route chain, e.g. `router.post("/", requireAuth, handler)` or
`router.post("/:id/approve", requirePermission("events.leadership.approve"), handler)`.

| Permission | Allows |
|---|---|
| `users.roles.manage` | Creating roles and assigning them through `/api/v1/roles` |
| `events.requests.manage` | The event request workspace: submitting, listing, editing, booking, reviews, completion |
| `events.leadership.approve` | Approving, denying, or requesting changes to event requests |
| `events.finance.manage` | Event budgets and the finance checkpoint |
| `events.purchases.complete` | The event purchases checkpoint |
| `events.participants.manage` | Viewing or withdrawing another student's RSVP |
| `feedback.manage` | Deleting feedback |
| `shop.purchases.review` | The shop Orders dashboard and its order changes |

To add a permission, add it to the list in `utils/auth.js` and protect its
routes with `requirePermission`. The roles API accepts only names on that list.

### Session destruction

`POST /api/v1/user/logout` destroys the session. A successful response is `{ status: "success" }`; a session-store failure returns the generic 500 error envelope.

### HTTP security boundaries

The application applies these checks before API handlers:

- The session signing secret is supplied at startup from the deployment-matching variable (`SESSION_SECRET_DEV`, `SESSION_SECRET_STAGING`, or `SESSION_SECRET_PROD`, chosen by `DEPLOY_ENV`); there is no source-controlled fallback.
- Session cookies are `httpOnly`, use `SameSite=Lax`, and are `secure` in staging and production.
- Authenticated `POST`, `PUT`, `PATCH`, and `DELETE` requests must include an allowed browser `Origin`. Login is exempt because it uses a Microsoft Bearer token instead of a session cookie.
- CORS and CSRF allow HTTP origins on the exact `localhost` hostname for local development (including dynamically selected Vite ports), plus the documented IUGA domains. Other hosts and protocols remain rejected.
- CORS middleware runs before `GET /readyz`, so the local frontend can read the readiness response while setting up sign-in.
- JSON and URL-encoded bodies are limited to 32 KB. API traffic is limited per 15 minutes to 300 requests for each signed-in student and 600 for each network address without a sign-in (students on campus Wi-Fi share addresses), and login is limited to 10 requests per minute per client address.
- Malformed JSON, oversized bodies, CORS failures, and unexpected server failures return the repository JSON error envelope rather than HTML or stack traces.

Production dependency audits currently pass for the backend. The frontend audit still reports two moderate React Router advisories:

- `GHSA-wrjc-x8rr-h8h6` — open redirect through backslash handling.
- `GHSA-337j-9hxr-rhxg` — constructor injection in SSR hydration error deserialization.

The current frontend uses React Router 6 with `BrowserRouter` and does not use SSR hydration. Existing navigation targets are internal paths, so no affected external redirect flow is currently documented; future route-input changes must preserve that property. The available fix requires a breaking React Router 7 upgrade. **Owner:** frontend maintainer, in a separate migration.

---

## Database

### Local MongoDB helper

Local backend `npm start` and `npm run debug` automatically start or reuse an isolated `mongo:7` container. Run `npm run docker --prefix backend` to start just the database.
Docker selects an available host port and publishes it only on IPv4 loopback;
the database itself listens on port `27017` inside each container. A hash of the
checkout's absolute path determines its stable `iuga-mongo-<hash>` name. Different
worktrees have separate databases; restarting a checkout preserves its data, and
new databases start empty. Moving a checkout changes its database identity; old
containers are retained. The helper does not stop Homebrew MongoDB, replace
containers, or remove data volumes. Use Docker Engine 28 or newer: older releases
can expose localhost-published ports to other hosts on the same network segment.

After MongoDB is ready, the helper prints its selected connection URI. Local
startup passes this URI to the backend automatically, ignoring `DB_URI` in both
the environment file and the shell so inherited settings cannot cause worktrees
to share a database. It does not edit `.env.dev` or redirect other running
backends. Deployment continues to use its configured URI without Docker startup.
The helper rejects port bindings that are not IPv4 loopback-only.

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
| `Committees` | `committeesSchema` | `committees` |
| `CommitteeRecruitment` | `committeeRecruitmentSchema` (local) | `committeerecruitments` |
| `ShopPurchases` | `shopPurchasesSchema` | `shoppurchases` |

The schemas live in a **separate GitHub repository** (`UW-IUGA/iuga-web-schemas`) mounted as a submodule at `backend/schemas/`. If the submodule is not initialized, the backend will fail to start. `CommitteeRecruitment` is the exception: its schema lives in `backend/committeeRecruitment.js` so the campaign model stays out of the shared submodule.

### Schema details (from submodule)

Based on controller usage, the schemas include these fields:

**Events**: `eId`, `eName`, `eStartDate`, `eEndDate`, `eLocation`, `eOrganizers`, `eDescription`, `eLabels`, `ePics`, `eParticipants` (ref → Participants), `eThumbnailPath`, `eRsvpEnabled`, `rsvpQuestions`, `eAltLink`, `eShowParticipants`

**Participants**: `pUID` (ref → Users), `eID` (ref → Events), `rsvpAnswers` (array of `{ qId, aString }`), `isAnon`

**Users**: `uFirstName`, `uLastName`, `uDisplayName`, `uEmail`, `uNetId`, `uType` (a label such as "Member"; grants no access)

**Roles**: `roleName`, `roleKey`, `roleDescription`, `permissions`, `isActive`, `createdBy`, `updatedBy`

**RoleAssignments**: `userId`, `roleId`, optional `committeeId`, optional `reportsToUserId`, `assignedBy`, `assignedAt`, optional `expiresAt`, `deactivatedBy`, `deactivatedAt`, `isActive`

**Committees**: `cmeName`, `cmeDescription`, `cmeYear`, `cmeMembers` (array of objects with `cmeUID` (ref → Users) and `memberPic`)

**CommitteeRecruitment** (local, not the submodule): `committee` (unique), `formUrl`, `closesAt`

**EventRequests**: session-derived requester/organizer, requesting group, event details, lifecycle status, ordered checkpoints, finance and booking data, selected slide template, external review link/receipt, published event link, and actor/timestamp audit fields.

**EventReviews**: request id, session-derived reviewer, enforced `organizer` or `member` role, review responses, attendee count, and integer-cent total spend.

**ShopPurchases**: `holdId`, `userId`, `catalogId`, `catalogVersion`, `venmoUsername`, `lines`, `totalCents`, `status` (`pending`, `paid`, `not_paid`, or `refunded`), `confirmedAt`, and the review fields: `reviewRevision` (starts at 0 and rises with every officer change; writes send it back as `expectedRevision`), `amountReceivedCents` (`null` until an amount is recorded), `followUpStatus` (`contacted`, `will_pay`, `says_paid`, or `null`), `awaitingStudentReply` (true while a follow-up is open), `followUpUpdatedBy`, `followUpUpdatedAt`, and `reviewHistory` (officer entries of kind `payment`, `follow_up`, `amount_received`, or `note`, each with actor, time, `from` and `to`, and an optional `title` and `note`). Purchases saved before review existed have none of these fields and read as revision 0 with no history.

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
| `stripe` | Stripe hosted checkout SDK |
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
