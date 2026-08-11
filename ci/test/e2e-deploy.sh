#!/bin/bash
# ============================================================================
# e2e-deploy.sh — local end-to-end proof of the health-gated deploy pipeline
# ============================================================================
# What this does
#   Builds the real app image (DEPLOY_ENV=development), pushes it to a
#   throwaway local registry, and runs the EXACT shell block Jenkins executes
#   (healthGatedDeploy in ci/deploy.groovy) against a real Docker daemon with
#   a disposable Mongo 7 container. If the deploy sequence (candidate start
#   -> /readyz health gate -> live swap -> verification) passes here, the
#   same logic will work in Jenkins. Only the Jenkins-context parts (webhook
#   trigger, credential injection, GitHub status reporting) still need a real
#   Jenkins build to verify.
#
# Why a real harness when the unit tests already exist
#   ci/test/deploy-groovy.test.js stubs docker and proves the deploy LOGIC.
#   This script proves the INTEGRATION: the image really builds, node really
#   exists inside it, Mongo really connects, /readyz really answers.
#
# Safety
#   - Uses only loopback host ports: 16766 (live), 16767 (candidate),
#     5011 (registry). Never touches live ports 6666/6667/7777/8888.
#   - Every resource is prefixed iuga-e2e-* and removed on exit via trap.
#   - Test-only DB_URI/SESSION_SECRET; never touches real databases.
#
# Requirements
#   - A running Docker daemon (e.g. Docker Desktop)
#   - Ports 16766, 16767, 5011 free on the host loopback
#
# Usage
#   bash ci/test/e2e-deploy.sh        # from anywhere in the repository
# ============================================================================

set -euo pipefail

# --- Configuration ----------------------------------------------------------
# Everything is unique to this harness so it can never collide with a live
# deployment (live dev uses ports 6666/6667 and the iuga-web-dev container).
REGISTRY_PORT=5011
LIVE_PORT=16766        # the "real" host port after promotion
CANDIDATE_PORT=16767   # the temp host port while health-checking
IMAGE_NAME="iuga-web-app-e2e"
REGISTRY="127.0.0.1:${REGISTRY_PORT}"
NETWORK="iuga-e2e-net"
UPLOADS_DIR="/tmp/iuga-e2e-uploads"
CONTAINER="iuga-e2e-dev"

# Locate the repository root from this script's own path, so it can be run
# from any working directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# --- Cleanup ----------------------------------------------------------------
# Every container, network, image, and temp file this harness creates is
# removed on exit (success or failure), so repeated runs never accumulate
# state or collide with each other.
cleanup() {
    echo
    echo "=== cleanup ==="
    docker rm -f "${CONTAINER}" "${CONTAINER}-candidate" iuga-e2e-mongo iuga-e2e-registry 2>/dev/null || true
    docker network rm "${NETWORK}" 2>/dev/null || true
    docker rmi -f "${IMAGE_NAME}:local" "${REGISTRY}/${IMAGE_NAME}:local" "${REGISTRY}/${IMAGE_NAME}:last-good" 2>/dev/null || true
    rm -rf "${UPLOADS_DIR}" /tmp/iuga-e2e-deploy.sh
}
trap cleanup EXIT

# --- Preconditions ----------------------------------------------------------
# Fail fast with a helpful message instead of a wall of docker errors.
if ! docker info >/dev/null 2>&1; then
    echo "ERROR: Docker daemon is not running. Start Docker Desktop and retry." >&2
    exit 1
fi

# Refuse to run if any harness port is already taken (e.g. another e2e run).
for port in "${REGISTRY_PORT}" "${LIVE_PORT}" "${CANDIDATE_PORT}"; do
    if lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
        echo "ERROR: port ${port} is already in use. Stop the other process and retry." >&2
        exit 1
    fi
done

# Wait for a dependency to become ready, with a clear failure instead of a
# confusing downstream error. The check string is an internal constant, not
# user input, so eval is safe here.
wait_for() {
    local description="$1" timeout_seconds="$2" check="$3"
    for _ in $(seq 1 "${timeout_seconds}"); do
        if eval "${check}" >/dev/null 2>&1; then
            echo "ok: ${description}"
            return 0
        fi
        sleep 1
    done
    echo "ERROR: timed out waiting for ${description}." >&2
    exit 1
}

