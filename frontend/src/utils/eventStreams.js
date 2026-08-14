// The backend's legacy label "Career" is displayed as "Professional";
// displayLabel is the single mapping point so no visible copy renders the legacy term.
const DISPLAY_LABELS = { Career: "Professional" };

export const displayLabel = (label) => DISPLAY_LABELS[label] ?? label;

export const categoriesFor = (event) => (event.eLabels ?? []).map(displayLabel);

// Returns a NEW array (the input is never mutated) of events whose display
// categories include the requested one; multi-labeled events appear in each.
export const eventsForCategory = (events, category) =>
    events.filter((event) => categoriesFor(event).includes(category));

export const streamHeading = (mode) => {
    if (mode === "upcoming") return "UPCOMING EVENTS";
    if (mode === "latest") return "LATEST EVENTS";
    return "EVENTS";
};

// Classifies a category's events against `now` (a timestamp number or Date).
// Boundary: an event starting exactly at `now` counts as upcoming. Future
// events sort soonest-first; when none exist, past events sort newest-first;
// an empty collection reports the empty mode. Never mixes past events into an
// upcoming list, and never mutates the input.
export const classifyEvents = (events, now) => {
    const start = (event) => Date.parse(event.eStartDate);
    const upcoming = events
        .filter((event) => start(event) >= now)
        .sort((a, b) => start(a) - start(b));
    if (upcoming.length > 0) return { mode: "upcoming", events: upcoming };
    const past = events
        .filter((event) => start(event) < now)
        .sort((a, b) => start(b) - start(a));
    if (past.length > 0) return { mode: "latest", events: past };
    return { mode: "empty", events: [] };
};
