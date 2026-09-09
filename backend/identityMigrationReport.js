const IDENTITY_KEYS = ["issuer", "tenantId", "objectId"];

function normalizedEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function identityOf(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const identity = {};
  for (const key of IDENTITY_KEYS) {
    const field = typeof value[key] === "string" ? value[key].trim() : "";
    if (field) identity[key] = field;
  }
  return Object.keys(identity).length ? identity : null;
}

function completeIdentity(identity) {
  return identity && IDENTITY_KEYS.every((key) => typeof identity[key] === "string" && identity[key].length > 0);
}

function identityKey(identity) {
  return JSON.stringify(IDENTITY_KEYS.map((key) => identity[key]));
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sortedUnique(values) {
  return [...new Set(values)].sort(compareText);
}

function compareIdentityRows(left, right) {
  const userOrder = compareText(left.userId, right.userId);
  return userOrder || compareText(identityKey(left), identityKey(right));
}

/**
 * @behavior Build a deterministic dry-run report without mutating source data.
 * @param input — existing users and independently verified directory rows
 * @returns projected mappings, review holds, and aggregate counts
 * @exceptions TypeError when either input is not an array
 */
export function buildReport({ users, directory } = {}) {
  if (!Array.isArray(users) || !Array.isArray(directory)) {
    throw new TypeError("users and directory must be arrays");
  }

  const projectedUsers = users
    .map((user) => ({
      userId: String(user?._id ?? ""),
      normalizedEmail: normalizedEmail(user?.uEmail),
      identity: identityOf(user?.identity),
    }))
    .sort((left, right) => compareText(left.userId, right.userId));
  const userById = new Map(projectedUsers.map((user) => [user.userId, user]));

  const emailMap = new Map();
  for (const user of projectedUsers) {
    if (!user.normalizedEmail) continue;
    const userIds = emailMap.get(user.normalizedEmail) ?? [];
    userIds.push(user.userId);
    emailMap.set(user.normalizedEmail, userIds);
  }
  const emailGroups = [...emailMap.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([email, userIds]) => ({
      normalizedEmail: email,
      userIds: sortedUnique(userIds),
    }));

  const completeRows = [];
  const incompleteDirectory = new Set();
  const incompleteDirectoryRows = [];
  const malformedDirectoryRows = [];
  const unknownUserIds = new Set();
  const emailOnly = [];
  for (const [index, sourceRow] of directory.entries()) {
    const hasUserId = sourceRow
      && typeof sourceRow === "object"
      && !Array.isArray(sourceRow)
      && Object.hasOwn(sourceRow, "userId");
    const userId = typeof sourceRow?.userId === "string" ? sourceRow.userId.trim() : "";
    if (!userId) {
      if (hasUserId) {
        malformedDirectoryRows.push({ index });
        continue;
      }
      const email = normalizedEmail(sourceRow?.email ?? sourceRow?.uEmail);
      if (!email) {
        malformedDirectoryRows.push({ index });
        continue;
      }
      emailOnly.push({
        index,
        normalizedEmail: email,
        candidateUserIds: sortedUnique(emailMap.get(email) ?? []),
        identity: identityOf(sourceRow),
      });
      continue;
    }
    const identity = identityOf(sourceRow);
    if (!userById.has(userId)) {
      unknownUserIds.add(userId);
      if (completeIdentity(identity)) completeRows.push({ userId, ...identity });
      else incompleteDirectoryRows.push({ index, userId });
      continue;
    }

    if (!completeIdentity(identity)) {
      incompleteDirectory.add(userId);
      incompleteDirectoryRows.push({ index, userId });
      continue;
    }
    completeRows.push({ userId, ...identity });
  }

  const rowByKey = new Map();
  for (const row of completeRows) {
    const key = JSON.stringify([row.userId, identityKey(row)]);
    const entry = rowByKey.get(key) ?? { row, count: 0 };
    entry.count += 1;
    rowByKey.set(key, entry);
  }
  const uniqueRows = [...rowByKey.values()].map(({ row }) => row).sort(compareIdentityRows);
  const duplicateRows = [...rowByKey.values()]
    .filter(({ count }) => count > 1)
    .map(({ row, count }) => ({ ...row, count }))
    .sort(compareIdentityRows);

  const providerAssignments = new Map();
  const userAssignments = new Map();
  for (const user of projectedUsers) {
    if (!completeIdentity(user.identity)) continue;
    const providerKey = identityKey(user.identity);
    const provider = providerAssignments.get(providerKey) ?? { identity: user.identity, userIds: [] };
    provider.userIds.push(user.userId);
    providerAssignments.set(providerKey, provider);
  }
  for (const row of uniqueRows) {
    const providerKey = identityKey(row);
    const provider = providerAssignments.get(providerKey) ?? { identity: identityOf(row), userIds: [] };
    provider.userIds.push(row.userId);
    providerAssignments.set(providerKey, provider);

    const identities = userAssignments.get(row.userId) ?? new Map();
    identities.set(providerKey, identityOf(row));
    userAssignments.set(row.userId, identities);
  }

  const duplicateProviderIdentities = [...providerAssignments.values()]
    .filter(({ userIds }) => sortedUnique(userIds).length > 1)
    .map(({ identity, userIds }) => ({ ...identity, userIds: sortedUnique(userIds) }))
    .sort((left, right) => compareText(identityKey(left), identityKey(right)));
  const conflictingUserMappings = [...userAssignments.entries()]
    .filter(([, identities]) => identities.size > 1)
    .map(([userId, identities]) => ({
      userId,
      identities: [...identities.values()].sort((left, right) => compareText(identityKey(left), identityKey(right))),
    }))
    .sort((left, right) => compareText(left.userId, right.userId));

  const identityMismatches = new Set();
  for (const row of uniqueRows) {
    const existing = userById.get(row.userId)?.identity;
    if (!existing) continue;
    const sharedFieldDiffers = IDENTITY_KEYS.some(
      (key) => existing[key] !== undefined && existing[key] !== row[key],
    );
    if (sharedFieldDiffers) identityMismatches.add(row.userId);
  }

  const blockedUserIds = new Set([
    ...incompleteDirectory,
    ...identityMismatches,
    ...duplicateRows.map((row) => row.userId),
    ...duplicateProviderIdentities.flatMap((entry) => entry.userIds),
    ...conflictingUserMappings.map((entry) => entry.userId),
  ]);
  const mappings = uniqueRows
    .filter((row) => userById.has(row.userId) && !blockedUserIds.has(row.userId))
    .map((row) => ({ ...row }))
    .sort((left, right) => compareText(left.userId, right.userId));
  const mappedUserIds = new Set(mappings.map((mapping) => mapping.userId));
  const missingIdentity = projectedUsers
    .filter((user) => !completeIdentity(user.identity) && !mappedUserIds.has(user.userId))
    .map((user) => user.userId);
  const directoryUserIds = new Set(uniqueRows.map((row) => row.userId));
  const missingDirectoryEvidence = projectedUsers
    .filter((user) => !directoryUserIds.has(user.userId))
    .map((user) => user.userId);
  emailOnly.sort((left, right) => left.index - right.index);

  const heldReferences = new Set([
    ...missingIdentity, ...missingDirectoryEvidence, ...incompleteDirectory, ...identityMismatches,
    ...unknownUserIds, ...duplicateRows.map((row) => row.userId),
    ...duplicateProviderIdentities.flatMap((entry) => entry.userIds),
    ...conflictingUserMappings.map((entry) => entry.userId), ...emailOnly.flatMap((entry) => entry.candidateUserIds),
    ...emailOnly.filter((entry) => entry.candidateUserIds.length === 0).map(({ index }) => `directory-row:${index}`),
    ...malformedDirectoryRows.map(({ index }) => `directory-row:${index}`),
  ]);

  return {
    users: projectedUsers,
    emailGroups,
    mappings,
    holds: {
      emailOnly, missingIdentity, missingDirectoryEvidence,
      incompleteDirectory: sortedUnique(incompleteDirectory), incompleteDirectoryRows, malformedDirectoryRows,
      identityMismatches: sortedUnique(identityMismatches),
      unknownUserIds: sortedUnique(unknownUserIds),
      duplicateProviderIdentities, conflictingUserMappings, duplicateRows,
    },
    counts: {
      users: projectedUsers.length, emailGroups: emailGroups.length,
      emailCollisions: emailGroups.filter((group) => group.userIds.length > 1).length,
      directoryRows: directory.length, completeMappings: mappings.length, reviewHolds: heldReferences.size,
      duplicateRows: duplicateRows.length,
    },
  };
}
