import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HOLD_DURATION_MS,
  holdDurationMs,
  holdExpiresAtMs,
  holdTotalCents,
  isHoldDeadlinePassed,
  normalizePhoneNumber,
  normalizeVenmoUsername,
  removeHoldLine,
} from "../routes/api/v1/utils/shopHolds.js";

describe("hold duration setting", () => {
  it("defaults to 15 minutes when SHOP_HOLD_MINUTES is unset or empty", () => {
    assert.equal(holdDurationMs(undefined), 15 * 60 * 1000);
    assert.equal(holdDurationMs(""), 15 * 60 * 1000);
  });

  it("uses the configured number of minutes", () => {
    assert.equal(holdDurationMs("1"), 60 * 1000);
  });

  it("fails loudly for a value that is not a positive number", () => {
    assert.throws(() => holdDurationMs("0"), /SHOP_HOLD_MINUTES must be a positive number/);
    assert.throws(() => holdDurationMs("soon"), /SHOP_HOLD_MINUTES must be a positive number/);
  });
});

describe("hold deadline", () => {
  it("expires 15 minutes after creation", () => {
    const createdAt = Date.parse("2026-10-10T12:00:00.000Z");
    assert.equal(holdExpiresAtMs(createdAt), createdAt + 15 * 60 * 1000);
    assert.equal(HOLD_DURATION_MS, 15 * 60 * 1000);
  });

  it("treats the deadline instant itself as passed, so a confirmation at the deadline is rejected", () => {
    const expiresAt = Date.parse("2026-10-10T12:15:00.000Z");
    assert.equal(isHoldDeadlinePassed(expiresAt, expiresAt - 1), false);
    assert.equal(isHoldDeadlinePassed(expiresAt, expiresAt), true);
    assert.equal(isHoldDeadlinePassed(expiresAt, expiresAt + 1), true);
  });
});

describe("hold totals", () => {
  it("sums each line's unit price times its quantity, in cents", () => {
    const lines = [
      { sku: "info-hoodie", size: "M", quantity: 2, unitPriceCents: 3200 },
      { sku: "info-tote-bag", size: "One Size", quantity: 1, unitPriceCents: 2000 },
    ];
    assert.equal(holdTotalCents(lines), 8400);
  });

  it("is zero for a hold with no lines", () => {
    assert.equal(holdTotalCents([]), 0);
  });
});

describe("removing a line from a hold", () => {
  const lines = [
    { sku: "info-hoodie", size: "M", quantity: 2, unitPriceCents: 3200 },
    { sku: "info-hoodie", size: "L", quantity: 1, unitPriceCents: 3200 },
    { sku: "info-tote-bag", size: "One Size", quantity: 1, unitPriceCents: 2000 },
  ];

  it("removes only the matching sku and size", () => {
    const { lines: remaining, removed } = removeHoldLine(lines, "info-hoodie", "M");
    assert.deepEqual(removed, lines[0]);
    assert.deepEqual(remaining, [lines[1], lines[2]]);
  });

  it("reports no removal when the sku and size are not in the hold", () => {
    const { lines: remaining, removed } = removeHoldLine(lines, "info-hoodie", "XL");
    assert.equal(removed, null);
    assert.deepEqual(remaining, lines);
  });

  it("does not remove a line that matches only the sku", () => {
    const { removed } = removeHoldLine(lines, "info-hoodie", "2XL");
    assert.equal(removed, null);
  });
});


describe("Phone number normalization", () => {
  it("removes spaces, dashes, periods, and parentheses, keeping the digits", () => {
    assert.equal(normalizePhoneNumber("(206) 555-0123"), "2065550123");
    assert.equal(normalizePhoneNumber(" 206.555.0123 "), "2065550123");
  });

  it("accepts an international number and keeps its leading +", () => {
    assert.equal(normalizePhoneNumber("+1 206 555 0123"), "+12065550123");
    assert.equal(normalizePhoneNumber("+44 20 7946 0958"), "+442079460958");
    assert.equal(normalizePhoneNumber("+86 138 0013 8000"), "+8613800138000");
  });

  it("rejects fewer than 7 digits, more than 15, a misplaced +, or other characters", () => {
    assert.equal(normalizePhoneNumber(""), null);
    assert.equal(normalizePhoneNumber("555012"), null);
    assert.equal(normalizePhoneNumber("1234567890123456"), null);
    assert.equal(normalizePhoneNumber("206+5550123"), null);
    assert.equal(normalizePhoneNumber("206-555-01a3"), null);
    assert.equal(normalizePhoneNumber(2065550123), null);
  });
});

describe("Venmo username normalization", () => {
  it("trims whitespace and removes one leading @", () => {
    assert.equal(normalizeVenmoUsername("  @jane-doe_1.x "), "jane-doe_1.x");
  });

  it("lowercases letters so one account always compares equal", () => {
    assert.equal(normalizeVenmoUsername("@Jane.Doe"), "jane.doe");
  });

  it("accepts a username of exactly 30 characters", () => {
    const thirty = "a".repeat(30);
    assert.equal(normalizeVenmoUsername(thirty), thirty);
  });

  it("rejects an empty value, a value over 30 characters, and disallowed characters", () => {
    assert.equal(normalizeVenmoUsername(""), null);
    assert.equal(normalizeVenmoUsername("   "), null);
    assert.equal(normalizeVenmoUsername("a".repeat(31)), null);
    assert.equal(normalizeVenmoUsername("jane doe"), null);
    assert.equal(normalizeVenmoUsername("jane$doe"), null);
  });

  it("rejects non-string values", () => {
    assert.equal(normalizeVenmoUsername(undefined), null);
    assert.equal(normalizeVenmoUsername(42), null);
    assert.equal(normalizeVenmoUsername({ name: "jane" }), null);
  });
});
