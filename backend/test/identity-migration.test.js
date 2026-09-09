import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildReport } from "../identityMigrationReport.js";

// Directory rows are authoritative only when they contain an explicit userId
// and a complete issuer/tenantId/objectId tuple. Deterministic ordering and
// counts are the report's observable compatibility boundary.

const users = [
  {
    _id: "u-1",
    uEmail: " Alice@Example.edu ",
    uFirstName: "Alice",
    uLastName: "One",
    accessToken: "redacted-access-token",
    idToken: "redacted-id-token",
    arbitraryExtra: { shouldNot: "escape" },
    identity: { issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-1" },
  },
  {
    _id: "u-2",
    uEmail: "alice@example.EDU",
    uFirstName: "Alice",
    uLastName: "Two",
    identity: null,
  },
  { _id: "u-3", uEmail: "bob@example.edu", identity: { issuer: "https://issuer.example", tenantId: "tenant-a" } },
  { _id: "u-4", uEmail: "carol@example.edu", identity: { issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-4" } },
  { _id: "u-5", uEmail: "dave@example.edu", identity: { issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-5" } },
  { _id: "u-6", uEmail: "erin@example.edu", identity: null },
];

const directory = [
  { userId: "u-1", issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-1" },
  // Email is deliberately present but must not be accepted as a match.
  { email: "alice@example.edu", issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-2" },
  // Incomplete directory identity is a hold, not a mapping.
  { userId: "u-3", issuer: "https://issuer.example", tenantId: "tenant-a" },
  // The same provider identity is claimed by two users.
  { userId: "u-4", issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-shared" },
  { userId: "u-5", issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-shared" },
  // One user is claimed by two different provider identities.
  { userId: "u-5", issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-other" },
  // Unknown IDs must be held and never create a user.
  { userId: "u-unknown", issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-unknown" },
  // A separate clean one-to-one mapping remains eligible.
  { userId: "u-6", issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-6" },
  // Duplicate source rows are counted once as an assignment and reported.
  { userId: "u-1", issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-1" },
];

function reportFor(inputUsers = users, inputDirectory = directory) {
  return buildReport({ users: inputUsers, directory: inputDirectory });
}


describe("identity migration report", () => {
  test("groups emails deterministically after trimming and case normalization", () => {
    const report = reportFor();
    assert.deepEqual(report.emailGroups, [
      { normalizedEmail: "alice@example.edu", userIds: ["u-1", "u-2"] },
      { normalizedEmail: "bob@example.edu", userIds: ["u-3"] },
      { normalizedEmail: "carol@example.edu", userIds: ["u-4"] },
      { normalizedEmail: "dave@example.edu", userIds: ["u-5"] },
      { normalizedEmail: "erin@example.edu", userIds: ["u-6"] },
    ]);
    assert.deepEqual(report.counts.emailCollisions, 1);
  });

  test("accepts only a clean explicit userId-to-complete-identity mapping", () => {
    const report = reportFor();
    assert.deepEqual(report.mappings, [
      { userId: "u-6", issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-6" },
    ]);
    assert.equal(report.mappings.some((row) => row.userId === "u-1" || row.userId === "u-2"), false);
    assert.equal(report.holds.missingIdentity.includes("u-6"), false);
  });

  test("refuses email-only matches and incomplete directory identities", () => {
    const report = reportFor();
    assert.deepEqual(report.holds.emailOnly, [
      {
        index: 1,
        normalizedEmail: "alice@example.edu",
        candidateUserIds: ["u-1", "u-2"],
        identity: {
          issuer: "https://issuer.example",
          tenantId: "tenant-a",
          objectId: "oid-2",
        },
      },
    ]);
    assert.deepEqual(report.holds.missingIdentity, ["u-2", "u-3"]);
    assert.ok(report.holds.incompleteDirectory.includes("u-3"));
    assert.equal(report.mappings.some((row) => row.userId === "u-2" || row.userId === "u-3"), false);
  });
  test("holds an explicit mapping that conflicts with an existing identity", () => {
    const tenantMismatch = reportFor([users[0]], [
      { userId: "u-1", issuer: "https://issuer.example", tenantId: "tenant-b", objectId: "oid-1" },
    ]);
    const objectMismatch = reportFor([users[0]], [
      { userId: "u-1", issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-other" },
    ]);

    assert.deepEqual(tenantMismatch.mappings, []);
    assert.deepEqual(tenantMismatch.holds.identityMismatches, ["u-1"]);
    assert.deepEqual(objectMismatch.mappings, []);
    assert.deepEqual(objectMismatch.holds.identityMismatches, ["u-1"]);
  });

  test("holds unknown IDs, duplicate provider identities, and conflicting user mappings", () => {
    const report = reportFor();
    assert.deepEqual(report.holds.unknownUserIds, ["u-unknown"]);
    assert.deepEqual(report.holds.duplicateProviderIdentities, [
      { issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-shared", userIds: ["u-4", "u-5"] },
    ]);
    assert.deepEqual(report.holds.conflictingUserMappings, [
      { userId: "u-5", identities: [
        { issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-other" },
        { issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-shared" },
      ] },
    ]);
  });

  test("reports duplicate directory rows without changing stable assignment counts", () => {
    const report = reportFor();
    assert.deepEqual(report.holds.duplicateRows, [
      { userId: "u-1", issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-1", count: 2 },
    ]);
    assert.deepEqual(report.counts, {
      users: 6,
      emailGroups: 5,
      emailCollisions: 1,
      directoryRows: 9,
      completeMappings: 1,
      reviewHolds: 6,
      duplicateRows: 1,
    });
  });


  test("holds duplicate source rows even without another conflict", () => {
    const duplicateRow = {
      userId: "u-6",
      issuer: "https://issuer.example",
      tenantId: "tenant-a",
      objectId: "oid-6",
    };
    const report = reportFor([users[5]], [duplicateRow, { ...duplicateRow }]);

    assert.deepEqual(report.mappings, []);
    assert.deepEqual(report.holds.duplicateRows, [{ ...duplicateRow, count: 2 }]);
    assert.equal(report.counts.reviewHolds, 1);
  });

  test("holds users that have no authoritative directory evidence", () => {
    const report = reportFor([users[3]], []);

    assert.deepEqual(report.mappings, []);
    assert.deepEqual(report.holds.missingDirectoryEvidence, ["u-4"]);
    assert.equal(report.counts.reviewHolds, 1);
  });

  test("reports email-only evidence without overriding an exact mapping", () => {
    const report = reportFor([users[3]], [
      { userId: "u-4", issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-4" },
      { email: "carol@example.edu", issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "ignored" },
    ]);

    assert.deepEqual(report.mappings, [
      { userId: "u-4", issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-4" },
    ]);
    assert.deepEqual(report.holds.emailOnly, [
      {
        index: 1,
        normalizedEmail: "carol@example.edu",
        candidateUserIds: ["u-4"],
        identity: {
          issuer: "https://issuer.example",
          tenantId: "tenant-a",
          objectId: "ignored",
        },
      },
    ]);
  });

  test("holds provider identities duplicated across existing users", () => {
    const duplicateUser = {
      _id: "u-7",
      uEmail: "other@example.edu",
      identity: { ...users[3].identity },
    };
    const report = reportFor([users[3], duplicateUser], [
      { userId: "u-4", ...users[3].identity },
    ]);

    assert.deepEqual(report.mappings, []);
    assert.deepEqual(report.holds.duplicateProviderIdentities, [
      { ...users[3].identity, userIds: ["u-4", "u-7"] },
    ]);
  });

  test("holds a known mapping when an unknown user claims the same identity", () => {
    const identity = { ...users[3].identity };
    const report = reportFor([users[3]], [
      { userId: "u-4", ...identity },
      { userId: "u-unknown", ...identity },
    ]);

    assert.deepEqual(report.mappings, []);
    assert.deepEqual(report.holds.unknownUserIds, ["u-unknown"]);
    assert.deepEqual(report.holds.duplicateProviderIdentities, [
      { ...identity, userIds: ["u-4", "u-unknown"] },
    ]);
  });

  test("preserves repeated email-only evidence and conflicting identities", () => {
    const report = reportFor([users[3]], [
      { email: "carol@example.edu", issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "first" },
      { email: "CAROL@example.edu", issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "second" },
    ]);

    assert.deepEqual(report.holds.emailOnly, [
      {
        index: 0,
        normalizedEmail: "carol@example.edu",
        candidateUserIds: ["u-4"],
        identity: {
          issuer: "https://issuer.example",
          tenantId: "tenant-a",
          objectId: "first",
        },
      },
      {
        index: 1,
        normalizedEmail: "carol@example.edu",
        candidateUserIds: ["u-4"],
        identity: {
          issuer: "https://issuer.example",
          tenantId: "tenant-a",
          objectId: "second",
        },
      },
    ]);
    assert.equal(report.counts.reviewHolds, 1);
  });

  test("counts unmatched email-only evidence as an unowned review hold", () => {
    const report = reportFor([], [
      { email: "missing@example.edu", issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "unowned" },
    ]);

    assert.equal(report.counts.reviewHolds, 1);
  });

  test("reports malformed and incomplete directory rows by index", () => {
    const report = reportFor([users[3]], [
      {},
      { userId: 42, issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-4" },
      { userId: "u-4", issuer: "https://issuer.example" },
    ]);

    assert.deepEqual(report.holds.malformedDirectoryRows, [{ index: 0 }, { index: 1 }]);
    assert.deepEqual(report.holds.incompleteDirectoryRows, [{ index: 2, userId: "u-4" }]);
    assert.equal(report.counts.reviewHolds, 3);
  });
  test("projects only IDs, normalized emails, and exact identity values", () => {
    const report = reportFor();
    const serialized = JSON.stringify(report);
    assert.doesNotMatch(serialized, /redacted-access-token|redacted-id-token|Alice|One|Two|shouldNot|arbitraryExtra/);
    assert.deepEqual(report.users, [
      { userId: "u-1", normalizedEmail: "alice@example.edu", identity: { issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-1" } },
      { userId: "u-2", normalizedEmail: "alice@example.edu", identity: null },
      { userId: "u-3", normalizedEmail: "bob@example.edu", identity: { issuer: "https://issuer.example", tenantId: "tenant-a" } },
      { userId: "u-4", normalizedEmail: "carol@example.edu", identity: { issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-4" } },
      { userId: "u-5", normalizedEmail: "dave@example.edu", identity: { issuer: "https://issuer.example", tenantId: "tenant-a", objectId: "oid-5" } },
      { userId: "u-6", normalizedEmail: "erin@example.edu", identity: null },
    ]);
  });

  test("does not mutate user or directory fixtures", () => {
    const originalUsers = structuredClone(users);
    const originalDirectory = structuredClone(directory);
    reportFor();
    assert.deepEqual(users, originalUsers);
    assert.deepEqual(directory, originalDirectory);
  });
});
