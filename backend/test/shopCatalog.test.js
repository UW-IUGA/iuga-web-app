import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expiresAtSeconds,
  publicCatalog,
  resolveCartLines,
  saleStateAt,
  shopCatalog,
} from "../routes/api/v1/utils/shopCatalog.js";

describe("shopCatalog data integrity", () => {
  it("proves the shipped catalog is internally valid and conforms to expected structure", () => {
    assert.equal(typeof shopCatalog.dropId, "string");
    assert.ok(shopCatalog.dropId.length > 0);

    assert.equal(typeof shopCatalog.catalogVersion, "string");
    assert.ok(shopCatalog.catalogVersion.length > 0);

    // Three-letter currency code (e.g. "usd")
    assert.match(shopCatalog.currency, /^[a-z]{3}$/);

    // Dates must parse and closesAt must be strictly after opensAt
    const opensAtMs = Date.parse(shopCatalog.opensAt);
    const closesAtMs = Date.parse(shopCatalog.closesAt);
    assert.ok(!Number.isNaN(opensAtMs), "opensAt must parse as valid date");
    assert.ok(!Number.isNaN(closesAtMs), "closesAt must parse as valid date");
    assert.ok(closesAtMs > opensAtMs, "closesAt must be after opensAt");

    // Items array validation
    assert.ok(Array.isArray(shopCatalog.items), "items must be an array");
    assert.ok(shopCatalog.items.length > 0, "items must not be empty");

    const skus = new Set();
    for (const item of shopCatalog.items) {
      assert.equal(typeof item.sku, "string");
      assert.ok(item.sku.length > 0, "sku must not be empty");
      assert.ok(!skus.has(item.sku), `duplicate sku found: ${item.sku}`);
      skus.add(item.sku);

      assert.equal(typeof item.name, "string");
      assert.ok(item.name.length > 0, "item name must not be empty");

      assert.ok(Array.isArray(item.sizes), "sizes must be an array");
      assert.ok(item.sizes.length >= 1, `item ${item.sku} must have at least one size`);
      for (const size of item.sizes) {
        assert.equal(typeof size, "string");
        assert.ok(size.length > 0, "size string must not be empty");
      }

      assert.ok(
        Number.isSafeInteger(item.unitAmount) && item.unitAmount > 0,
        `unitAmount for ${item.sku} must be a positive integer in cents`,
      );
    }
  });
});

describe("saleStateAt", () => {
  const opensMs = Date.parse(shopCatalog.opensAt);
  const closesMs = Date.parse(shopCatalog.closesAt);

  it("determines sale state correctly before, during, and after the sale window", () => {
    // Before window
    assert.equal(saleStateAt(shopCatalog, opensMs - 1), "scheduled");

    // Exact boundary at opensAt
    assert.equal(saleStateAt(shopCatalog, opensMs), "open");

    // Mid-window
    assert.equal(saleStateAt(shopCatalog, opensMs + 1000), "open");

    // Just before closesAt
    assert.equal(saleStateAt(shopCatalog, closesMs - 1), "open");

    // Exact boundary at closesAt
    assert.equal(saleStateAt(shopCatalog, closesMs), "closed");

    // After closesAt
    assert.equal(saleStateAt(shopCatalog, closesMs + 1000), "closed");
  });
});

describe("publicCatalog", () => {
  it("projects public catalog with sale state and preserves item ordering", () => {
    const nowMs = Date.parse(shopCatalog.opensAt) + 10000;
    const pub = publicCatalog(shopCatalog, nowMs);

    assert.equal(pub.dropId, shopCatalog.dropId);
    assert.equal(pub.catalogVersion, shopCatalog.catalogVersion);
    assert.equal(pub.currency, shopCatalog.currency);
    assert.equal(pub.opensAt, shopCatalog.opensAt);
    assert.equal(pub.closesAt, shopCatalog.closesAt);
    assert.equal(pub.saleState, "open");

    assert.equal(pub.items.length, 5);
    assert.deepEqual(
      pub.items.map((i) => i.sku),
      [
        "info-hoodie",
        "info-pullover",
        "info-baseball-tee",
        "info-simple-tee",
        "info-tote-bag",
      ],
    );

    for (let idx = 0; idx < pub.items.length; idx++) {
      const source = shopCatalog.items[idx];
      const projected = pub.items[idx];
      assert.deepEqual(projected, {
        sku: source.sku,
        name: source.name,
        sizes: source.sizes,
        unitAmount: source.unitAmount,
      });
    }
  });
});

