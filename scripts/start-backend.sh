#!/usr/bin/env bash
# Local startup owns the database connection; dotenv loads the remaining settings.
# Copied environment files and inherited shell values cannot share databases.
# It always starts the replica-set container: shop holds and officer order review use
# transactions, whatever SHOP_MANUAL_CHECKOUT_EXPOSED says about opening checkout.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-./env/.env.dev}"

# Resolve dotenv once, with the same inherited-env precedence the backend uses.
# The local database URI is assigned only after this step.
if [[ "${2:-}" != "--resolved" ]]; then
    exec dotenv -e "$ENV_FILE" -- bash "$REPO_ROOT/scripts/start-backend.sh" "$ENV_FILE" --resolved
fi

database_output="$(bash "$REPO_ROOT/scripts/start-replica-set-mongodb.sh")"
printf '%s\n' "$database_output"
DB_URI="$(printf '%s\n' "$database_output" | sed -n 's/^DB_URI=//p')"
if [[ -z "$DB_URI" ]]; then
    echo "[startup] could not read the database connection URI" >&2
    exit 1
fi

export DB_URI IUGA_LOCAL_DEV=1

# Opt-in local seed for the Orders dashboard. --if-empty keeps restarts from resetting changes
# made to seeded orders. A failed seed stops startup, so the error is not hidden.
if [[ "${SEED_SHOP:-}" == "1" ]]; then
    node "$REPO_ROOT/backend/scripts/seed-shop-orders.mjs" --if-empty
fi

cd "$REPO_ROOT/backend"
exec node ./bin/www.cjs
