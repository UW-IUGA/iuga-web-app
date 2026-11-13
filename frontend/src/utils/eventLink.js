// Names the outside link an event sends people to, so its button says where it goes.
// The kinds mirror ALT_LINK_KINDS in backend/routes/api/v1/controllers/eventRequests.js.
const isHost = (hostname, host) => hostname === host || hostname.endsWith(`.${host}`);

const PLATFORMS = [
  {
    kind: "luma",
    label: "Luma",
    action: "RSVP on Luma",
    matches: (url) => isHost(url.hostname, "luma.com") || isHost(url.hostname, "lu.ma"),
  },
  {
    kind: "eventbrite",
    label: "Eventbrite",
    action: "Register on Eventbrite",
    matches: (url) => isHost(url.hostname, "eventbrite.com"),
  },
  {
    kind: "partiful",
    label: "Partiful",
    action: "RSVP on Partiful",
    matches: (url) => isHost(url.hostname, "partiful.com"),
  },
  {
    kind: "meetup",
    label: "Meetup",
    action: "RSVP on Meetup",
    matches: (url) => isHost(url.hostname, "meetup.com"),
  },
  {
    kind: "google_form",
    label: "Google Form",
    action: "Fill out the form",
    matches: (url) =>
      isHost(url.hostname, "forms.gle") ||
      (isHost(url.hostname, "docs.google.com") && url.pathname.startsWith("/forms")),
  },
  {
    kind: "microsoft_form",
    label: "Microsoft Form",
    action: "Fill out the form",
    matches: (url) =>
      isHost(url.hostname, "forms.office.com") || isHost(url.hostname, "forms.cloud.microsoft"),
  },
];

export const DEFAULT_LINK_ACTION = "More info";

// The request form's platform choices. "Other website" leaves the button on its default wording.
export const EVENT_LINK_OPTIONS = [
  ...PLATFORMS.map(({ kind, label }) => ({ kind, label })),
  { kind: "other", label: "Other website" },
];

const parseUrl = (value) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

// The platform the organizer picked wins; otherwise the link's own host decides; otherwise a neutral label.
export function altLinkAction(altLink) {
  if (!altLink?.url) return DEFAULT_LINK_ACTION;
  const picked = PLATFORMS.find((platform) => platform.kind === altLink.kind);
  if (picked) return picked.action;
  const url = parseUrl(altLink.url);
  const detected = url && PLATFORMS.find((platform) => platform.matches(url));
  return detected ? detected.action : DEFAULT_LINK_ACTION;
}
