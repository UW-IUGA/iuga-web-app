# IUGA Website — Frontend

**Tech stack:** React 18, Vite, Vitest, React Router v6, SCSS, Azure MSAL

---

## Entry Points

| File | Role |
|---|---|
| `index.html` | HTML shell — font loading, meta tags, `<div id="root">` |
| `src/index.jsx` | React bootstrap — MSAL provider, auth context, browser router |
| `src/App.jsx` | Layout wrapper — navbar, toast notifications, route definitions |
| `src/authConfig.js` | MSAL client ID, tenant authority, redirect URI |
| `src/adminSections.js` | The officer admin sections, their pages and permissions, and the admin path helpers |

---

## Directory Layout

```
frontend/src/
├── assets/
│   ├── data/          ← Static JS data files (teams, candidates, resources, etc.)
│   ├── mock-data/     ← Mock API responses for development mode
│   ├── gallery/       ← Event gallery images
│   └── icons/         ← SVG icons (career, social, academic)
├── components/        ← Reusable UI components
│   ├── Button.jsx
│   ├── CharacterCard.jsx
│   ├── Dropdown.jsx
│   ├── ElectionFAQCard.jsx
│   ├── EmailContactDialog.jsx ← Mail-provider compose dialog for committee and shop contact
│   ├── EventAgenda.jsx        ← One week of events: day buttons above a list of event rows
│   ├── EventsOverview.jsx     ← The previous /events page, kept unrouted for the homepage (see EVENTS.md)
│   ├── eventsCalendar/        ← The events calendar's views and controls (see EVENTS.md)
│   ├── EventCategoryPills.jsx ← Compact category labels for an event
│   ├── EventDialog.jsx        ← Event details and RSVP in a modal dialog
│   ├── EventThumbnail.jsx     ← An event's photo, or a category tile when it has none
│   ├── GradientLine.jsx
│   ├── PastEventCard.jsx      ← Past event recap with a cover photo and thumbnails
│   ├── PhotoCollage.jsx       ← Up to three overlapping photos
│   ├── PhotoLightbox.jsx      ← Full-size photo viewer for a set of photos
│   ├── ResourceCard.jsx
│   ├── RolePage.jsx
│   ├── AdminBar.jsx           ← Officer admin bar: IUGA Admin brand, a link to each admin page, back to site, sign out
│   ├── ShopMaintenanceBanner.jsx ← Site-wide maintenance countdown for students with items in their cart
│   └── WeekNavigation.jsx     ← Previous/next week control
├── context/
│   └── AuthContext.jsx   ← Authentication state (React Context)
├── hooks/
│   ├── useAuth.jsx       ← MSAL token acquisition + backend handshake
│   ├── useCalendarView.js ← The events calendar's view and date, kept in the URL
│   ├── useEventList.js   ← The events calendar's event list and loading state
│   ├── useSwipeStep.js, useZoomOverlay.js, useMediaQuery.js, useNow.js ← Calendar swipe, year overlay, media query, clock
│   ├── usePopover.js     ← Closes a popover on an outside press or Escape
│   └── useModalDialog.js ← Opens and closes a native <dialog> from an isOpen flag
├── layouts/
│   ├── Navbar.jsx        ← Shared top navigation and temporary mobile menu
│   └── Footer.jsx
├── utils/calendar/       ← Events calendar date maths, grids, popover placement, swipe rules
├── pages/
│   ├── Home.jsx          ← Homepage hero, upcoming events, support destinations, and community links
│   ├── Events.jsx        ← Events calendar: year, month, week, and day views
│   ├── Resources.jsx     ← Resource links list
│   ├── About.jsx         ← Team member cards by year
│   ├── GetInvolved.jsx   ← Committee leaders, committees, and the Creative application status
│   ├── Elections.jsx     ← Candidate profiles for current election
│   └── ElectionsFAQ.jsx  ← FAQ accordion about elections
└── stylesheets/
    ├── main.scss          ← Stylesheet entry point using Sass modules (7-1 architecture)
    ├── abstracts/         ← Variables, mixins, functions, media queries
    ├── vendors/           ← Vendored third-party styles (include-media, toastify)
    ├── base/              ← Reset, typography, colors, shared element rules, misc
    ├── layout/            ← Container, split responsive navigation, footer, form
    ├── components/        ← Component-specific styles
    └── pages/             ← Page-specific styles (e.g., _getInvolved.scss for page and member-card styles)
```

