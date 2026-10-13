#!/usr/bin/env bash
#
# Start or reuse this checkout's MongoDB on a Docker-selected loopback port.
# The checkout path determines its container name, keeping worktrees isolated
# while preserving their database data across restarts.
#
# Usage: scripts/start-mongodb.sh (or: cd backend && npm run docker)
set -euo pipefail

IMAGE="mongo:7"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
CHECKOUT_ID="$(node -e 'console.log(require("node:crypto").createHash("sha256").update(process.argv[1]).digest("hex").slice(0, 16))' "$REPO_ROOT")"
CONTAINER="iuga-mongo-${CHECKOUT_ID}"

if ! command -v docker >/dev/null 2>&1; then
    echo "[mongodb] docker is not installed — install Docker Desktop or Docker Engine first." >&2
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    echo "[mongodb] Docker daemon is not running."
    if [ "$(uname -s)" = "Darwin" ]; then
        echo "[mongodb] starting Docker Desktop..."
        open -a Docker
    else
        echo "[mongodb] start Docker, then re-run this script." >&2
        exit 1
    fi
    for _ in $(seq 1 60); do
        docker info >/dev/null 2>&1 && break
        sleep 1
    done
    if ! docker info >/dev/null 2>&1; then
        echo "[mongodb] Docker daemon did not come up" >&2
        exit 1
    fi
fi

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
    echo "[mongodb] creating container ${CONTAINER} (${IMAGE})"
    # Another startup in the same checkout may create it first.
    if ! docker run -d --name "$CONTAINER" -p '127.0.0.1::27017' "$IMAGE" >/dev/null; then
        docker inspect "$CONTAINER" >/dev/null 2>&1 || exit 1
    fi
fi
if [[ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER")" != "true" ]]; then
    echo "[mongodb] starting container ${CONTAINER}"
    docker start "$CONTAINER" >/dev/null
else
    echo "[mongodb] reusing container ${CONTAINER}"
fi

for _ in $(seq 1 30); do
    docker exec "$CONTAINER" mongosh --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | grep -q '^1$' && break
    sleep 1
done
if ! docker exec "$CONTAINER" mongosh --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | grep -q '^1$'; then
    echo "[mongodb] MongoDB container ${CONTAINER} is not accepting connections" >&2
    exit 1
fi

binding="$(docker port "$CONTAINER" 27017/tcp)"
if [[ ! "$binding" =~ ^127\.0\.0\.1:([0-9]+)$ ]]; then
    echo "[mongodb] ${CONTAINER} did not receive a loopback-only host port" >&2
    exit 1
fi
echo "[mongodb] MongoDB ready on ${binding}"
echo "DB_URI=mongodb://${binding}/iuga"
