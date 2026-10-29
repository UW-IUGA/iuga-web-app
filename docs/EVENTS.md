# Events Page

`/events` is a calendar of IUGA events, ported from Andy's prototype
(`YellowPaco/iuga-alt-prototype`). The page that was there before, a weekly
agenda with event details, RSVP, and past event photos, is kept in the codebase
but no longer routed, so its parts can move to the homepage.

## The calendar

`pages/Events.jsx` composes the calendar and loads its events.

| View | URL | What it shows |
|---|---|---|
| Month (default) | `/events?date=2026-10-20` | One month, a chip for each event. Choosing a day opens it in the day view; choosing a chip opens the event in a popover. |
| Week | `/events?view=week&date=…` | Seven days on an hourly time grid, with a line at the current time. |
| Day | `/events?view=day&date=…` | One day on the time grid, with each event's details listed below it. |
| Year | `/events?view=year&date=…` | Every month that has events, newest first. Choosing a day opens it in place. |

- **State lives in the URL** (`hooks/useCalendarView.js`). `view` is omitted
  for the month view and `date` is a `YYYY-MM-DD` day in Pacific time. Every
  step is a history entry, so Back retraces it, and other query parameters
  are left alone.
- **Toolbar** (`CalendarToolbar`): Today, previous and next arrows, the range
  being shown, and the view switch. Below 900px the range becomes a date
  picker, the switch becomes a dropdown, and the colour key moves under it.
- **Sidebar** (month, week, and day): a mini month that browses on its own and
  moves the view to a day when one is picked, and the colour key.
- **Swipe** (`hooks/useSwipeStep.js`): a sideways swipe over the month, week,
  or day steps it, as the arrows do. A swipe from the screen's edge is left to
  the browser's back gesture. Under reduced motion the step is immediate.
