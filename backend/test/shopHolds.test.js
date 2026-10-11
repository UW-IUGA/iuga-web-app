import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PER_STUDENT_LIMIT,
  HOLD_DURATION_MS,
  holdExpiresAtMs,
  holdTotalCents,
  isHoldDeadlinePassed,
  normalizeVenmoUsername,
  perStudentLimitFor,
  removeHoldLine,
} from "../routes/api/v1/utils/shopHolds.js";

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

describe("per-student limit", () => {
  it("defaults to 1 when no limit document exists", () => {
    assert.equal(DEFAULT_PER_STUDENT_LIMIT, 1);
    assert.equal(perStudentLimitFor(null), 1);
    assert.equal(perStudentLimitFor(undefined), 1);
  });

  it("uses the stored limit when one exists", () => {
    assert.equal(perStudentLimitFor({ perStudentLimit: 3 }), 3);
  });
});

describe("Venmo username normalization", () => {
  it("trims whitespace and removes one leading @", () => {
    assert.equal(normalizeVenmoUsername("  @jane-doe_1.x "), "jane-doe_1.x");
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
