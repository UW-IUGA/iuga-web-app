#!/usr/bin/env bash
#
# Bring up the local development backend: MongoDB, then the Express server.
#
#   1. Ensure the local MongoDB container is running (scripts/start-mongodb.sh).
#   2. Start the Express backend on its selected local port
#
# Safe to re-run. For the database alone, use scripts/start-mongodb.sh
# (or: cd backend && npm run docker).
#
# Usage: scripts/dev-up.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

mongodb_output="$("$REPO_ROOT/scripts/start-mongodb.sh")"
printf '%s\n' "$mongodb_output"
DB_URI="$(printf '%s\n' "$mongodb_output" | sed -n 's/.*To use it, run: DB_URI=\([^ ]*\) npm start.*/\1/p')"
if [[ -z "$DB_URI" ]]; then
    echo "[dev-up] could not read the MongoDB connection URI" >&2
    exit 1
fi
export DB_URI

echo "[dev-up] starting backend"
cd "$REPO_ROOT"
exec npm run backend-dev
