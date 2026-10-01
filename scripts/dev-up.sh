#!/usr/bin/env bash
#
# Bring up the local development backend: MongoDB, then the Express server.
#
#   1. Ensure the local MongoDB container is running (scripts/start-mongodb.sh).
#   2. Start the Express backend on :7777 (Ctrl-C to stop).
#
# Safe to re-run. For the database alone, use scripts/start-mongodb.sh
# (or: cd backend && npm run docker).
#
# Usage: scripts/dev-up.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$REPO_ROOT/scripts/start-mongodb.sh"

echo "[dev-up] starting backend on :7777 (Ctrl-C to stop)"
cd "$REPO_ROOT"
exec npm run backend-dev
