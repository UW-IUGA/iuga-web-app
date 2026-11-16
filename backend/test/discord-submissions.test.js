import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateSubmission, pacificToUtc } from "../discordSubmissionRules.js";

const NOW = new Date("2027-01-01T00:00:00Z");

function validInput(overrides = {}) {
  return {
    name: "Game Night",
    date: "2027-03-10",
    startTime: "18:00",
    endTime: "20:00",
    location: "Mary Gates Hall 142",
    category: "Social",
    description: "Board games and snacks.",
    rsvpUrl: "https://example.org/rsvp",
    ...overrides,
  };
}

describe("pacificToUtc", () => {
  it("converts a Pacific wall time to UTC, including daylight saving", () => {
    // January is standard time, UTC-8.
    assert.equal(pacificToUtc("2027-01-20", "18:00").toISOString(), "2027-01-21T02:00:00.000Z");
    // March 10 2027 is before the March 14 switch, still UTC-8.
    assert.equal(pacificToUtc("2027-03-10", "18:00").toISOString(), "2027-03-11T02:00:00.000Z");
    // March 20 2027 is after the switch, UTC-7.
    assert.equal(pacificToUtc("2027-03-20", "18:00").toISOString(), "2027-03-21T01:00:00.000Z");
  });
});

describe("validateSubmission", () => {
  it("accepts a complete valid submission and returns UTC times", () => {
    const result = validateSubmission(validInput(), NOW);
    assert.equal(result.ok, true);
    assert.equal(result.value.eStartDate.toISOString(), "2027-03-11T02:00:00.000Z");
    assert.equal(result.value.eEndDate.toISOString(), "2027-03-11T04:00:00.000Z");
    assert.equal(result.value.eLabel, "Social");
    assert.equal(result.value.rsvpUrl, "https://example.org/rsvp");
  });

  it("allows an omitted end time and an omitted RSVP link", () => {
    const result = validateSubmission(validInput({ endTime: "", rsvpUrl: "" }), NOW);
    assert.equal(result.ok, true);
    assert.equal(result.value.eEndDate, undefined);
    assert.equal(result.value.rsvpUrl, undefined);
  });

  it("rejects a date in the past", () => {
    const result = validateSubmission(validInput({ date: "2026-06-01" }), NOW);
    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /future/);
  });

  it("rejects a malformed or impossible date", () => {
    assert.equal(validateSubmission(validInput({ date: "03/10/2027" }), NOW).ok, false);
    assert.equal(validateSubmission(validInput({ date: "2027-02-30" }), NOW).ok, false);
  });

  it("rejects an end time that is not after the start", () => {
    const result = validateSubmission(validInput({ endTime: "17:00" }), NOW);
    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /end/i);
  });

  it("rejects a category outside Academic, Social, and Career", () => {
    assert.equal(validateSubmission(validInput({ category: "Party" }), NOW).ok, false);
  });

  it("accepts only https RSVP links", () => {
    assert.equal(validateSubmission(validInput({ rsvpUrl: "http://example.org" }), NOW).ok, false);
    assert.equal(validateSubmission(validInput({ rsvpUrl: "javascript:alert(1)" }), NOW).ok, false);
  });

  it("rejects text over its length cap", () => {
    assert.equal(validateSubmission(validInput({ name: "x".repeat(121) }), NOW).ok, false);
    assert.equal(validateSubmission(validInput({ description: "x".repeat(1001) }), NOW).ok, false);
  });

  it("rejects a missing required field", () => {
    assert.equal(validateSubmission(validInput({ name: "   " }), NOW).ok, false);
  });

  it("neutralizes mentions in free text so the bot cannot ping anyone", () => {
    const result = validateSubmission(
      validInput({ description: "Come! @everyone <@&123> <@456> <#789> @here" }),
      NOW,
    );
    assert.equal(result.ok, true);
    assert.doesNotMatch(result.value.eDescription, /<@|<#|@everyone|@here/);
    assert.match(result.value.eDescription, /Come!/);
  });
});
