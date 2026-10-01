#!/usr/bin/env bash
#
# Ensure the local development MongoDB container is running.
#
#   1. Start Docker if the daemon is not running (Docker Desktop on macOS).
#   2. Reject existing containers without a loopback-only MongoDB port binding.
#   3. Stop the Homebrew "mongodb-community" service when it is running, because
#      it binds 127.0.0.1:27017 and would shadow the container.
#   4. Create or start the "iuga-mongo" container (mongo:7) on 127.0.0.1:27017 —
#      the address backend/env/.env.dev points DB_URI at.
#
# Safe to re-run: every step checks the current state first.
#
# Usage: scripts/start-mongodb.sh   (or: cd backend && npm run docker)
set -euo pipefail

CONTAINER="iuga-mongo"
IMAGE="mongo:7"
MONGO_PORT=27017

# 0. Docker CLI --------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
    echo "[mongodb] docker is not installed — install Docker Desktop or Docker Engine first." >&2
    exit 1
fi

# 1. Docker daemon -----------------------------------------------------------
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

# 2. Check saved bindings even when the container is stopped -----------------
container_exists=false
if docker inspect "$CONTAINER" >/dev/null 2>&1; then
    container_exists=true
    if ! bindings="$(docker inspect -f '{{range index .HostConfig.PortBindings "27017/tcp"}}{{.HostIp}} {{.HostPort}}{{println}}{{end}}' "$CONTAINER")" \
        || ! printf '%s\n' "$bindings" | awk -v port="$MONGO_PORT" '
            NF != 2 || $1 != "127.0.0.1" || $2 != port { unsafe = 1 }
            END { exit (NR == 0 || unsafe) }
        '; then
        echo "[mongodb] ${CONTAINER} has unsafe or missing MongoDB port bindings; expected only 127.0.0.1:${MONGO_PORT}." >&2
        echo "[mongodb] Back up and preserve MongoDB data, then manually correct the binding to 127.0.0.1:${MONGO_PORT}:${MONGO_PORT} (see docs/BACKEND.md). No containers or Homebrew services were changed." >&2
        exit 1
    fi
fi

# 3. Homebrew MongoDB would shadow the container on 127.0.0.1 ---------------
if command -v brew >/dev/null 2>&1 \
    && brew services list 2>/dev/null | awk '$1 == "mongodb-community" && $2 == "started" { found = 1 } END { exit !found }'; then
    echo "[mongodb] stopping Homebrew mongodb-community (it shadows ${CONTAINER} on 127.0.0.1:${MONGO_PORT})"
    brew services stop mongodb-community >/dev/null
fi

# 4. MongoDB container -------------------------------------------------------
if [ "$container_exists" = "false" ]; then
    echo "[mongodb] creating container ${CONTAINER} (${IMAGE})"
    docker run -d --name "$CONTAINER" -p "127.0.0.1:${MONGO_PORT}:${MONGO_PORT}" "$IMAGE" >/dev/null
elif [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER")" != "true" ]; then
    echo "[mongodb] starting container ${CONTAINER}"
    docker start "$CONTAINER" >/dev/null
fi

for _ in $(seq 1 30); do
    docker exec "$CONTAINER" mongosh --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | grep -q '^1$' && break
    sleep 1
done
if ! docker exec "$CONTAINER" mongosh --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | grep -q '^1$'; then
    echo "[mongodb] MongoDB container ${CONTAINER} is not accepting connections" >&2
    exit 1
fi
echo "[mongodb] MongoDB ready on 127.0.0.1:${MONGO_PORT}"
