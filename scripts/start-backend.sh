#!/usr/bin/env bash
# Local startup owns the database connection; dotenv loads the remaining settings.
# Copied environment files and inherited shell values cannot share databases.
# Shop holds use transactions, so resolved SHOP_MANUAL_CHECKOUT_EXPOSED=true
# starts the replica-set container instead of the standalone one.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-./env/.env.dev}"

# Resolve dotenv once, before choosing a database, with the same inherited-env precedence
# the backend uses. The local database URI is assigned only after this step.
if [[ "${2:-}" != "--resolved" ]]; then
    exec dotenv -e "$ENV_FILE" -- bash "$REPO_ROOT/scripts/start-backend.sh" "$ENV_FILE" --resolved
fi
if [[ "${SHOP_MANUAL_CHECKOUT_EXPOSED:-}" == "true" ]]; then
    database_script="$REPO_ROOT/scripts/start-replica-set-mongodb.sh"
else
    database_script="$REPO_ROOT/scripts/start-mongodb.sh"
fi

database_output="$(bash "$database_script")"
printf '%s\n' "$database_output"
DB_URI="$(printf '%s\n' "$database_output" | sed -n 's/^DB_URI=//p')"
if [[ -z "$DB_URI" ]]; then
    echo "[startup] could not read the database connection URI" >&2
    exit 1
fi

export DB_URI IUGA_LOCAL_DEV=1
cd "$REPO_ROOT/backend"
exec node ./bin/www.cjs
