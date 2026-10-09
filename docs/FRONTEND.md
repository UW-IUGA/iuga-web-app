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
│   ├── Calendar.jsx
│   ├── CharacterCard.jsx
│   ├── Dropdown.jsx
│   ├── ElectionFAQCard.jsx
│   ├── EmailContactDialog.jsx ← Mail-provider compose dialog for committee contact
│   ├── EventCard.jsx
│   ├── EventDetailsCard.jsx
│   ├── EventDetailsLoader.jsx
│   ├── GradientLine.jsx
│   ├── ResourceCard.jsx
│   ├── RolePage.jsx
│   └── Tag.jsx
├── context/
│   └── AuthContext.jsx   ← Authentication state (React Context)
├── hooks/
│   └── useAuth.jsx       ← MSAL token acquisition + backend handshake
├── layouts/
│   ├── Navbar.jsx        ← Shared top navigation and temporary mobile menu
│   └── Footer.jsx
├── pages/
│   ├── Home.jsx          ← Homepage hero, upcoming events, support destinations, and community links
│   ├── Events.jsx        ← Calendar view (desktop only; mobile shows "under construction")
│   ├── Resources.jsx     ← Resource links list
│   ├── About.jsx         ← Team member cards by year
│   ├── GetInvolved.jsx   ← Committee leaders, committees, and the Creative application status
│   ├── Elections.jsx     ← Candidate profiles for current election
│   └── ElectionsFAQ.jsx  ← FAQ accordion about elections
└── stylesheets/
    ├── main.scss          ← Central import file (7-1 architecture)
    ├── abstracts/         ← Variables, mixins, functions, media queries
    ├── vendors/           ← Vendored third-party styles (include-media, toastify)
    ├── base/              ← Reset, typography, colors, misc
    ├── layout/            ← Container, split responsive navigation, footer, form
    ├── components/        ← Component-specific styles
    └── pages/             ← Page-specific styles (e.g., _getInvolved.scss for page and member-card styles)
```

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
the links collapse into a hamburger panel. Escape closes the account menu and
the mobile panel. Signed-in students see their name, a "Signed in with UW
NetID" line, and a text Sign out action in the account menu, without an avatar
or role badge. The mobile menu closes after navigation. The shop cart mounts in
the header on both layouts.

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
| `/events` | `EventsPage` | Mock data or `GET /api/v1/events` |
| `/resources` | `ResourcesPage` | Static data from `assets/data/ResourcesData.js` |
| `/shop` | `ShopPage` | Static data from `assets/data/ShopData.js` and `GET /api/v1/shop/catalog` plus authenticated `POST /api/v1/shop/checkout` |
| `/elections` | `ElectionPage` | Static data from `assets/data/CandidateData.js` |
| `/electionfaq` | `ElectionsFAQPage` | Static data from `assets/data/ElectionFAQData.js` |
| `/get-involved` | `GetInvolvedPage` | Static committee leaders from `frontend/src/assets/data/teams/2026.js`; Creative application status from public `GET /api/v1/recruitment/creative` |

The backend also serves `index.html` for each of these paths to enable deep linking (see [BACKEND.md](./BACKEND.md#spa-routes)).

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
- **Calendar events**: `MockCalendarData.js` (imported directly, no fetch)
- **Single event details**: `mockEvent` from `MockCalendarData.js`

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
- Fonts: **NotoSans** (body) and **PlayfairDisplay** (headings), served from `public/font/`
- Responsive breakpoints: the navigation drawer appears below `1024px` to keep
  links readable; page layout also uses the tablet breakpoint at `768px`
- Some pages (Events calendar) are desktop-only with a "under construction" message on mobile
- Toast notifications: `react-toastify` for user feedback

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
| `sass` | SCSS compilation |
| `@fortawesome/*` | Icon set |