- **Categories**: the colour key and the chips show Academic, Social, and
  Professional, the categories the rest of the site uses. Events labelled
  `Career` show as Professional (`utils/eventStreams.js`'s `categoriesFor`).
- **Officers** with `events.requests.manage` get `EventOperations` below the
  calendar, as before, with the same permission checks.

### Data

`hooks/useEventList.js` returns `{ records, status, retry }`. In production it
reads `GET /api/v1/events/`. It is read again whenever sign-in state changes,
and a list that is already on screen stays there while that happens. In
development it uses `mockCalendarData` and `mockUpcomingEvents`, with no
request. While the first list loads the calendar says "Loading events…"; if
the request fails it says "We couldn't load events. Please try again." with a
Try again button.

`utils/calendar/calendar.js`'s `normalizeEvent` turns each record into what the
views draw (Pacific-time parts, labels, colours, the popover's details).

### Code layout

```
frontend/src/
├── pages/Events.jsx                     ← The page: toolbar, sidebar, view, data states
├── components/eventsCalendar/           ← Andy's views and controls, one file each, with their tests
├── hooks/
│   ├── useCalendarView.js               ← view and date, read from and written to the URL
│   ├── useEventList.js                  ← the event list and its loading state
│   ├── useSwipeStep.js, useZoomOverlay.js, useMediaQuery.js, useNow.js
├── utils/calendar/                      ← Date maths, grids, popover placement, swipe rules, breakpoints
└── stylesheets/
    ├── abstracts/_eventsCalendar.scss   ← The calendar's palette, spacing, radii, and breakpoints
    └── components/eventsCalendar/       ← One partial per part, all inside .eventsCalendar
```

### Styles

The calendar keeps the prototype's look, so it has its own tokens in
`abstracts/_eventsCalendar.scss`, loaded explicitly as `abstracts/_admin.scss`
is for the admin pages.

It has two palettes there, with the same keys, and shows the one for the site
theme (see Theme in `docs/FRONTEND.md`). The dark palette is the prototype's
own, value for value. The light palette keeps its structure (a page, raised
cards, day cells, one strong fill for what is selected or current) in the
site's light colours: a white page, lavender-grey cards, the site ink for text,
and UW purple for the strong fill. Its label colours are deeper, so white text
reads on them. `_base.scss` sets each palette as `--calendar-*` custom
properties on the `.eventsCalendar` root (dark under `[data-theme="dark"]`), and
the `$calendar-*` names partials use read those properties. The label colours
that `utils/calendar/calendar.js` paints inline are the same properties.

Every rule sits inside an `.eventsCalendar` root (the page, and the popover,
which renders into `<body>`). `_base.scss` sets back what the site's element
styles would otherwise change inside it: heading sizes and colour, the button
blur and transitions, and box sizing. `:where()` keeps those resets at the
root's specificity, so the calendar's own class rules always win. The global
`.legend` from the elections pages is reset in `_legend.scss` for the same
reason. A Sass `X &` selector would put `X` outside the root and never match;
`calendarStyles.test.js` fails if any rule escapes it.

Class names are the prototype's kebab-case BEM (`toolbar__range`,
`grid__event--button`) rather than the site's camelCase, so the port can be
compared with the prototype line by line. Stylelint reports these as
`selector-class-pattern` warnings.

`contrast.test.js` checks both palettes against WCAG 1.4.3 and 1.4.11, read
from the compiled CSS, and that the dark one is still the prototype's; and
`calendarStyles.test.js` checks target sizes, zoom, focus, and the phone
breakpoint in the compiled CSS. `pages/Events.a11y.test.jsx` runs axe on every
view, the popovers, the year view's day, and the phone date picker.

## The previous page, kept unrouted

The previous page moved unchanged to `components/EventsOverview.jsx`, with its
tests in `components/EventsOverview.test.jsx`. Nothing routes to it. It and
the parts below stay so the homepage can reuse them; none of them were edited.

| File | Used by | What it is |
|---|---|---|
| `components/EventsOverview.jsx` | nothing | The previous `/events` page: hero collage, weekly agenda, event dialog with RSVP, past events, and officer event operations |
| `components/EventAgenda.jsx` | EventsOverview | One week of events, with day buttons |
| `components/WeekNavigation.jsx` | EventAgenda | Previous and next week |
| `components/EventThumbnail.jsx` | EventAgenda | An event's photo or category tile |
| `components/EventCategoryPills.jsx` | EventAgenda, EventDialog | Category labels |
| `components/EventDialog.jsx` | EventsOverview | Event details and RSVP (`GET /api/v1/events/id/{eId}`, `POST /api/v1/events/rsvp`) |
| `components/PastEventCard.jsx` | EventsOverview | A past event's cover and photos |
| `components/PhotoCollage.jsx` | EventsOverview | The hero's overlapping photos |
| `components/PhotoLightbox.jsx` | EventsOverview | The full-size photo viewer |
| `assets/data/PastEventsData.js` | EventsOverview | Past events and their photos |
| `stylesheets/pages/_events.scss` and the matching component partials | the parts above | Their styles, still loaded by `main.scss`; `.event-operations` there also styles the new page's officer section |

### How the previous page works

`EventsOverview` loads the event list, owns which event and which photo are
open, and composes these pieces:

- **Hero** — the heading beside a `PhotoCollage` of past event photos.
- **`EventAgenda`** — shows one week at a time. `WeekNavigation` moves a week
  backward or forward. Seven day buttons show which days have events; choosing
  a day filters the list to that day, and choosing it again shows the whole
  week. Each event row shows its date, `EventThumbnail`, time, location, host,
  and `EventCategoryPills`, and is marked "Going" once the student has RSVPd.
  A week with no events offers a button that jumps to the next upcoming event.
- **`EventDialog`** — opens when a student chooses an event. It opens at once
  with the fields the list already has, then fills in the rest from
  `GET /api/v1/events/id/{eId}`. An upcoming event with RSVP enabled shows its
  questions and an RSVP button, which posts to `POST /api/v1/events/rsvp` and
  requires sign-in. An event with its own sign-up link shows that link instead.
  Past events cannot be RSVPd to.
- **Previous events** — one `PastEventCard` per entry in
  `assets/data/PastEventsData.js`. Any photo, or "View Photos", opens
  `PhotoLightbox` on that event's photos; the viewer shows the event's name
  with its date, time, and location. The arrow buttons, the arrow keys, a
  click on the right or left half of the photo, and a swipe across it on a
  touch screen (through `hooks/useSwipeStep.js`, as the calendar does) move
  through the set, wrapping around at both ends. The viewer keeps a consistent
  viewport-bounded frame across photo proportions, showing the whole image
  without enlarging small originals. Captions sit below the photo on a dark
  background; clicking a caption does not navigate.

To add a past event, run `scripts/past-event-photo.sh <original-photo> <name>`
for each photo (it needs `ffmpeg` and `cwebp`), then add an entry to
`PastEventsData.js` that lists them with `photo("<name>", "<alt text>")`. The
script writes two WebP files to `assets/gallery/past-events/`: `<name>.webp`,
2000px on its long edge, for the viewer, and `<name>-small.webp`, 800px, for
cards, thumbnails, and the hero collage. The page loads the small files until
a student opens a photo; the viewer then also downloads the full-size photos
either side of the one shown, so moving to them doesn't wait on a download.
The one other full-size file is each card's cover on high-density screens, so
it stays sharp. The first photo is the cover, and the first two photos of each
event feed the hero collage.

`EventDialog` and `PhotoLightbox` are native `<dialog>` elements driven by
`hooks/useModalDialog.js`. Pass it whether the dialog should be open and what
to do when it closes; spread the `dialogProps` it returns onto the `<dialog>`
and call its `close()` from a close button. Escape, the close button, and a
click on the dimmed area all close the dialog and call your handler once.

`EventOperations` and `PageHeader` are still used: the first by the new page,
the second by other pages.

### Moving parts to the homepage

- Render `EventsOverview` (or the parts you need) from `pages/Home.jsx`. It
  needs `AuthContext` and a router, which the app already provides.
- It loads its own list with the same request and states as
  `useEventList`. That logic is duplicated on purpose, so the previous page
  stays exactly as it was; switch it to `useEventList` when you move it.
- `EventsOverview` scrolls to the top on mount, as every page does. Drop that
  if it becomes a section of another page.
- Its `PageHeader` and event operations come with it; remove what the
  homepage should not show.

## Open decisions

- **RSVP and attendees.** The prototype's popover can show RSVP and attendee
  details, but `GET /api/v1/events/` does not return `rsvpEnabled`,
  `rsvpQuestions`, participants, or `altLink`, so production shows neither.
  RSVP is still available only in `EventDialog`. Either the list returns those
  fields, or the popover fetches `GET /api/v1/events/id/{eId}` as
  `EventDialog` does.
- **Page colour.** The calendar follows the site theme: the prototype's dark
  palette in the dark theme, and a light palette in the light theme.
- **Class names.** Kebab-case BEM, as noted above; renaming to camelCase is
  mechanical but would make the prototype harder to compare against.
- **Prototype shell.** The prototype's own navbar, skip link, page titles,
  `scroll-padding` on `html`, and `html { height: 150% }` were not ported; the
  site's shell provides its own.