### Stylesheet conventions

The stylesheet stack establishes shared tokens and checks so later changes are
easier to review. The token definitions in
`frontend/src/stylesheets/abstracts/_variables.scss` are the source of truth.

#### Spacing

Use the existing `$space-N` tokens for padding, margin, and gap when their values
match the intended spacing. `N` counts 4px steps, not pixels: `$space-3` is 12px
and `$space-6` is 24px. For example:

```scss
@use "../abstracts" as *;

.exampleCard {
    padding: $space-3 $space-6;
    gap: $space-4;
}
```

These names give components a shared spacing vocabulary. They trade immediately
readable pixel values for reusable, centrally defined values. The scale migration
preserves existing dimensions; it is not a redesign. Off-scale values such as
10px, negative spacing, and values above the current scale remain explicit rather
than being rounded. Not every step has a token; use the definitions that exist.
Keep role-specific tokens such as `$page-margin` when they express layout intent.
Changing a shared token affects every consumer, so review those uses before
changing its value.

#### Modules, breakpoints, and ownership

- Load shared tokens, mixins, and the configured breakpoint helper with
  `@use "../abstracts" as *;` from a component, page, base, or layout partial.
  Use `@use`, not deprecated `@import`. `main.scss` loads the stylesheet modules.
- Write width breakpoints with the `media` mixin, for example
  `@include media("<tablet")` or `@include media("<=900px")`. Named breakpoints
  live in `$breakpoints`; custom widths remain valid when a layout needs them.
  Preserve inclusive (`<=`, `>=`) versus exclusive (`<`, `>`) boundaries.
- Reuse named color and typography tokens when they represent the intended
  role. Distinct roles should not be merged merely because their values match.
- Admin pages intentionally use a separate neutral palette and system font.
  Their shared tokens and focus mixin live in `abstracts/_admin.scss`, loaded
  explicitly by the admin bar, Orders, and Pickup modules rather than inherited
  from another page's import order.
