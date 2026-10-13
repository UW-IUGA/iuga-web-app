#!/usr/bin/env bash
#
# Start a single-node MongoDB replica set for the shop transaction tests (ADR-0006 Gate B).
# Separate from scripts/start-mongodb.sh, which stays a standalone development database,
# so existing worktrees are unaffected.
#
# Usage: scripts/start-replica-set-mongodb.sh
# Then:  SHOP_REPLSET_URI=<printed value> npm test --prefix backend
set -euo pipefail

IMAGE="mongo:7"
CONTAINER="iuga-mongo-replset"
PORT=27018
URI="mongodb://127.0.0.1:${PORT}/?replicaSet=rs0"

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
    docker run -d --name "$CONTAINER" -p "127.0.0.1:${PORT}:${PORT}" "$IMAGE" \
        --replSet rs0 --port "$PORT" --bind_ip_all >/dev/null
elif [[ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER")" != "true" ]]; then
    echo "[replset] starting container ${CONTAINER}"
    docker start "$CONTAINER" >/dev/null
else
    echo "[replset] reusing container ${CONTAINER}"
fi

for _ in $(seq 1 30); do
    docker exec "$CONTAINER" mongosh --port "$PORT" --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | grep -q '^1$' && break
    sleep 1
done

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
echo "SHOP_REPLSET_URI=${URI}"
