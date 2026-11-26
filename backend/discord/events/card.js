const PACIFIC = "America/Los_Angeles";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC,
  dateStyle: "medium",
  timeStyle: "short",
});
const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone: PACIFIC, timeStyle: "short" });

export function formatWhen(start, end) {
  const startText = `${dateFormat.format(start)} Pacific`;
  return end ? `${startText} to ${timeFormat.format(end)}` : startText;
}

// Submissions made before categories became a list store a single eLabel.
export function categoriesOf(row) {
  return row.eLabels?.length ? row.eLabels : [row.eLabel];
}

/*
 * @behavior Build the event fields every event card shows: RSO, categories, when, location, and RSVP when given.
 * @returns { title, description, fields }; callers add their own color, footer, or extra fields.
 */
export function eventCardBase(row) {
  const fields = [
    { name: "RSO", value: row.rsoName, inline: true },
    { name: "Categories", value: categoriesOf(row).join(", "), inline: true },
    { name: "When", value: formatWhen(row.eStartDate, row.eEndDate) },
    { name: "Location", value: row.eLocation },
  ];
  if (row.rsvpUrl) fields.push({ name: "RSVP", value: row.rsvpUrl });
  return { title: row.eName, description: row.eDescription, fields };
}