describe("expiresAtSeconds", () => {
  const closesMs = Date.parse(shopCatalog.closesAt);

  it("caps checkout expiration at 23 hours or 30 minutes after sale closes", () => {
    // When far from sale close, expires in exactly 23 hours
    const earlyNowMs = Date.parse(shopCatalog.opensAt) + 24 * 3600 * 1000;
    const expectedEarly = Math.floor((earlyNowMs + 23 * 3600 * 1000) / 1000);
    assert.equal(expiresAtSeconds(shopCatalog, earlyNowMs), expectedEarly);

    // When near sale close (e.g. 10 minutes before close), 23h would overshoot close+30m
    const lateNowMs = closesMs - 10 * 60 * 1000;
    const expectedLate = Math.floor((closesMs + 30 * 60 * 1000) / 1000);
    assert.equal(expiresAtSeconds(shopCatalog, lateNowMs), expectedLate);
  });
});

describe("resolveCartLines - valid cart resolution", () => {
  it("resolves valid cart items to line items with catalog prices and names", () => {
    const cart = [
      { sku: "info-hoodie", size: "L", quantity: 2 },
      { sku: "info-tote-bag", size: "One Size", quantity: 1 },
    ];

    const result = resolveCartLines(shopCatalog, cart);
    assert.equal(result.ok, true);
    assert.deepEqual(result.lines, [
      {
        sku: "info-hoodie",
        name: "INFO Hoodie",
        size: "L",
        quantity: 2,
        unitAmount: 4500,
      },
      {
        sku: "info-tote-bag",
        name: "INFO Tote Bag",
        size: "One Size",
        quantity: 1,
        unitAmount: 2000,
      },
    ]);
  });
});

describe("resolveCartLines - array structure validation", () => {
  it("rejects non-array, empty array, or cart exceeding 100 items", () => {
    const nonArrays = [null, undefined, "cart", 123, {}, false];
    for (const invalid of nonArrays) {
      const res = resolveCartLines(shopCatalog, invalid);
      assert.equal(res.ok, false);
      assert.equal(typeof res.message, "string");
    }

    const emptyRes = resolveCartLines(shopCatalog, []);
    assert.equal(emptyRes.ok, false);
    assert.equal(typeof emptyRes.message, "string");

    const oversized = Array.from({ length: 101 }, () => ({
      sku: "info-hoodie",
      size: "M",
      quantity: 1,
    }));
    const overRes = resolveCartLines(shopCatalog, oversized);
    assert.equal(overRes.ok, false);
    assert.equal(typeof overRes.message, "string");
  });

  it("rejects item entries that are not plain objects", () => {
    const badEntries = [
      [null],
      [undefined],
      ["string-entry"],
      [123],
      [[]],
    ];
    for (const badCart of badEntries) {
      const res = resolveCartLines(shopCatalog, badCart);
      assert.equal(res.ok, false);
      assert.equal(typeof res.message, "string");
    }
  });
});

describe("resolveCartLines - field type and quantity validation", () => {
  it("rejects non-string sku or size", () => {
    const badSku = [{ sku: 123, size: "M", quantity: 1 }];
    const resSku = resolveCartLines(shopCatalog, badSku);
    assert.equal(resSku.ok, false);
    assert.equal(typeof resSku.message, "string");

    const badSize = [{ sku: "info-hoodie", size: 123, quantity: 1 }];
    const resSize = resolveCartLines(shopCatalog, badSize);
    assert.equal(resSize.ok, false);
    assert.equal(typeof resSize.message, "string");
  });

  it("rejects non-positive, non-integer, or unsafe quantities", () => {
    const invalidQuantities = [
      "1",
      0,
      -1,
      1.5,
      NaN,
      Infinity,
      -Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      null,
      undefined,
      true,
    ];

    for (const quantity of invalidQuantities) {
      const cart = [{ sku: "info-hoodie", size: "M", quantity }];
      const res = resolveCartLines(shopCatalog, cart);
      assert.equal(
        res.ok,
        false,
        `Expected rejection for quantity: ${String(quantity)}`,
      );
      assert.equal(typeof res.message, "string");
    }
  });
});

