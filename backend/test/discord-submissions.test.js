import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateSubmission, pacificToUtc } from "../discordSubmissionRules.js";

const NOW = new Date("2027-01-01T00:00:00Z");
const UNREADABLE = /Couldn't read When\. Try "Dec 1, 6-8pm" or "Fri 6:30-8pm"\./;

function validInput(overrides = {}) {
  return {
    name: "Game Night",
    when: "Mar 10 6-8pm",
    location: "Mary Gates Hall 142",
    categories: ["Social"],
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
    assert.deepEqual(result.value.eLabels, ["Social"]);
    assert.equal(result.value.rsvpUrl, undefined);
  });

  it("reads When the way officers type it, into UTC", () => {
    const tenthAt6 = ["2027-03-11T02:00:00.000Z", "2027-03-11T04:00:00.000Z"];
    for (const when of [
      "3/10/2027 6:00 PM - 8:00 PM",
      "Mar 10 6-8pm",
      "3/10 6pm-8pm",
      "March 10, 6 to 8 pm",
      "3/10 18:00-20:00",
    ]) {
      assert.deepEqual(times(when), tenthAt6, when);
    }
    assert.deepEqual(times("Mar 10, 6:30 to 8 pm"), ["2027-03-11T02:30:00.000Z", "2027-03-11T04:00:00.000Z"]);
  });

  it("tidies common typing variations before reading When", () => {
    const tenthAt6 = ["2027-03-11T02:00:00.000Z", "2027-03-11T04:00:00.000Z"];
    for (const when of ["Mar 10 6:00pm-8:00pm.", "3/10 6pm—8pm", "3-10 6-8pm", "Mar 10, 6-8pm!"]) {
      assert.deepEqual(times(when), tenthAt6, when);
    }
    assert.deepEqual(times("3/10 noon-2pm"), ["2027-03-10T20:00:00.000Z", "2027-03-10T22:00:00.000Z"]);
  });

  it("reads a start with no am or pm as morning when that's the only way it ends later", () => {
    assert.deepEqual(times("3/10 11-1pm"), ["2027-03-10T19:00:00.000Z", "2027-03-10T21:00:00.000Z"]);
    assert.deepEqual(times("3/10 9-11am"), ["2027-03-10T17:00:00.000Z", "2027-03-10T19:00:00.000Z"]);
  });

  it("asks for am or pm, or an end time, when that's what's missing", () => {
    for (const when of ["3/10 6-8", "fri 6-8"]) {
      assert.match(validateSubmission(validInput({ when }), NOW).errors.when, /Add am or pm, like 6-8pm/, when);
    }
    assert.match(validateSubmission(validInput({ when: "Mar 10 6pm" }), NOW).errors.when, /Add an end time, like Dec 1, 6-8pm/);
  });

  it("asks for am or pm on colon times that aren't clearly 24-hour", () => {
    for (const when of ["3/10 6:00-8:00", "Fri 1:00-3:00"]) {
      assert.match(validateSubmission(validInput({ when }), NOW).errors.when, /Add am or pm/, when);
    }
  });

  it("refuses a range across several days instead of moving the start to morning", () => {
    assert.match(
      validateSubmission(validInput({ when: "Mar 10-11 6-8pm" }), NOW).errors.when,
      /End time must be after the start time, on the same day/,
    );
  });

  it("reads midday ranges after a written month", () => {
    assert.deepEqual(times("Mar 10 11-1pm"), ["2027-03-10T19:00:00.000Z", "2027-03-10T21:00:00.000Z"]);
    assert.deepEqual(times("Mar 10, 12-2pm"), ["2027-03-10T20:00:00.000Z", "2027-03-10T22:00:00.000Z"]);
    assert.deepEqual(times("Mar 10 10-12pm"), ["2027-03-10T18:00:00.000Z", "2027-03-10T20:00:00.000Z"]);
  });

  it("reads day names and relative days from Pacific time", () => {
    // NOW is Thursday, Dec 31 2026, 4 PM Pacific.
    assert.deepEqual(times("Wednesday 6-8pm"), ["2027-01-07T02:00:00.000Z", "2027-01-07T04:00:00.000Z"]);
    assert.deepEqual(times("tomorrow 7-9pm"), ["2027-01-02T03:00:00.000Z", "2027-01-02T05:00:00.000Z"]);
  });

  it("uses daylight saving time after the March switch", () => {
    assert.deepEqual(times("3/20 6-8pm"), ["2027-03-21T01:00:00.000Z", "2027-03-21T03:00:00.000Z"]);
  });

  it("reads 12 AM as midnight and 12 PM as noon", () => {
    assert.deepEqual(times("3/10 12am-12pm"), ["2027-03-10T08:00:00.000Z", "2027-03-10T20:00:00.000Z"]);
  });

  it("refuses a When it can't fully read, rather than guessing", () => {
    for (const when of ["Mar 10", "6-8pm", "next week sometime", "gibberish", ""]) {
      const result = validateSubmission(validInput({ when }), NOW);
      assert.equal(result.ok, false, when);
      assert.match(result.errors.when, UNREADABLE, when);
    }
  });

  it("keeps a time earlier today on today, instead of jumping to next year", () => {
    // NOW is Dec 31 2026, 4 PM Pacific.
    const result = validateSubmission(validInput({ when: "Dec 31 1-2pm" }), NOW);
    assert.equal(result.ok, false);
    assert.match(result.errors.when, /The event must start in the future/);
    assert.deepEqual(times("Dec 31 6-8pm"), ["2027-01-01T02:00:00.000Z", "2027-01-01T04:00:00.000Z"]);
  });

  it("rejects an event in the past", () => {
    const result = validateSubmission(validInput({ when: "6/1/2026 6-8pm" }), NOW);
    assert.equal(result.ok, false);
    assert.match(result.errors.when, /future/);
  });

  it("refuses an end that isn't after the start on the same day", () => {
    for (const when of ["3/10 6pm-6pm", "3/10 10pm-1am"]) {
      const result = validateSubmission(validInput({ when }), NOW);
      assert.equal(result.ok, false, when);
      assert.match(result.errors.when, /End time must be after the start time, on the same day/, when);
    }
  });

  it("reports each problem under its own field", () => {
    const result = validateSubmission(validInput({ name: "", location: "", when: "soon", categories: [] }), NOW);
    assert.equal(result.ok, false);
    assert.deepEqual(Object.keys(result.errors).sort(), ["categories", "location", "name", "when"]);
    assert.match(result.errors.name, /Event name is required/);
  });

  it("accepts several categories, in the standard order, without repeats", () => {
    const result = validateSubmission(validInput({ categories: ["Career", "Academic", "Career"] }), NOW);
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.eLabels, ["Academic", "Career"]);
  });

  it("rejects no category, or any category outside Academic, Social, and Career", () => {
    for (const categories of [[], ["Party"], ["Social", "Party"], undefined]) {
      const result = validateSubmission(validInput({ categories }), NOW);
      assert.equal(result.ok, false, String(categories));
      assert.match(result.errors.categories, /Pick at least one category: Academic, Social, or Career/);
    }
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
