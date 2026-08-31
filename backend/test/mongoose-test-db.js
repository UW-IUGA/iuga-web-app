export function getTestDatabaseUri(environment = process.env) {
  const uri = environment.TEST_DB_URI?.trim();
  if (!uri) {
    throw new Error(
      "TEST_DB_URI is required for Mongoose integration tests; DB_URI is not used",
    );
  }
  return uri;
}

export async function connectTestDatabase(mongoose) {
  await mongoose.connect(getTestDatabaseUri());
}

export async function clearTestDatabase(mongoose) {
  await mongoose.connection.dropDatabase();
}

export async function cleanupTestDatabase(mongoose) {
  try {
    if (mongoose.connection.readyState === 1) {
      await clearTestDatabase(mongoose);
    }
  } finally {
    await disconnectTestDatabase(mongoose);
  }
}

export async function disconnectTestDatabase(mongoose) {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
