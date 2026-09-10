// Regression test for the health-gated deploy logic in ci/deploy.groovy.
//
// Seam: the `sh """` block inside healthGatedDeploy() — the exact shell
// Jenkins executes. Observable behavior: the sequence of `docker` invocations
// and the script's exit code, with `docker` stubbed so no daemon is needed.
//
// Run: node --test ci/test
// (point DEPLOY_GROOVY at another file to test a different version, e.g. git show HEAD:ci/deploy.groovy)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const groovyPath = process.env.DEPLOY_GROOVY || path.join(__dirname, '..', 'deploy.groovy')

// Translate the Groovy shell block into bash: drop the `sh """` markers,
// unescape `\\` -> `\` and `\$` -> `$`, then substitute concrete values for
// the Groovy-interpolated variables. `sleep 3` becomes `sleep 0` so failing
// paths don't wait out the real 180s window.
function extractShell() {
    const src = readFileSync(groovyPath, 'utf8')
    const start = src.indexOf('sh """')
    const end = src.indexOf('    """', start)
    assert.ok(start !== -1 && end !== -1, 'deploy.groovy must contain a sh """ block')
    let shell = src.slice(start + 6, end)
    shell = shell.replace(/\\\\/g, '\\').replace(/\\\$/g, '$').replace(/sleep 3/g, 'sleep 0')
    const vars = {
        '${cfg.container}': 'iuga-test',
        '${cfg.tempPort}': '16667',
        '${cfg.realPort}': '16666',
        '${cfg.deployEnv}': 'development',
        '${cfg.uploadsDir}': '/tmp/iuga-test-uploads',
        '${netFlag}': '',
        '${secretEnv}': 'SESSION_SECRET_DEV',
        '${newImage}': 'iuga/test-app:123',
        '${lastGoodImage}': 'iuga/test-app:last-good',
    }
    for (const [k, v] of Object.entries(vars)) shell = shell.split(k).join(v)
    return shell
}

const ENTRA_RUNTIME_ENV = {
    ENTRA_TENANT_ID: '11111111-2222-3333-4444-555555555555',
    ENTRA_API_AUDIENCE: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    ENTRA_REQUIRED_SCOPE: 'access_as_user',
    ENTRA_REQUIRED_ROLE: 'Shopper',
    ENTRA_AUTHORIZED_CLIENT_ID: '99999999-8888-7777-6666-555555555555',
}

// The stub models the app's auth-dependent readiness behavior: a container
// cannot answer a health probe unless every required runtime variable was
// forwarded by the docker run invocation.
const AUTH_GATE = 'if [ "$1" = "run" ]; then\n' +
    '  args=" $* "\n' +
    '  case "$args" in\n' +
    '    *" -e ENTRA_TENANT_ID=' + ENTRA_RUNTIME_ENV.ENTRA_TENANT_ID + ' "* ) : ;;\n' +
    '    *) rm -f "$AUTH_CONFIG_FILE"; exit 1;;\n' +
    '  esac\n' +
    '  case "$args" in\n' +
    '    *" -e ENTRA_API_AUDIENCE=' + ENTRA_RUNTIME_ENV.ENTRA_API_AUDIENCE + ' "* ) : ;;\n' +
    '    *) rm -f "$AUTH_CONFIG_FILE"; exit 1;;\n' +
    '  esac\n' +
    '  case "$args" in\n' +
    '    *" -e ENTRA_REQUIRED_SCOPE=' + ENTRA_RUNTIME_ENV.ENTRA_REQUIRED_SCOPE + ' "* ) : ;;\n' +
    '    *) rm -f "$AUTH_CONFIG_FILE"; exit 1;;\n' +
    '  esac\n' +
    '  case "$args" in\n' +
    '    *" -e ENTRA_REQUIRED_ROLE=' + ENTRA_RUNTIME_ENV.ENTRA_REQUIRED_ROLE + ' "* ) : ;;\n' +
    '    *) rm -f "$AUTH_CONFIG_FILE"; exit 1;;\n' +
    '  esac\n' +
    '  case "$args" in\n' +
    '    *" -e ENTRA_AUTHORIZED_CLIENT_ID=' + ENTRA_RUNTIME_ENV.ENTRA_AUTHORIZED_CLIENT_ID + ' "* ) touch "$AUTH_CONFIG_FILE";;\n' +
    '    *) rm -f "$AUTH_CONFIG_FILE"; exit 1;;\n' +
    '  esac\n' +
    'elif [ "$1" = "exec" ]; then\n' +
    '  [ -f "$AUTH_CONFIG_FILE" ] || exit 1\n' +
    'fi\n'

const STUB_OK = '#!/bin/sh\necho "docker $*" >> "$STUB_LOG"\n' + AUTH_GATE + 'exit 0\n'
// Fail every docker exec except the first (candidate check passes, promotion fails).
const STUB_ROLLBACK = '#!/bin/sh\necho "docker $*" >> "$STUB_LOG"\n' + AUTH_GATE +
    'if [ "$1" = "exec" ]; then\n' +
    '  if [ -f "$COUNTER_FILE" ]; then n=$(cat "$COUNTER_FILE"); else n=0; fi\n' +
    '  n=$((n+1)); echo $n > "$COUNTER_FILE"\n' +
    '  [ "$n" = "1" ]\n' +
    'else\n  exit 0\nfi\n'