describe("resolveCartLines - sku and size validation", () => {
  it("rejects unknown sku and names the offending sku in the message", () => {
    const badSkuCart = [
      { sku: "info-hoodie", size: "M", quantity: 1 },
      { sku: "nonexistent-item", size: "M", quantity: 1 },
    ];
    const res = resolveCartLines(shopCatalog, badSkuCart);
    assert.equal(res.ok, false);
    assert.ok(
      res.message.includes("nonexistent-item"),
      `Expected message to name offending sku, got: "${res.message}"`,
    );
  });

  it("rejects size not offered for item and names the item and size in the message", () => {
    const badSizeCart = [
      { sku: "info-tote-bag", size: "XL", quantity: 1 },
    ];
    const res = resolveCartLines(shopCatalog, badSizeCart);
    assert.equal(res.ok, false);
    assert.ok(
      res.message.includes("XL"),
      `Expected message to name offending size, got: "${res.message}"`,
    );
    assert.ok(
      res.message.includes("INFO Tote Bag") || res.message.includes("info-tote-bag"),
      `Expected message to name offending item, got: "${res.message}"`,
    );
  });
});

describe("resolveCartLines - duplicate consolidation and quantity safety", () => {
  it("consolidates duplicate sku+size entries by summing their quantities", () => {
    const cart = [
      { sku: "info-hoodie", size: "M", quantity: 2 },
      { sku: "info-simple-tee", size: "S", quantity: 1 },
      { sku: "info-hoodie", size: "M", quantity: 3 },
    ];
    const res = resolveCartLines(shopCatalog, cart);
    assert.equal(res.ok, true);
    assert.equal(res.lines.length, 2);
    assert.deepEqual(res.lines[0], {
      sku: "info-hoodie",
      name: "INFO Hoodie",
      size: "M",
      quantity: 5,
      unitAmount: 4500,
    });
    assert.deepEqual(res.lines[1], {
      sku: "info-simple-tee",
      name: "INFO Simple Tee",
      size: "S",
      quantity: 1,
      unitAmount: 2500,
    });
  });

  it("rejects when the consolidated quantity is not a safe integer", () => {
    const cart = [
      { sku: "info-hoodie", size: "M", quantity: Number.MAX_SAFE_INTEGER - 1 },
      { sku: "info-hoodie", size: "M", quantity: 2 },
    ];
    const res = resolveCartLines(shopCatalog, cart);
    assert.equal(res.ok, false);
    assert.equal(typeof res.message, "string");
  });
});

describe("resolveCartLines - provider limits and amount integrity", () => {
  it("rejects when a single line total exceeds provider maximum of 99999999 cents", () => {
    // info-hoodie is 4500 cents; 22223 * 4500 = 100,003,500 cents > 99,999,999
    const cart = [{ sku: "info-hoodie", size: "M", quantity: 22223 }];
    const res = resolveCartLines(shopCatalog, cart);
    assert.equal(res.ok, false);
    assert.equal(typeof res.message, "string");
    assert.ok(
      res.message.toLowerCase().includes("maximum") ||
        res.message.toLowerCase().includes("limit") ||
        res.message.toLowerCase().includes("exceed"),
      `Expected limit error message, got: ${res.message}`,
    );
  });

  it("rejects when the overall cart total exceeds provider maximum of 99999999 cents", () => {
    // Two lines, each within individual limit, but sum exceeds 99,999,999
    // info-hoodie: 15000 * 4500 = 67,500,000 cents
    // info-pullover: 10000 * 4000 = 40,000,000 cents
    // Total: 107,500,000 cents
    const cart = [
      { sku: "info-hoodie", size: "M", quantity: 15000 },
      { sku: "info-pullover", size: "M", quantity: 10000 },
    ];
    const res = resolveCartLines(shopCatalog, cart);
    assert.equal(res.ok, false);
    assert.equal(typeof res.message, "string");
  });

  it("always takes unitAmount from the catalog, ignoring client-supplied prices", () => {
    const spoofedCart = [
      {
        sku: "info-hoodie",
        size: "M",
        quantity: 1,
        unitAmount: 10,
        price: 5,
        amount: 1,
      },
    ];
    const res = resolveCartLines(shopCatalog, spoofedCart);
    assert.equal(res.ok, true);
    assert.equal(res.lines[0].unitAmount, 4500);
    assert.equal(res.lines[0].price, undefined);
    assert.equal(res.lines[0].amount, undefined);
  });
});
