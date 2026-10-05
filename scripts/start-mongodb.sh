#!/usr/bin/env bash
#
# Start a local MongoDB container on a Docker-selected loopback port.
# Existing containers and their data are left in place; each invocation creates
# a new container with the next available iuga-mongo name.
#
# Usage: scripts/start-mongodb.sh (or: cd backend && npm run docker)
set -euo pipefail

IMAGE="mongo:7"
BASE_NAME="iuga-mongo"

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

names="$(docker ps -a --format '{{.Names}}')"
CONTAINER="$BASE_NAME"
suffix=2
while printf '%s\n' "$names" | grep -Fxq "$CONTAINER"; do
    CONTAINER="${BASE_NAME}-${suffix}"
    suffix=$((suffix + 1))
done

echo "[mongodb] creating container ${CONTAINER} (${IMAGE})"
docker run -d --name "$CONTAINER" -p '127.0.0.1::27017' "$IMAGE" >/dev/null

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
echo "[mongodb] To use it, run: DB_URI=mongodb://${binding}/iuga npm start"
