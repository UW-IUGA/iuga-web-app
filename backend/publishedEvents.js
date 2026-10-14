/*
Purpose: Publish events that are announced outside the event request workflow,
         with the fields that workflow cannot set: a poster, categories, and an
         outside RSVP link.

Authentication/Authorization Requirements: None at runtime. This runs once at
         server startup; adding an event here is a code change that goes
         through review.

Expected Request Information:
- publishedEvents: one entry per event, in the shape of the Events schema.
  _id is a fixed 24-character hex id, generated once per event and never
  reused. eThumbnailPath points at a file in frontend/public/assets/events/,
  which the frontend build serves; the image itself is not stored here.

Expected Response Information:
- seedPublishedEvents(Events) inserts each entry whose _id is not in the
  database yet. It never updates an existing record, so edits and RSVPs made
  after publishing are kept. Removing an entry here does not delete its
  record; delete that in the database.

See docs/BACKEND.md, "Publishing an event", for the steps.
*/

export const publishedEvents = [
    {
        _id: "6acee493cfa16b20fc23695e",
        eName: "What problem are you actually solving?",
        eOrganizers: "iStartup Lab",
        eStartDate: new Date("2026-10-14T13:30:00-07:00"),
        eLocation: "iStartup Lab, MGH 310",
        eDescription:
            "The iStartup Lab is hosting Samir Mehta (6x founder) for a workshop on checking your idea before you spend months building it. You'll get a quick intro to the entrepreneurial lifecycle, then work through who actually has the problem you're excited about and what would prove it's real. Samir will give feedback and take questions at the end. Bring a rough idea, or just come curious.",
        eThumbnailPath: "/assets/events/istartup-problem-workshop.webp",
        eLabels: ["Professional"],
        eRsvpEnabled: false,
    },
    {
        _id: "6acee493cfa16b20fc23695f",
        eName: "Networking with Accenture",
        eOrganizers: "IUGA",
        eStartDate: new Date("2026-10-26T17:30:00-07:00"),
        eEndDate: new Date("2026-10-26T18:30:00-07:00"),
        eLocation: "HUB 334",
        eDescription:
            "Want to break into tech and consulting? Join us for an exclusive panel event with Accenture! Get the inside scoop from current Accenture professionals working across a variety of tech backgrounds. Whether you want to know about the day-to-day work culture or need tips to ace the recruitment process, this is your chance to learn from the best.",
        eThumbnailPath: "/assets/events/accenture-networking.webp",
        eLabels: ["Professional"],
        eRsvpEnabled: false,
        eAltLink: {
            title: "RSVP and submit your questions",
            url: "https://forms.cloud.microsoft/pages/responsepage.aspx?id=W9229i_wGkSZoBYqxQYL0pj2PffrcZlMvNzx2DvLiVNUMDVST05QVTFBRDI0VUdIVEhUSEg1Q1FIUS4u&route=shorturl",
        },
    },
];

export function seedPublishedEvents(events) {
    return Promise.all(
        publishedEvents.map(({ _id, ...fields }) =>
            events.updateOne({ _id }, { $setOnInsert: fields }, { upsert: true }),
        ),
    );
}
