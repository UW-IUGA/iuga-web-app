// ci/deploy.groovy
/*
Purpose: DRY the Docker build + push + health-gated deploy shared by the per-env Jenkinsfiles
         (dev.jenkinsfile, staging.jenkinsfile, prod.jenkinsfile). Loaded via `load 'ci/deploy.groovy'`,
         so all build/push/deploy logic lives here exactly once and the pipelines cannot drift
         (e.g. the earlier bug where staging mounted the prod uploads directory).
Authentication/Authorization Requirements: N/A (pipeline helper, runs on the Jenkins agent)

Expected Request Information (<r> indicates a required field):
- cfg (Map, required): image, deployEnv, container, tempPort, realPort, uploadsDir, network

Expected Response Information:
- return N/A (side effects: images built/pushed; candidate health-checked; live swap or rollback)
*/


// Build an immutable, build-numbered image tag.
void buildImage(Map cfg) {
    sh "docker build . -t \"${cfg.image}:${env.BUILD_NUMBER}\" --build-arg DEPLOY_ENV=${cfg.deployEnv}"
}

// Push the build-numbered image to the registry.
void pushImage(Map cfg) {
    sh "docker push ${cfg.image}:${env.BUILD_NUMBER}"
}

// Health-gated deploy: start the new build as a candidate on a temp port, health
// check it before touching the live container, swap only if healthy, and roll
// back to :last-good if the post-swap verification fails. A broken build never
// takes the site down — the previous working container keeps serving.
void healthGatedDeploy(Map cfg) {
    def newImage = "${cfg.image}:${env.BUILD_NUMBER}"
    def lastGoodImage = "${cfg.image}:last-good"
    def netFlag = cfg.network ? "--network iuga-server-config_default" : ""
    sh """
    CANDIDATE="${cfg.container}-candidate"
    CONTAINER="${cfg.container}"
    HEALTH_URL="http://127.0.0.1:${cfg.tempPort}/readyz"
    DEPLOY_START=\$(date +%s)

    docker pull "${newImage}"
    docker rm -f "\${CANDIDATE}" || true
    docker run -d --name "\${CANDIDATE}" \\
      -p "127.0.0.1:${cfg.tempPort}:7777" \\
      -e DEPLOY_ENV=${cfg.deployEnv} \\
      -e DB_URI="\$DB_URI" \\
      -e SESSION_SECRET="\$SESSION_SECRET" \\
      -v ${cfg.uploadsDir}:/app/backend/public/uploads \\
      ${netFlag}\\
      "${newImage}"
    echo "[timing] candidate container started"

    # Wait up to 180s for the candidate to pass a health check (app + DB).
    HEALTHY=0
    for i in \$(seq 1 60); do
      if curl -fsS -o /dev/null "\${HEALTH_URL}"; then
        HEALTHY=1
        break
      fi
      sleep 3
    done

    if [ "\${HEALTHY}" != "1" ]; then
      echo "New build failed health check. Keeping the previous working build."
      echo "Candidate container logs (last 100 lines):"
      docker logs --tail 100 "\${CANDIDATE}" || true
      docker rm -f "\${CANDIDATE}" || true
      exit 1
    fi
    echo "[timing] candidate passed health check after \$(( \$(date +%s) - DEPLOY_START ))s"

    # Healthy: swap the candidate onto the real port and retire the old container.
    docker rm -f "\${CONTAINER}" || true
    docker rm -f "\${CANDIDATE}"
    docker run -d -p "127.0.0.1:${cfg.realPort}:7777" --name "\${CONTAINER}" \\
      -e DEPLOY_ENV=${cfg.deployEnv} \\
      -e DB_URI="\$DB_URI" \\
      -e SESSION_SECRET="\$SESSION_SECRET" \\
      -v ${cfg.uploadsDir}:/app/backend/public/uploads \\
      ${netFlag}\\
      "${newImage}"
    echo "[timing] live container swapped to port ${cfg.realPort}"

    # Verify the promoted container on the real port; roll back if it fails.
    PROMOTED_OK=0
    for i in \$(seq 1 10); do
      if curl -fsS -o /dev/null "http://127.0.0.1:${cfg.realPort}/readyz"; then
        PROMOTED_OK=1
        break
      fi
      sleep 3
    done

    if [ "\${PROMOTED_OK}" != "1" ]; then
      echo "Promoted build failed verification. Rolling back to last-good."
      docker rm -f "\${CONTAINER}" || true
      docker pull "${lastGoodImage}" || true
      docker run -d -p "127.0.0.1:${cfg.realPort}:7777" --name "\${CONTAINER}" \\
        -e DEPLOY_ENV=${cfg.deployEnv} \\
        -e DB_URI="\$DB_URI" \\
        -e SESSION_SECRET="\$SESSION_SECRET" \\
        -v ${cfg.uploadsDir}:/app/backend/public/uploads \\
        ${netFlag}\\
        "${lastGoodImage}"
      exit 1
    fi
    echo "[timing] promoted container verified; total deploy time \$(( \$(date +%s) - DEPLOY_START ))s"
    """
}

// After a successful deploy, record the build as the last known good image so a
// future deploy can roll back to it. Caller must provide dockerhub credentials.
void tagLastGood(Map cfg) {
    sh """
    docker tag "${cfg.image}:${env.BUILD_NUMBER}" "${cfg.image}:last-good"
    docker push "${cfg.image}:last-good"
    """
}

return this
