import { open, readFile, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { buildReport } from "../identityMigrationReport.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, "../..");


function reportError(reportCode, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.reportCode = reportCode;
  return error;
}

function safeReportCode(error) {
  return typeof error?.reportCode === "string"
    ? error.reportCode
    : "unexpected_error";
}

/**
 * @behavior Write one private report outside the repository without overwriting.
 * @param report — JSON-safe report returned by buildReport
 * @param outputPath — absolute operator-selected destination
 * @param options — repository boundary used to reject in-repository output
 * @returns nothing after the complete report is written and closed
 * @exceptions Error for invalid paths, existing files, serialization, or writes
 */
export async function writeReport(
  report,
  outputPath,
  { repositoryRoot = REPOSITORY_ROOT } = {},
) {
  if (!path.isAbsolute(outputPath)) {
    throw reportError("output_path_invalid", "output path must be absolute");
  }

  const target = path.resolve(outputPath);
  let root;
  let parent;
  try {
    root = await realpath(path.resolve(repositoryRoot));
    parent = await realpath(path.dirname(target));
  } catch (error) {
    throw reportError("output_path_invalid", "output parent is unavailable", error);
  }
  const relative = path.relative(root, path.join(parent, path.basename(target)));
  const insideRepository = relative === ""
    || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
  if (insideRepository) {
    throw reportError("output_path_invalid", "output must be outside repository");
  }

  let serialized;
  try {
    serialized = JSON.stringify(report, null, 2);
  } catch (error) {
    throw reportError("output_serialize_failed", "report cannot be serialized", error);
  }
  if (typeof serialized !== "string") {
    throw reportError("output_serialize_failed", "report cannot be serialized");
  }

  let handle;
  try {
    handle = await open(target, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw reportError("output_exists", "output already exists; overwrite refused", error);
    }
    throw reportError("output_write_failed", "output file could not be created", error);
  }

  let failure;
  try {
    await handle.writeFile(`${serialized}\n`, "utf8");
    await handle.chmod(0o600);
  } catch (error) {
    failure = reportError("output_write_failed", "report output failed", error);
  }

  try {
    await handle.close();
  } catch (error) {
    failure ??= reportError("output_write_failed", "report output could not be closed", error);
  }
  if (failure) {
    try {
      await unlink(target);
    } catch (error) {
      throw reportError(
        "output_cleanup_failed",
        "failed report output could not be removed",
        error,
      );
    }
    throw failure;
  }
}

/**
 * @behavior Read the minimum user projection without model or index initialization.
 * @param dbUri — operator-provided MongoDB connection string
 * @param options — injectable connection factory for focused tests
 * @returns raw user records needed by buildReport
 * @exceptions Error with a safe report code when configuration or reading fails
 */
export async function loadUsers(
  dbUri,
  { createConnection = (uri, options) => mongoose.createConnection(uri, options) } = {},
) {
  if (typeof dbUri !== "string" || !dbUri.trim()) {
    throw reportError("database_configuration_invalid", "DB_URI is required");
  }

  let connection;
  try {
    connection = createConnection(dbUri, {
      autoCreate: false,
      autoIndex: false,
    });
  } catch (error) {
    throw reportError("database_unavailable", "database connection failed", error);
  }

  let users;
  let failure;
  try {
    await connection.asPromise();
  } catch (error) {
    failure = reportError("database_unavailable", "database connection failed", error);
  }
  if (!failure) {
    try {
      users = await connection
        .collection("users")
        .find({}, { projection: { _id: 1, uEmail: 1, identity: 1 } })
        .toArray();
    } catch (error) {
      failure = reportError("database_read_failed", "user report query failed", error);
    }
  }

  try {
    await connection.close();
  } catch (error) {
    failure ??= reportError("database_close_failed", "database connection close failed", error);
  }
  if (failure) throw failure;
  return users;
}

function parseArgs(argv) {
  let outputPath;
  let directoryPath;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output" && !outputPath) {
      outputPath = argv[++index];
    } else if (argument === "--directory" && !directoryPath) {
      directoryPath = argv[++index];
    } else {
      throw reportError("invalid_arguments", "unknown or malformed arguments");
    }
  }
  if (
    !outputPath
    || !path.isAbsolute(outputPath)
    || (directoryPath !== undefined && !directoryPath)
  ) {
    throw reportError("invalid_arguments", "--output requires an absolute path");
  }
  return { outputPath, directoryPath };
}

async function readDirectoryFile(directoryPath) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(directoryPath, "utf8"));
  } catch (error) {
    throw reportError(
      "directory_input_invalid",
      "directory JSON is malformed or unreadable",
      error,
    );
  }
  if (!Array.isArray(parsed)) {
    throw reportError("directory_input_invalid", "directory JSON must be an array");
  }
  return parsed;
}

/**
 * @behavior Orchestrate one report-only command with injectable I/O boundaries.
 * @param input — CLI arguments, environment, repository root, and dependencies
 * @returns safe aggregate counts for operator output
 * @exceptions Error with a non-secret report code for every failure boundary
 */
export async function runReport({
  argv = [],
  env = {},
  repositoryRoot = REPOSITORY_ROOT,
  dependencies = {},
} = {}) {
  const { outputPath, directoryPath } = parseArgs(argv);
  const readDirectory = dependencies.readDirectory ?? readDirectoryFile;
  const loadUserRecords = dependencies.loadUsers ?? loadUsers;
  const writeReportFile = dependencies.writeReport ?? writeReport;

  const directory = directoryPath ? await readDirectory(directoryPath) : [];
  const users = await loadUserRecords(env.DB_URI);
  const report = buildReport({ users, directory });
  await writeReportFile(report, outputPath, { repositoryRoot });
  return {
    users: report.counts.users,
    mappings: report.counts.completeMappings,
    reviewHolds: report.counts.reviewHolds,
  };
}

async function main() {
  const result = await runReport({
    argv: process.argv.slice(2),
    env: process.env,
  });
  console.log(
    `identity migration report written: users=${result.users} `
    + `mappings=${result.mappings} holds=${result.reviewHolds}`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`identity migration report failed: ${safeReportCode(error)}`);
    process.exitCode = 1;
  });
}