- The events calendar likewise keeps the prototype's darker palette in
  `abstracts/_eventsCalendar.scss`, and scopes every rule inside an
  `.eventsCalendar` root (see [EVENTS.md](./EVENTS.md#styles)).
- Put rules targeting all elements of a kind in `base/_elements.scss`;
  component-specific rules belong with their component.

#### Formatting and linting

Run these commands from `frontend/`:

```sh
npm run format:styles
npm run check:styles
npm run lint:styles
```

Prettier formats SCSS with four-space indentation, a 120-column target, and
double quotes. `format:styles` rewrites files; `check:styles` checks without
rewriting. Stylelint checks stylesheet rules, including use of Sass modules,
the width-breakpoint helper, and avoidance of `!important` and named CSS colors.
Both tools exclude vendored stylesheets. They do not enforce every token choice.

Stylelint reports class naming, descending specificity, and duplicate selectors
as warnings; a successful exit does not mean there are no warnings. Its class
naming convention is camelCase BEM (`block__element--modifier`). Inspect warnings
when changing affected rules rather than renaming unrelated classes.
These scripts are local checks, not a claim that CI runs them. Use the frontend
tests and build as well when changing stylesheet behavior.

### Shared navigation

`layouts/Navbar.jsx` is rendered once by `App.jsx` and uses the same navigation
markup at every breakpoint. Its presentation is split across these partials:

- `_navigation-base.scss` — Campus utility line, shared links, and account menu
- `_navigation-mobile.scss` — hamburger button and dropdown panel below the
  sm-desktop breakpoint
- `_navigation-desktop.scss` — compact laptop link spacing

The header holds the logo on the left and one centered group of page links:
Events, Resources, Student Voice, Shop, About, and Get Involved. The account
control sits to the right of the group. On smaller desktops the link spacing
tightens to keep the navigation on one line; below the sm-desktop breakpoint
the links collapse into a hamburger panel. Only one dropdown is open at a time,
and Escape closes it and the mobile panel. Signed-in students see their name
and a text Sign out action in the account menu,
without an avatar or role badge. The mobile menu closes after navigation. The shop cart mounts in
the header on both layouts.

Officers also see an **Admin** link before the account control. It goes to
`/admin` and is hidden unless the user holds at least one admin permission.
Admin sections live in `ADMIN_SECTIONS` in `frontend/src/adminSections.js`, the one
list the navbar, the admin bar, and the routes all read. Today there is one
section, Shop (`shop.purchases.review`), with Orders (`/admin/shop/orders`) and
Pickup (`/admin/shop/pickup`). To add a section or page, add its entry to that
list (with its permission) and add the page component to `ADMIN_PAGES` in
`App.jsx`; the server's list of admin paths in `backend/http/spaRoutes.js` needs
the new path too. `AuthContext` loads the user's permissions once per sign-in from
`GET /api/v1/user/permissions` and exposes `can(permission)`; the account type
(`uType`) plays no part. Hiding a link is a convenience, not the security
boundary: each page's API checks the permission on every request. Officer pages
under `/admin` (`isAdminPath` in `adminSections.js`) render without the site
navbar, shop notice, and footer. Each shows the admin bar (`components/AdminBar.jsx`):
"IUGA Admin" linking to `/admin`, a centered link to each admin page the officer
may use (the open page underlined and marked `aria-current="page"`), "Back to
site", and Sign out. `/admin` and unknown `/admin/...` addresses redirect to Orders.

**Archived, not deleted:** the Elections and Election FAQ pages are still routed
at `/elections` and `/electionfaq`, but the navigation intentionally does not
link to them. The About dropdown that used to surface them was removed, and Get
Involved and Student Voice are now separate top-level links. The pages are
unreachable from the UI on purpose — reach them by URL. If a future release
re-exposes them, restore the nav entry rather than assuming the pages are gone.

Use the shared variables in `stylesheets/abstracts/_variables.scss` for layout
tokens such as `$radius-pill`, `$radius-card`, and `$pill-height`. Avoid hard-coded
navigation radii or dimensions in page styles.

### Shared layout shell

`layout/_container.scss` owns the app shell geometry. The sticky top navbar
remains in document flow and `.baseContainer` centers in the full viewport.
The footer centers on the same axis as page content.

The column cap — 1200px, or 1000px between the sm-desktop and desktop
breakpoints — is intentional. Pages cap their own inner content well inside it,
so a wider column would only stretch text past a comfortable reading measure.
Wide screens get balanced gutters, not a wider column.

---

## Routing

Defined in `src/App.jsx`:

| Path | Page Component | Data Source |
|---|---|---|
| `/` | `HomePage` | `upcomingEvents` (prop — mock or API) |
| `/events` | `EventsPage` | Mock data or `GET /api/v1/events`; officers also call `/api/v1/event-requests`. See [EVENTS.md](./EVENTS.md) |
| `/resources` | `ResourcesPage` | Static data from `assets/data/ResourcesData.js` |
| `/shop` | `ShopPage` | Static data from `assets/data/ShopData.js` and `GET /api/v1/shop/catalog` plus authenticated `POST /api/v1/shop/checkout` |
| `/shop/checkout/:holdId` | `ShopCheckoutPage` | Authenticated `GET` and `DELETE` `/api/v1/shop/holds/:holdId`, `PATCH` `/api/v1/shop/holds/:holdId/lines`, and `POST` `/api/v1/shop/holds/:holdId/confirm`. Shows the Venmo QR code (`assets/shop/venmo-qr.webp`) beside the exact amount due and the IUGA-UW handle, each line, the total, a countdown, and the required Venmo username and phone number entries. The Venmo username is prefilled from the student's earlier purchase; entering a different one blocks Confirm and offers a prefilled email to `iuga@uw.edu`. |
| `/admin` | redirect | Sends to `/admin/shop/orders`, the first admin page. Unknown `/admin/...` addresses redirect there too. |
| `/admin/shop/orders` | `ShopOrdersPage` | Officer order review for the Director of Finance and other board members, reached from the navbar's Admin link. A payments dashboard outside the public theme: its own admin bar (with centered Orders and Pickup links) instead of the site navbar and footer, an overview of three cards: Unconfirmed (money still owed on orders no officer has confirmed, with the order count and any partial amount received), Confirmed (money received on Paid orders), and Follow-up (open follow-ups on any order, noting how many students say they already paid); the Unconfirmed and Follow-up cards open their tabs, and filter tabs with counts (Unconfirmed, Balance remaining, Follow-up, Ready for pickup, Picked up, Dropped, Refunded, All; Ready for pickup and Picked up split Paid orders by the pickup mark, so handed-over orders leave the working list but stay in search and All; the Follow-up count is highlighted while any order waits on an officer) plus search that updates as the officer types. The current orders stay on screen while the next filter or search loads; a request it replaces is cancelled, and first pages seen moments ago show at once until any change is saved. Each row leads with the amount and payment status (Unconfirmed, Paid, Dropped, Refunded; Unconfirmed is the stored `pending` status: the student may have paid, but no officer has found the payment), then how much was recorded as received ("Not recorded" until someone enters it, or "$40.00 of $64.00 received" with a progress bar and what is left), any open follow-up (highlighted when the student says they already paid), Venmo, customer, items by product without sizes, and date. Mark paid and a "···" menu appear on row hover or focus, and checkboxes open a bottom bar to mark several orders paid. Checked orders and the order open in the drawer are tinted in the list. A drawer shows one order's payment (Expected, Received with an Enter or Edit link for the amount received, Remaining), items, details, and activity, with Mark paid, a Contact dropdown (the buyer's email and phone, call, write email from a template: Paid too much appears when more was received than the total (never on a refunded order, which returns the whole amount), Can't find their payment appears on unpaid and dropped orders when the student says they paid, Payment reminder is offered on unpaid and dropped orders, and paid and refunded orders get only a General message with no payment request), and a "···" menu for the rare actions (Change status, drop, refund); a row's "···" also offers entering the amount received. Change status (in every order's ··· menu, and on the status badge in the drawer) corrects a status set by mistake: a dialog lists every other status with its stock effect, explains the chosen change before it is confirmed, and saves an optional reason. A picked-up order (pickup mark set) that moves away from Paid, by Change status, Drop, or Record refund, shows the pickup warning with the date and officer and needs a reason before its confirm button enables; the reason is required by the server too. Such an order is flagged "Refunded after pickup" or "Changed after pickup" in its row and drawer, and its activity reads "… refunded this order after pickup" with the reason. Moving between Unconfirmed/Paid and Dropped/Refunded returns or retakes stock (retaking fails, unchanged, when the items no longer fit); moving an order that shows its total as received to Unconfirmed or Dropped restores the amount received from before it was marked paid. "Add to log" on the Activity heading records what happened (contacted, student will pay, student says they already paid, or clear) with an optional note, or under Other an entry on a topic the officer names with an optional description; each becomes part of the order's activity. Every change is confirmed in a small dialog. On phones, orders become cards and the drawer is full screen. Calls `GET /api/v1/shop/purchases`, `/purchases/counts`, `/purchases/:id`, and `PATCH` `/purchases/:id/payment`, `/amount-received`, and `/follow-up`, and `POST` `/purchases/:id/notes`; every call requires the `shop.purchases.review` permission. Signed-out and unpermitted visitors see no order data. |
| `/admin/shop/pickup` | `ShopPickupPage` | Officer pickup at the pickup table, reached from the navbar's Admin link or the Pickup link in the admin bar. Opens on every order ready for pickup (paid, not yet handed over), grouped A to Z by last name (or first name, a switch remembered per browser), with an A to Z rail that jumps to a letter (letters with no one are disabled; orders whose account is gone sit under #). Each card leads with the account's first and last name for the Husky Card check, with "goes by" when the preferred name differs. The progress line ("N left to pick up · M picked up") comes from the server. The list refreshes about every 15 seconds while the page is visible, on window focus, and when the tab is shown again, never overlapping requests. A confirmation holds the list in place: orders picked up elsewhere drop out, and newly ready orders wait until the officer types, changes the sort, dismisses the confirmation, or marks another order picked up. Search (sticky at the top, live as the officer types) finds any order across every payment status, with its state line: picked up, unconfirmed, dropped, or refunded orders say why they can't be handed over. Picked up saves and shows a confirmation with Undo and a dismiss control; the confirmation stays in the sticky top area through typing, searching, sorting, the letter rail, and background refreshes until the next pickup, Undo, or dismissal; a stale tap is refused by the server and shows who picked the order up. Saves are reported only when the server says so. Calls `GET /api/v1/shop/purchases/pickup` for the ready list and counts, `GET /api/v1/shop/purchases?status=all&q=` for search, `GET /purchases/:id` after a conflict, and `PATCH /purchases/:id/pickup`; every call requires the `shop.purchases.review` permission. |
| `/elections` | `ElectionPage` | Static data from `assets/data/CandidateData.js` |
| `/electionfaq` | `ElectionsFAQPage` | Static data from `assets/data/ElectionFAQData.js` |
| `/get-involved` | `GetInvolvedPage` | Static committee leaders from `frontend/src/assets/data/teams/2026.js`; Creative application status from public `GET /api/v1/recruitment/creative` |

The backend also serves `index.html` for each of these paths to enable deep linking (see [BACKEND.md](./BACKEND.md#spa-routes)).

### Events page

`/events` is a calendar with year, month, week, and day views, kept in the URL
(`?view=week&date=2026-10-20`). `pages/Events.jsx` composes the toolbar, the
mini month and colour key, and the chosen view from `components/eventsCalendar/`,
and loads events with `hooks/useEventList.js`. Officers with
`events.requests.manage` get event operations below it. The previous page, a
weekly agenda with RSVP and past event photos, is kept unrouted as
`components/EventsOverview.jsx`. See [EVENTS.md](./EVENTS.md) for both.

### Venmo checkout hold

Checkout from the bag calls `POST /api/v1/shop/holds` and navigates to `/shop/checkout/<holdId>`. The bag stays open on every failure and is kept until a purchase is confirmed. Removing a line on the checkout page also removes it from the bag. Cancelling returns to `/shop` with the bag unchanged. A student who leaves the checkout page can press Checkout again: the server cancels their earlier hold and starts a new one. In the bag, the steppers and typed quantities stop at a product's `perStudentLimit` from the catalog, counted across sizes; the `+` button and the product's Add button are disabled at the limit, and each bag line shows the limit. Lines keep the units they already hold, so lowering a quantity is never blocked. Before calling the hold route, checkout is still blocked when a product's units across sizes exceed the limit, which covers a limit lowered after items were added. The bag names the product and its limit, and the server enforces the same limit against the student's existing holds and purchases. An expired hold shows an email option that opens a prefilled message to `iuga@uw.edu` for students who already paid on Venmo but could not confirm; IUGA verifies those payments by hand.

### Maintenance banner

`ShopMaintenanceBanner` sits under the navigation on every page, inside `ShopCartProvider`. It shows only to a student with items in their cart: it reads `GET /api/v1/shop/status` on load and once a minute, and makes no request for an empty cart. With a maintenance time announced it shows that time and a countdown; once the time arrives, or while an officer has paused checkout, it says checkout is paused and the cart is saved. The checkout page's own timer already reflects the shorter hold.

### Cart checkout and payment returns

`context/ShopCartContext.jsx` owns the site-wide cart and checkout handoff.
The cart is stored in this tab's `sessionStorage` under `iuga_shop_cart`.
Starting checkout saves the exact submitted quantities under
`iuga_shop_checkout_<sessionId>` before leaving for Stripe.

While online checkout is not exposed in production, a 503 from `POST /api/v1/shop/checkout` keeps the bag open and shows the server's unavailable message, or a fixed notice when the response has none. The page does not redirect.

On `/shop?checkout=complete&session_id=<sessionId>`, signed-in shoppers wait for
the authenticated, buyer-scoped `GET /api/v1/shop/checkout/<sessionId>` to verify
payment. This read-only server check is the payment authority; neither the URL
nor browser storage proves payment. Pending, failed, or unavailable verification
leaves the cart intact and shows the unconfirmed-payment notice.

After a paid response, the saved handoff quantities are subtracted once from the
current cart, preserving items added since checkout began. The handoff key then
holds `processed` for the rest of the tab's session. After a reload, the same
return URL still requires fresh server verification, but does not subtract again
or show a false cart-mismatch warning. A never-processed missing or corrupt
handoff instead keeps the cart and shows the paid-but-unmatched warning.

The processed marker is written before the remaining cart, so a storage failure
cannot leave a consumable handoff that would subtract again on reload. Storage
errors leave the cart unchanged and show an unresolved confirmation. If the
marker was saved but the cart write failed, later visits preserve the cart rather
than risk removing newly added items. This is tab-local bookkeeping, not order
tracking or proof of payment.

---

## Data Flow

### Development Mode

In Vite dev mode, the frontend uses **mock data**:

- **Homepage events**: `MockCalendarData.js`
- **Calendar events**: `MockCalendarData.js` plus `MockUpcomingEvents.js` (imported directly, no fetch). The latter mirrors the real events in `backend/publishedEvents.js` and adds sample events dated relative to today, so the agenda always has something upcoming
- **Single event details**: the listed mock event, with `mockEvent` from `MockCalendarData.js` supplying any RSVP fields it lacks. The RSVP button still calls the API, so it needs the backend running and a signed-in student

No backend is required for frontend development. The exception is the shop: it reads its catalog and prices from the API in both dev and production, because prices and sizes must never be duplicated in the frontend — in dev that means the Vite `/api` proxy to the backend must be running for the page to load.

### Production Mode

In production, the frontend fetches from same-origin API routes:

- `GET /api/v1/events/upcoming` → homepage
- `GET /api/v1/events` → calendar
- `GET /api/v1/events/id/{eId}` → event details

MSAL returns to the origin serving the frontend. `VITE_API_URL` is the backend address for development readiness checks, not the sign-in callback address.

---

## Authentication

Authentication uses **Microsoft Azure AD** via the `@azure/msal-browser` and `@azure/msal-react` packages.

### Auth flow in the frontend

1. **User clicks "UW NetID Login"** → `signIn()` in `AuthContext.jsx` checks local backend readiness and opens `instance.loginPopup()`
2. **Microsoft sign-in popup** → user authenticates with UW credentials and returns to the Vite frontend origin (normally `http://localhost:3000/`; if Vite selects another port, it returns to that origin)
3. **`useAuth.jsx`**: acquires a token silently (or opens a consent popup when needed) → sends it to `POST /api/v1/user/login`
4. **Backend validates token** (via Microsoft Graph API) → creates server session → returns user data
5. **`AuthContext`** stores user data and sets `isAuthenticated = true` once the backend session is ready
6. **Navbar** shows user greeting + logout button instead of login button

The Vite callback origin must be registered as a SPA redirect URI in the Microsoft app registration. Vite normally uses `http://localhost:3000/`; if another port is selected, register that origin as well.

### Key files

- `authConfig.js` — MSAL app configuration (client ID, tenant, redirect URI)
- `context/AuthContext.jsx` — React Context provider for auth state
- `hooks/useAuth.jsx` — Token acquisition and backend handshake logic

The backend creates **server-side sessions** (express-session), so the frontend sends a session cookie on subsequent API calls.

---

## Styling

- **SCSS** with [7-1 architecture](https://sass-guidelin.es/#architecture)
- Compiled via `sass` (devDependency)
- Main entry: `src/stylesheets/main.scss` — imports only; no CSS rules
- Import order in `main.scss` follows the 7-1 convention: abstracts → vendors → base → layout → components → pages
- All design tokens (colors, fonts, spacing, radii, breakpoints) live in `abstracts/_variables.scss` and follow the `$[token-type]-*` naming convention
- Font: **Rubik** for all text, served from `public/font/` as variable font files
- Responsive breakpoints: the navigation drawer appears below `1024px` to keep
  links readable; page layout also uses the tablet breakpoint at `768px`
- Toast notifications: `react-toastify` for user feedback

### Theme

The site has a light theme (the site as it always looked) and a dark one (the
events prototype's palette: `#1a1a1a` page, `#272727` surfaces, white headings).

- **Which theme.** A visitor's own choice, stored in `localStorage` under
  `iuga-theme`; until they choose, their system setting
  (`prefers-color-scheme`), followed live. A choice in one tab reaches the
  site's other open tabs.
- **No flash.** An inline script in `index.html` sets `data-theme` on `<html>`
  before the first paint. `src/utils/theme.js` (`useTheme`) applies the same
  rule afterwards; `utils/theme.test.js` runs that script to keep them agreeing.
- **The switch.** `components/ThemeToggle.jsx`, in the navbar's right end at
  every width (outside the phone menu): a `role="switch"` button named "Dark
  theme", 60×44 px, with a visible focus ring, and no slide under reduced motion.
- **Colours.** Partials ask for a colour role, not a colour: `theme(heading)`
  becomes `var(--color-heading)`, and `theme-alpha(brand, 0.12)` a see-through
  shade of it. `abstracts/_theme.scss` lists every role's light and dark value
  (each light value is the colour it replaced), and `base/_theme.scss` sets them
  per `[data-theme]`. A few roles exist only in dark and take their light colour
  in place: `theme(line, #e4dce9)`. Colours that look the same in both themes
  (photo captions, the brand gradient) stay plain `$color-*` tokens.
  `stylesheets/theme.test.js` fails on an unknown role, a role missing from one
  theme, or a `theme()` call Sass left unresolved.
- **Exceptions.** The officer pages (`/admin/*`) stay light: `App.jsx` sets
  `data-theme="light"` on their root. Photos keep their own colours; the black
  logo and footer icons turn white through `--artwork-filter`. The events
  calendar keeps its own palette tokens (`docs/EVENTS.md`). The previous, unrouted
  events components were not themed.

---

## Key Dependencies

| Package | Purpose |
|---|---|
| `react-router-dom` | Client-side routing |
| `@azure/msal-browser`, `@azure/msal-react` | UW Azure AD authentication |
| `react-ga4` | Google Analytics 4 |
| `react-responsive` | Responsive breakpoint rendering |
| `react-toastify` | Toast notifications |
| `date-fns` / `dateformat` | Date formatting |
| `gsap` | Events calendar animation: swipe steps and the year view's day overlay |
| `sass` | SCSS compilation |
| `@fortawesome/*` | Icon set |
