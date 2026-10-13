#!/usr/bin/env bash
#
# Start a single-node MongoDB replica set. Shop holds use transactions, which need one.
# scripts/start-backend.sh uses it when SHOP_MANUAL_CHECKOUT_EXPOSED=true, and the replica-set tests use it too.
# Each checkout has its own container and Docker-selected loopback port. Standalone
# containers and the legacy shared replica-set container are left untouched.
#
# Usage: scripts/start-replica-set-mongodb.sh
# Prints DB_URI for the app and SHOP_REPLSET_URI for the tests.
# Tests: SHOP_REPLSET_URI=<printed value> npm test --prefix backend
set -euo pipefail

IMAGE="mongo:7"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
CHECKOUT_ID="$(node -e 'console.log(require("node:crypto").createHash("sha256").update(process.argv[1]).digest("hex").slice(0, 16))' "$REPO_ROOT")"
CONTAINER="iuga-mongo-replset-${CHECKOUT_ID}"
PORT=27017

if ! command -v docker >/dev/null 2>&1; then
    echo "[replset] docker is not installed — install Docker Desktop or Docker Engine first." >&2
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    echo "[replset] Docker daemon is not running. Start Docker, then re-run this script." >&2
    exit 1
fi

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
    echo "[replset] creating container ${CONTAINER} (${IMAGE}, replica set rs0 on port ${PORT})"
    if ! docker run -d --name "$CONTAINER" -p "127.0.0.1::${PORT}" "$IMAGE" \
        --replSet rs0 --port "$PORT" --bind_ip_all >/dev/null; then
        docker inspect "$CONTAINER" >/dev/null 2>&1 || exit 1
    fi
fi
if [[ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER")" != "true" ]]; then
    echo "[replset] starting container ${CONTAINER}"
    docker start "$CONTAINER" >/dev/null
else
    echo "[replset] reusing container ${CONTAINER}"
fi

for _ in $(seq 1 30); do
    docker exec "$CONTAINER" mongosh --port "$PORT" --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | grep -q '^1$' && break
    sleep 1
done
if ! docker exec "$CONTAINER" mongosh --port "$PORT" --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | grep -q '^1$'; then
    echo "[replset] MongoDB container ${CONTAINER} is not accepting connections" >&2
    exit 1
fi

# Initiate the set once. rs.status() succeeds only after initiation.
if ! docker exec "$CONTAINER" mongosh --port "$PORT" --quiet --eval 'rs.status().ok' 2>/dev/null | grep -q '^1$'; then
    echo "[replset] initiating rs0"
    docker exec "$CONTAINER" mongosh --port "$PORT" --quiet --eval \
        "rs.initiate({_id: 'rs0', members: [{_id: 0, host: '127.0.0.1:${PORT}'}]}).ok" >/dev/null
fi

for _ in $(seq 1 60); do
    docker exec "$CONTAINER" mongosh --port "$PORT" --quiet --eval 'db.hello().isWritablePrimary' 2>/dev/null | grep -q '^true$' && break
    sleep 1
done
if ! docker exec "$CONTAINER" mongosh --port "$PORT" --quiet --eval 'db.hello().isWritablePrimary' 2>/dev/null | grep -q '^true$'; then
    echo "[replset] rs0 has no primary yet" >&2
    exit 1
fi

echo "[replset] replica set ready"
binding="$(docker port "$CONTAINER" "${PORT}/tcp")"
if [[ ! "$binding" =~ ^127\.0\.0\.1:([0-9]+)$ ]]; then
    echo "[replset] ${CONTAINER} did not receive a loopback-only host port" >&2
    exit 1
fi
# Docker's host port differs from the member's internal port. Connect directly to
# this single development member rather than discovering its container-only address.
echo "SHOP_REPLSET_URI=mongodb://${binding}/?replicaSet=rs0&directConnection=true"
echo "DB_URI=mongodb://${binding}/iuga?replicaSet=rs0&directConnection=true"
