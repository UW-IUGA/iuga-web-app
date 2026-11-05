# Events in IUGA

IUGA shows events in two places. The homepage highlights up to three upcoming events. The `/events` page is the full calendar, where visitors can browse dates, read event details, and RSVP. Officers with the right permissions also see the event request workspace below the calendar.

This guide follows the event from its source, through the API and page, to the controls a visitor uses. The current route is `frontend/src/pages/Events.jsx`.

## How an event gets into the calendar

The calendar reads event records from the backend. IUGA creates those records in two ways:

1. **An officer request is approved.** An officer submits a request in Event operations. Leadership approval creates an `Events` record and links it to the request. The new record then appears in the public event list.
2. **An event is added directly.** Events that need a poster, public categories, or an outside sign-up link are listed in `backend/publishedEvents.js`. The server inserts these records at startup if their IDs are not already in the database. It does not overwrite records that already exist.

The event request and the published event are separate records. A request is planning and review work. The published event is what the homepage and calendar display. See [BACKEND.md](./BACKEND.md) for the API contract and instructions for adding a directly published event.

## What visitors see

### Homepage

`App.jsx` requests `GET /api/v1/events/upcoming`. The API returns the three nearest events whose start time is in the future. `Home.jsx` sorts and displays those events with their Pacific date and time. Each one links to `/events`; the empty state links there too.

In development, the app supplies sample events instead of making that request.

### Calendar page

`App.jsx` routes `/events` to `pages/Events.jsx`. The calendar is public, so visitors do not need to sign in to browse it. Its event list comes from `GET /api/v1/events/` in production and from sample data in development.

`useEventList.js` owns loading, failure, retry, and refresh behavior. If a refresh starts while events are already visible, the page keeps showing that list. Signing in or out triggers a refresh so the event summaries reflect the current visitor's RSVP status. `Events.jsx` turns API records into the calendar's display format once with `normalizeEvent` from `utils/calendar/calendar.js`.

The page shows a loading message before the first list arrives. If loading fails, it shows an error and a Try again button. The calendar and event list are shared across all four views:

| View | URL example | What it shows |
|---|---|---|
| Month | `/events?date=2026-10-20` | A month grid with event chips. Selecting a date opens that day; selecting an event opens its details. |
| Week | `/events?view=week&date=2026-10-20` | Seven days on an hourly time grid. Selecting an event opens its details. |
| Day | `/events?view=day&date=2026-10-20` | One day's time grid. Selecting an event opens its details in a popover. |
| Year | `/events?view=year&date=2026-10-20` | The months that contain events, newest first. Selecting a day opens its events in an overlay. |

`useCalendarView.js` keeps the selected view and date in the URL. Month is the default, so its `view` parameter is omitted. Dates use the Pacific calendar day (`YYYY-MM-DD`), which keeps the selected day stable across reloads and time zones. Changing views keeps the date; selecting a day from a calendar view switches to the day view. Each navigation step adds a browser history entry, so Back retraces it. Other query parameters are preserved.

`CalendarControls.jsx` provides Today, previous and next, the current date range, and the view switch. Year view covers the whole archive and has no previous/next controls. On smaller screens, the date range becomes a date picker and the view switch becomes a dropdown. Month, week, and day views also show `MiniMonth` beside the main view; selecting a date there changes the selected date without changing the current view. The colour key lists the calendar's event categories. A sideways swipe across the main view can move month, week, or day just like the arrows; the arrows remain available for keyboard and assistive technology users. Diagonal drags scroll without stepping, and edge swipes remain available for the browser's Back gesture. Steps are immediate under reduced motion.

Calendar dates and times use `America/Los_Angeles`. `normalizeEvent` converts the API's `e*` fields into the values used by the views and maps the stored `Professional` label to the displayed `Career` label. `utils/calendar/calendar.js` contains the date formatting, event grouping, month grids, and time-grid calculations.

## Event details and RSVP

A visitor opens details by selecting an event. Month, week, and day views use `EventPopover`; year view uses `DayOverlay`. Both render `EventDetail`, so the event information and RSVP behavior stay consistent. On a phone, the popover opens above or below its event and stays below the site navigation (`utils/calendar/popover.js`).

The event list does not include every detail. When an event's details are first shown, `EventRsvpContext.jsx` requests `GET /api/v1/events/id/:eId` and shares the result between open event details. It also tracks RSVPs made during the current sign-in session. If sign-in state changes, it clears those session-specific details and RSVP markers so they cannot carry over to another visitor.

The RSVP block depends on the event and visitor:

- Once an event starts, its RSVP block is hidden.
- Events with built-in RSVP require sign-in. If the event has questions, the visitor answers them before submitting; if it has none, one press submits the RSVP.
- A successful RSVP is confirmed in the event details. The backend rejects duplicate RSVPs, invalid answers, and RSVPs after the event starts.
- An upcoming event with an outside sign-up link shows that link whether or not built-in RSVP is enabled.
- If neither sign-up option is available, the details say RSVP is unavailable.

