import { describe, expect, it } from "vitest";
import { altLinkAction, DEFAULT_LINK_ACTION } from "./eventLink";

describe("altLinkAction", () => {
  it("falls back to More info without a link", () => {
    expect(altLinkAction(undefined)).toBe(DEFAULT_LINK_ACTION);
    expect(altLinkAction({ url: "" })).toBe("More info");
  });

  it("uses the platform the organizer picked over the link's host", () => {
    expect(altLinkAction({ kind: "eventbrite", url: "https://lu.ma/x" })).toBe(
      "Register on Eventbrite",
    );
  });

  it("detects a platform from its host when no kind is given", () => {
    expect(altLinkAction({ url: "https://luma.com/iuga" })).toBe("RSVP on Luma");
    expect(altLinkAction({ url: "https://www.eventbrite.com/e/1" })).toBe(
      "Register on Eventbrite",
    );
    expect(altLinkAction({ url: "https://partiful.com/e/abc" })).toBe(
      "RSVP on Partiful",
    );
    expect(altLinkAction({ url: "https://meetup.com/group/event" })).toBe(
      "RSVP on Meetup",
    );
  });

  it("recognises Google and Microsoft forms by host, and only Google Forms paths", () => {
    expect(altLinkAction({ url: "https://forms.gle/abc" })).toBe("Fill out the form");
    expect(
      altLinkAction({ url: "https://docs.google.com/forms/d/e/abc/viewform" }),
    ).toBe("Fill out the form");
    expect(
      altLinkAction({
        url: "https://forms.cloud.microsoft/pages/responsepage.aspx?id=abc",
      }),
    ).toBe("Fill out the form");
    expect(altLinkAction({ url: "https://docs.google.com/document/d/abc" })).toBe(
      DEFAULT_LINK_ACTION,
    );
  });

  it("does not mistake a lookalike host for a platform", () => {
    expect(altLinkAction({ url: "https://notluma.com/x" })).toBe(DEFAULT_LINK_ACTION);
    expect(altLinkAction({ url: "https://example.org/rsvp" })).toBe(DEFAULT_LINK_ACTION);
  });

  it("treats 'other' as no platform and reads the host instead", () => {
    expect(altLinkAction({ kind: "other", url: "https://lu.ma/x" })).toBe(
      "RSVP on Luma",
    );
    expect(altLinkAction({ kind: "other", url: "https://example.org" })).toBe(
      DEFAULT_LINK_ACTION,
    );
  });
});
