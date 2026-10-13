#!/usr/bin/env bash
# Local startup owns the database connection; dotenv loads the remaining settings.
# Copied environment files and inherited shell values cannot share databases.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-./env/.env.dev}"

mongodb_output="$(bash "$REPO_ROOT/scripts/start-mongodb.sh")"
printf '%s\n' "$mongodb_output"
DB_URI="$(printf '%s\n' "$mongodb_output" | sed -n 's/^DB_URI=//p')"
if [[ -z "$DB_URI" ]]; then
    echo "[startup] could not read the MongoDB connection URI" >&2
    exit 1
fi

export DB_URI IUGA_LOCAL_DEV=1
cd "$REPO_ROOT/backend"
exec dotenv -e "$ENV_FILE" node ./bin/www.cjs
