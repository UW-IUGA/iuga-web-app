import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateSubmission, pacificToUtc } from "../discordSubmissionRules.js";

const NOW = new Date("2027-01-01T00:00:00Z");
const WHEN_EXAMPLE = /When must look like 12\/1\/2026 6:00 PM - 8:00 PM/;

function validInput(overrides = {}) {
  return {
    name: "Game Night",
    when: "3/10/2027 6:00 PM - 8:00 PM",
    location: "Mary Gates Hall 142",
    category: "Social",
    description: "Board games and snacks.",
    ...overrides,
  };
}

function times(when) {
  const result = validateSubmission(validInput({ when }), NOW);
  assert.equal(result.ok, true, `${when}: ${result.errors}`);
  return [result.value.eStartDate.toISOString(), result.value.eEndDate.toISOString()];
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
    assert.equal(result.value.rsvpUrl, undefined);
  });

  it("accepts When with flexible spacing, capitals, minutes, and two-digit month or day", () => {
    const expected = ["2027-03-11T02:00:00.000Z", "2027-03-11T04:00:00.000Z"];
    for (const when of [
      "3/10/2027 6:00 PM - 8:00 PM",
      "3/10/2027 6 PM-8 PM",
      "3/10/2027 6:00pm - 8:00pm",
      "03/10/2027 6pm - 8pm",
      "  3/10/2027   6:00 PM  -  8:00 PM  ",
      "3/10/2027 6:00 PM – 8:00 PM",
    ]) {
      assert.deepEqual(times(when), expected, when);
    }
  });

  it("reads 12 AM as midnight and 12 PM as noon", () => {
    assert.deepEqual(times("3/10/2027 12:00 AM - 12:00 PM"), [
      "2027-03-10T08:00:00.000Z",
      "2027-03-10T20:00:00.000Z",
    ]);
    assert.deepEqual(times("12/1/2027 11:00 AM - 11:59 PM"), [
      "2027-12-01T19:00:00.000Z",
      "2027-12-02T07:59:00.000Z",
    ]);
  });

  it("rejects a malformed When with the example", () => {
    for (const when of [
      "2027-03-10 6:00 PM - 8:00 PM",
      "13/1/2027 6:00 PM - 8:00 PM",
      "2/30/2027 6:00 PM - 8:00 PM",
      "3/10/27 6:00 PM - 8:00 PM",
      "3/10/2027 18:00 - 20:00",
      "3/10/2027 13:00 PM - 8:00 PM",
      "3/10/2027 0:30 AM - 8:00 PM",
      "3/10/2027 6:00 - 8:00",
      "3/10/2027 6:60 PM - 8:00 PM",
      "3/10/2027 6:00 PM",
      "3/10/2027 6:00 PM to 8:00 PM",
      "",
    ]) {
      const result = validateSubmission(validInput({ when }), NOW);
      assert.equal(result.ok, false, when);
      assert.match(result.errors.join(" "), WHEN_EXAMPLE, when);
    }
  });

  it("rejects an event in the past", () => {
    const result = validateSubmission(validInput({ when: "6/1/2026 6:00 PM - 8:00 PM" }), NOW);
    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /future/);
  });

  it("rejects an end time that is not after the start", () => {
    for (const when of ["3/10/2027 6:00 PM - 5:00 PM", "3/10/2027 6:00 PM - 6:00 PM"]) {
      const result = validateSubmission(validInput({ when }), NOW);
      assert.equal(result.ok, false, when);
      assert.match(result.errors.join(" "), /End time must be after the start time/, when);
    }
  });

  it("rejects a category outside Academic, Social, and Career", () => {
    assert.equal(validateSubmission(validInput({ category: "Party" }), NOW).ok, false);
    assert.equal(validateSubmission(validInput({ category: "" }), NOW).ok, false);
  });

  it("rejects text over its length cap", () => {
    assert.equal(validateSubmission(validInput({ name: "x".repeat(121) }), NOW).ok, false);
    assert.equal(validateSubmission(validInput({ description: "x".repeat(1001) }), NOW).ok, false);
  });

  it("rejects a missing required field", () => {
    assert.equal(validateSubmission(validInput({ name: "   " }), NOW).ok, false);
    assert.equal(validateSubmission(validInput({ location: "" }), NOW).ok, false);
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