In development, sample event details come from the mock data and RSVP succeeds locally after a short delay. No RSVP request is sent to the backend.

## Officer event requests

Visitors with `events.requests.manage` see Event operations below the public calendar. `EventOperations.jsx` lists requests, lets officers filter and search them, and opens a request's details. Officers can submit an event request with its name, group, dates, audience, and description. Leadership reviews the request; after approval, the backend creates the event record used by the public calendar.

Each request tracks these checkpoints: proposal, meeting, finance, room, marketing, purchases, completion, and review. The UI receives separate permissions for leadership approval, finance, and purchase completion. The backend enforces those permissions too; hiding a control in the UI is not the access check.

The request workspace calls `/api/v1/event-requests`. See [BACKEND.md](./BACKEND.md), under “Event administration,” for the routes, permission rules, and request lifecycle.

## Previous event recaps

The `Previous events` section below the calendar is a separate, local collection. `PastEvents.jsx` reads entries from `assets/data/PastEventsData.js`; it does not fetch them from the event API. Each entry has event copy and a list of photos. `PastEventCard.jsx` shows the recap, and `PhotoLightbox.jsx` opens the photos in a viewer rendered outside the calendar's layout.

The photo viewer keeps its arrows and caption in a fixed, viewport-sized frame while photos load or change. The full photo sits over a blurred copy of its thumbnail, so photos of different proportions fit without moving the controls. Arrow buttons, arrow keys, taps on either half of the photo, and swipes move through the set. Clicking the caption does not navigate.

Each photo has a full-size WebP and a smaller thumbnail in `assets/gallery/past-events/`. `scripts/past-event-photo.sh` prepares the files. Add or change the recap in `PastEventsData.js` and keep the photo names and alt text there in sync with the files.

## Where to look in the code

| Path | Responsibility |
|---|---|
| `frontend/src/App.jsx` | Routes `/` and `/events`; loads the homepage's upcoming event list. |
| `frontend/src/pages/Home.jsx` | Filters and displays the homepage event teaser. |
| `frontend/src/pages/Events.jsx` | Composes the calendar, views, previous event recaps, and officer workspace. |
| `frontend/src/hooks/useEventList.js` | Loads the public event list and owns its loading, failure, and retry states. |
| `frontend/src/hooks/useCalendarView.js` | Reads and updates the selected view and date in the URL. |
| `frontend/src/components/eventsCalendar/` | Calendar controls, views, event details, RSVP context, and previous-event section. |
| `frontend/src/components/EventOperations.jsx` | Officer request list, filters, form, and request details. |
| `frontend/src/utils/calendar/calendar.js` | Event normalization, Pacific date handling, grids, and display formatting. |
| `frontend/src/assets/data/PastEventsData.js` | Local previous-event copy and photo references. |
| `frontend/src/stylesheets/components/eventsCalendar/` | Styles for the calendar components, scoped to `.eventsCalendar`. |
| `backend/routes/api/v1/controllers/events.js` | Public event list and details, RSVP handling, and participant endpoints. |
| `backend/routes/api/v1/controllers/eventRequests.js` | Officer request workflow and publication on approval. |
| `backend/publishedEvents.js` | Directly maintained event records seeded at server startup. |

## Code retained for a future homepage refactor

`components/EventsOverview.jsx` is not routed by `App.jsx`, so it does not currently appear on the events page or homepage. It was kept because its weekly agenda and photo-led presentation were intended as source material for a more substantial homepage events section. The homepage currently uses its own small upcoming-events teaser in `pages/Home.jsx` instead.

These components are only used by the unrouted `EventsOverview` flow and are not part of the live pages today: `EventAgenda`, `EventDialog`, `EventThumbnail`, `EventCategoryPills`, and `PhotoCollage`. They are candidates to be refactored into homepage-owned components when that homepage work happens; they should not be treated as current events-page components or deleted as unused before then.

Other components from that old flow are shared with live pages: `PageHeader` is used by several pages, `PastEventCard` and `PhotoLightbox` serve the current event recaps, and `EventOperations` serves officer requests. Do not classify these as dormant. For current behavior, start with `pages/Events.jsx` and `pages/Home.jsx`.

## Tests

- `frontend/src/pages/Events.test.jsx` covers calendar navigation and the event list on `/events`.
- `frontend/src/components/eventsCalendar/` has focused tests for the views, date picker, event details, and RSVP behavior.
- `frontend/src/pages/Events.a11y.test.jsx` checks the calendar and its overlays with axe.
- `frontend/src/components/eventsCalendar/calendarStyles.test.js` and `contrast.test.js` check the compiled calendar styles and colour contrast.
- `backend/test/events.test.js` covers public event data and RSVP routes; `backend/test/event-requests.test.js` covers the request workflow and publishing
