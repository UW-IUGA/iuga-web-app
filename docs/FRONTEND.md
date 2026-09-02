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
│   ├── EventCard.jsx
│   ├── EventDetailsCard.jsx
│   ├── EventDetailsLoader.jsx
│   ├── GradientLine.jsx
│   ├── GetInvolvedMemberCard.jsx ← Member profile card (get-involved roster)
│   ├── ResourceCard.jsx
│   ├── RolePage.jsx
│   └── Tag.jsx
├── context/
│   └── AuthContext.jsx   ← Authentication state (React Context)
├── hooks/
│   └── useAuth.jsx       ← MSAL token acquisition + backend handshake
├── layouts/
│   ├── Navbar.jsx        ← Shared responsive navigation: desktop sidebar rail and mobile navbar with hamburger menu
│   └── Footer.jsx
├── pages/
│   ├── Home.jsx          ← Landing page: hero, WHO WE ARE cards, upcoming events
│   ├── Events.jsx        ← Calendar view (desktop only; mobile shows "under construction")
│   ├── Resources.jsx     ← Resource links list
│   ├── About.jsx         ← Team member cards by year
│   ├── GetInvolved.jsx   ← Team, committee, and idea-engagement page
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

- `_navigation-base.scss` — shared container, links, and auth controls
- `_navigation-mobile.scss` — top navbar, centered IUGA logo, left hamburger,
  and collapsible menu below the tablet breakpoint
- `_navigation-desktop.scss` — fixed sidebar rail and desktop account controls

Use the shared variables in `stylesheets/abstracts/_variables.scss` for layout
tokens such as `$radius-pill`, `$radius-card`, and `$pill-height`. Avoid hard-coded
navigation radii or dimensions in page styles.

---

## Routing

Defined in `src/App.jsx`:

| Path | Page Component | Data Source |
|---|---|---|
| `/` | `HomePage` | `upcomingEvents` (prop — mock or API) |
| `/events` | `EventsPage` | Mock data or `GET /api/v1/events` |
| `/resources` | `ResourcesPage` | Static data from `assets/data/ResourcesData.js` |
| `/elections` | `ElectionPage` | Static data from `assets/data/CandidateData.js` |
| `/electionfaq` | `ElectionsFAQPage` | Static data from `assets/data/ElectionFAQData.js` |
| `/get-involved` | `GetInvolvedPage` | Static data from `frontend/src/assets/data/teams/2026.js` (2026 roster, no API) |

The backend also serves `index.html` for each of these paths to enable deep linking (see [BACKEND.md](./BACKEND.md#spa-routes)).

---

## Data Flow

### Development Mode

In Vite dev mode, the frontend uses **mock data**:

- **Homepage events**: `MockCalendarData.js`
- **Calendar events**: `MockCalendarData.js` (imported directly, no fetch)
- **Single event details**: `mockEvent` from `MockCalendarData.js`

No backend is required for frontend development.

### Production Mode

In production, the frontend fetches from same-origin API routes:

- `GET /api/v1/events/upcoming` → homepage
- `GET /api/v1/events` → calendar
- `GET /api/v1/events/id/{eId}` → event details

The public `VITE_API_URL` Docker build argument configures the MSAL redirect URI at build time.

---

## Authentication

Authentication uses **Microsoft Azure AD** via the `@azure/msal-browser` and `@azure/msal-react` packages.

### Auth flow in the frontend

1. **User clicks "UW NetID Login"** → `signIn()` in `AuthContext.jsx` calls `instance.loginRedirect()`
2. **Redirect to Azure AD** → user authenticates with UW credentials
3. **Redirect back** → MSAL detects the auth code in the URL
4. **`useAuth.jsx`**: acquires a token silently → sends it to `POST /api/v1/user/login`
5. **Backend validates token** (via Microsoft Graph API) → creates server session → returns user data
6. **`AuthContext`** stores user data and sets `isAuthenticated = true`
7. **Navbar** shows user greeting + logout button instead of login button

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
- Responsive breakpoints: mobile below `768px`, tablet/desktop at `768px` and above,
  with the sm-desktop breakpoint at `1024px`
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