// Fail every docker exec (candidate never becomes healthy).
const STUB_DEAD = '#!/bin/sh\necho "docker $*" >> "$STUB_LOG"\n' + AUTH_GATE +
    '[ "$1" != "exec" ]\n'

function runDeploy(stubScript, envOverrides = {}) {
    const dir = mkdtempSync(path.join(tmpdir(), 'deploy-groovy-'))
    const stubDir = path.join(dir, 'bin')
    mkdirSync(stubDir)
    writeFileSync(path.join(stubDir, 'docker'), stubScript)
    chmodSync(path.join(stubDir, 'docker'), 0o755)
    const logFile = path.join(dir, 'calls.log')
    const scriptFile = path.join(dir, 'deploy.sh')
    writeFileSync(scriptFile, extractShell())
    const env = {
        ...process.env,
        PATH: `${stubDir}:${process.env.PATH}`,
        STUB_LOG: logFile,
        COUNTER_FILE: path.join(dir, 'count'),
        AUTH_CONFIG_FILE: path.join(dir, 'auth-config'),
        DB_URI: 'mongodb://test-db',
        SESSION_SECRET_DEV: 'test-secret',
        ...ENTRA_RUNTIME_ENV,
        ...envOverrides,
    }
    let status = 0
    try {
        execFileSync('bash', [scriptFile], { env, stdio: 'pipe' })
    } catch (err) {
        status = err.status
    }
    const calls = readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean)
    return { status, calls }
}

function runCalls(calls, needle) {
    return calls.filter((c) => c.includes(needle))
}

function assertAuthForwarded(runCallsForContainers, omitted = []) {
    for (const call of runCallsForContainers) {
        for (const [name, value] of Object.entries(ENTRA_RUNTIME_ENV)) {
            if (omitted.includes(name)) continue
            assert.ok(call.includes(`-e ${name}=${value}`), `${name} must be forwarded`)
        }
    }
}

test('healthy candidate is promoted to the live port; last-good untouched', () => {
    const { status, calls } = runDeploy(STUB_OK)

    assert.equal(status, 0)
    assert.deepEqual(runCalls(calls, 'docker pull'), ['docker pull iuga/test-app:123'])
    // Candidate starts on the temp port, container name suffixed -candidate.
    const candidateRun = runCalls(calls, 'docker run -d')
    assert.equal(candidateRun.length, 2)
    assert.ok(candidateRun[0].includes('--name iuga-test-candidate') && candidateRun[0].includes('127.0.0.1:16667:7777'))
    assert.ok(candidateRun[1].includes('--name iuga-test') && candidateRun[1].includes('127.0.0.1:16666:7777'))
    assertAuthForwarded(candidateRun)
    // The app receives the deployment-specific secret under its suffixed name
    // (bash expands the "$SESSION_SECRET_DEV" reference before docker runs).
    assert.ok(candidateRun.every((c) => c.includes('-e SESSION_SECRET_DEV=test-secret')))
    // Health checks run inside the container against the app's own port.
    const probes = runCalls(calls, 'fetch("http://127.0.0.1:7777/readyz")')
    assert.equal(probes.length, 2)
    assert.ok(probes.every((p) => p.includes('docker exec iuga-test')))
    // Old live container is retired only after the candidate passed.
    assert.ok(runCalls(calls, 'docker rm -f iuga-test').length >= 2)
    assert.equal(runCalls(calls, 'last-good').length, 0)
})

test('missing Entra runtime configuration prevents readiness from passing', () => {
    const { status, calls } = runDeploy(STUB_OK, { ENTRA_API_AUDIENCE: undefined })

    assert.equal(status, 1)
    assert.equal(runCalls(calls, 'docker exec iuga-test-candidate').length, 60)
    assert.equal(calls.filter((c) => c === 'docker rm -f iuga-test').length, 0)
    assert.equal(runCalls(calls, '127.0.0.1:16666:7777').length, 0)
})

test('dead candidate aborts the deploy and keeps the old container', () => {
    const { status, calls } = runDeploy(STUB_DEAD)

    assert.equal(status, 1)
    // 60 probe attempts, none of them successful.
    assert.equal(runCalls(calls, 'docker exec iuga-test-candidate').length, 60)
    // Logs are dumped, candidate removed.
    assert.ok(runCalls(calls, 'docker logs --tail 100 iuga-test-candidate').length === 1)
    assert.ok(runCalls(calls, 'docker rm -f iuga-test-candidate').length >= 1)
    // The live container was never stopped or replaced.
    assert.equal(calls.filter((c) => c === 'docker rm -f iuga-test').length, 0)
    assert.equal(runCalls(calls, '127.0.0.1:16666:7777').length, 0)
})

test('failed promotion verification rolls back to last-good', () => {
    const { status, calls } = runDeploy(STUB_ROLLBACK)
    assert.equal(status, 1)
    // Candidate check passed (1st exec), then 10 failed promotion checks.
    assert.equal(runCalls(calls, 'docker exec iuga-test-candidate').length, 1)
    assert.equal(runCalls(calls, 'docker exec iuga-test ').length, 10)
    // Rollback: pull last-good and restart the live container from it.
    const pulls = runCalls(calls, 'docker pull')
    assert.equal(pulls.length, 2)
    assert.equal(pulls.at(-1), 'docker pull iuga/test-app:last-good')
    const lastRun = runCalls(calls, 'docker run -d').at(-1)
    assert.ok(lastRun.includes('--name iuga-test') && lastRun.includes('iuga/test-app:last-good'))
    assertAuthForwarded([lastRun])
})
