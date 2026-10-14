import { createRecurringEvents } from "./recurringEvents.mjs";

// UW Autumn 2026 ends December 18 (including finals); Thanksgiving is excluded.
// https://www.washington.edu/students/reg/2627cal.html
export const snackAndBuildEvents = createRecurringEvents({
    event: {
        eName: "Snack & Build",
        eOrganizers: "iStartup Lab",
        eLocation: "iStartup Lab, MGH 310",
        eDescription:
            "Bring a project, bring an idea, or bring nothing—just come build. Share what you're working on (or just listen), enjoy open build time, and get feedback and conversation with other builders. No startup, team, or polished idea needed. Free snacks included. Drop in; no RSVP required. Tuesdays noon–1:15 p.m. and Thursdays 3:30 p.m. onward during Fall Quarter, including finals week. No session on Thanksgiving (November 26).",
        eThumbnailPath: "/assets/events/snack-and-build-page-1.webp",
        eLabels: ["Professional"],
        eRsvpEnabled: false,
    },
    startsOn: "2026-10-13",
    endsOn: "2026-12-18",
    schedule: [
        { weekday: 2, startTime: "12:00", endTime: "13:15" },
        { weekday: 4, startTime: "15:30" },
    ],
    excludeDates: ["2026-11-26"],
});