# --- Infrastructure: disposable registry + Mongo ----------------------------
# The deploy script pulls the image before running it, so a real registry is
# required for that pull to succeed — exactly like the Docker Hub flow.
# Mongo sits on a dedicated network so the app container can reach it by
# name instead of a host address.
mkdir -p "${UPLOADS_DIR}"
docker network create "${NETWORK}"
docker run -d --name iuga-e2e-registry --network "${NETWORK}" -p "127.0.0.1:${REGISTRY_PORT}:5000" registry:2
wait_for "local registry" 30 "curl -sf http://${REGISTRY}/v2/"
docker run -d --name iuga-e2e-mongo --network "${NETWORK}" mongo:7
wait_for "mongodb" 30 "docker exec iuga-e2e-mongo mongosh --quiet --eval 'db.runCommand({ping:1}).ok' | grep -q '^1'"

# --- Build and push the real image ------------------------------------------
# Same build shape as CI: DEPLOY_ENV=development. Pushed to the local
# registry, plus a :last-good tag to mirror tagLastGood().
cd "${REPO_ROOT}"
docker build --build-arg DEPLOY_ENV=development -t "${IMAGE_NAME}:local" .
docker tag "${IMAGE_NAME}:local" "${REGISTRY}/${IMAGE_NAME}:local"
docker push "${REGISTRY}/${IMAGE_NAME}:local"
docker tag "${IMAGE_NAME}:local" "${REGISTRY}/${IMAGE_NAME}:last-good"
docker push "${REGISTRY}/${IMAGE_NAME}:last-good"

# --- Extract the real deploy logic from ci/deploy.groovy --------------------
# Pull the `sh """` block out of healthGatedDeploy(), translate the Groovy
# escapes (\\ -> \, \$ -> $), and substitute concrete values for the
# Groovy-interpolated variables. The result is exactly what Jenkins runs,
# pointed at this harness's containers, ports, and registry.
extract_deploy_script() {
    awk '/sh """/{found=1} found{print} found && /^    """$/{exit}' ci/deploy.groovy \
        | sed '1d;$d' \
        | sed 's/\\\\/\\/g; s/\\\$/\$/g' \
        | sed \
            -e 's/\${cfg\.container}/'"${CONTAINER}"'/g' \
            -e 's/\${cfg\.tempPort}/'"${CANDIDATE_PORT}"'/g' \
            -e 's/\${cfg\.realPort}/'"${LIVE_PORT}"'/g' \
            -e 's/\${cfg\.deployEnv}/development/g' \
            -e 's#\${cfg\.uploadsDir}#'"${UPLOADS_DIR}"'#g' \
            -e 's/\${netFlag}/--network '"${NETWORK}"'/g' \
            -e 's#\${newImage}#'"${REGISTRY}/${IMAGE_NAME}:local"'#g' \
            -e 's#\${lastGoodImage}#'"${REGISTRY}/${IMAGE_NAME}:last-good"'#g'
}

extract_deploy_script > /tmp/iuga-e2e-deploy.sh
bash -n /tmp/iuga-e2e-deploy.sh  # the extracted script must parse

echo
echo "=== running the real deploy sequence ==="
DB_URI="mongodb://iuga-e2e-mongo:27017/iuga_e2e" \
SESSION_SECRET="e2e-secret" \
    bash /tmp/iuga-e2e-deploy.sh

# --- Verification -----------------------------------------------------------
echo
echo "=== verification ==="
# 1. The app answers /readyz from inside the live container — the same probe
#    the pipeline itself uses.
docker exec "${CONTAINER}" node -e 'fetch("http://127.0.0.1:7777/readyz").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' \
    && echo "PASS: /readyz answers inside the live container"

# 2. The app answers /readyz on the host loopback through the live port.
curl -fsS "http://127.0.0.1:${LIVE_PORT}/readyz" \
    && echo "PASS: /readyz answers on host loopback port ${LIVE_PORT}"

# 3. The candidate container was retired; only the live container remains.
docker ps --filter name="${CONTAINER}" --format '{{.Names}} | {{.Status}}'
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER}-candidate$"; then
    echo "FAIL: candidate container still exists after deploy." >&2
    exit 1
fi
echo "PASS: candidate retired, live container promoted"

echo
echo "ALL E2E CHECKS PASSED"
