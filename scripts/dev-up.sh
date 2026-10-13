#!/usr/bin/env bash
#
# Bring up this checkout's local MongoDB and Express backend.
#
# Safe to re-run. For the database alone, use scripts/start-mongodb.sh
# (or: cd backend && npm run docker).
#
# Usage: scripts/dev-up.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[dev-up] starting backend"
cd "$REPO_ROOT"
exec npm run backend-dev
