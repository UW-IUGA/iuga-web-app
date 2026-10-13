// Regression test for host-port collisions between the deploy pipelines.
//
// Seam: the `cfg` map in each *.jenkinsfile — the ports healthGatedDeploy()
// publishes on the shared Jenkins host. Every pipeline deploys to the same
// host, so a candidate port that another container already holds fails the
// deploy with "port is already allocated".
//
// Run: node --test ci/test/*.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..', '..')

const DOC_PATH = 'docs/DEPLOYMENT.md'
const PIPELINES = ['dev.jenkinsfile', 'staging.jenkinsfile', 'prod.jenkinsfile']

// Host ports published by pipelines outside this repo (UW-IUGA/iuga-admin-console).
// Update these if the admin console's ports change.
const EXTERNAL_PORTS = {
    'admin.iuga.info': 8889,
    'dev-admin.iuga.info': 7778,
}

function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

function deployPipelines(root) {
    return readdirSync(root)
        .filter((file) => file.endsWith('.jenkinsfile'))
        .filter((file) => stripComments(readFileSync(path.join(root, file), 'utf8')).includes('healthGatedDeploy('))
}

function readPorts(root, file) {
    const src = stripComments(readFileSync(path.join(root, file), 'utf8'))
    return ['tempPort', 'realPort'].map((key) => {
        const matches = [...src.matchAll(new RegExp(`\\b${key}:\\s*(\\d+)`, 'g'))]
        assert.equal(matches.length, 1, `${file} must define ${key} exactly once`)
        const role = key === 'tempPort' ? 'candidate' : 'live'
        return { owner: `${file} ${key}`, port: Number(matches[0][1]), labels: [file, role] }
    })
}

function documentedRows(root) {
    return readFileSync(path.join(root, DOC_PATH), 'utf8')
        .split('\n')
        .filter((line) => /^\| \d+ \|/.test(line))
        .map((line) => ({ port: Number(line.split('|')[1].trim()), text: line }))
}

function findProblems(root) {
    const files = deployPipelines(root)
    assert.ok(files.length > 0, 'no deploy pipeline (healthGatedDeploy call) found')
    const claims = [
        ...files.flatMap((file) => readPorts(root, file)),
        ...Object.entries(EXTERNAL_PORTS).map(([owner, port]) => ({ owner, port, labels: [owner] })),
    ]
    const owners = new Map()
    const problems = []
    for (const { owner, port } of claims) {
        if (owners.has(port)) problems.push(`${port}: ${owners.get(port)} and ${owner}`)
        else owners.set(port, owner)
        if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push(`${port}: ${owner} is outside 1-65535`)
    }
    const rows = documentedRows(root)
    for (const { owner, port, labels } of claims) {
        const row = rows.find((r) => r.port === port)
        if (!row) problems.push(`${port}: ${owner} is not documented in ${DOC_PATH}`)
        else if (!labels.every((label) => row.text.includes(label))) problems.push(`${port}: ${owner} is documented with a different owner in ${DOC_PATH}`)
    }
    for (const row of rows) {
        if (!claims.some((c) => c.port === row.port)) problems.push(`${row.port}: documented in ${DOC_PATH} but published by no pipeline`)
    }
    return problems
}

test('no pipeline publishes a host port that another deployment uses', () => {
    assert.deepEqual(findProblems(repoRoot), [])
})

function makeRoot(t, { jenkinsfiles = {}, docs } = {}) {
    const root = mkdtempSync(path.join(tmpdir(), 'pipeline-ports-'))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const files = { ...Object.fromEntries(PIPELINES.map((f) => [f, readFileSync(path.join(repoRoot, f), 'utf8')])), ...jenkinsfiles }
    for (const [file, src] of Object.entries(files)) writeFileSync(path.join(root, file), src)
    mkdirSync(path.join(root, 'docs'))
    writeFileSync(path.join(root, DOC_PATH), docs ?? readFileSync(path.join(repoRoot, DOC_PATH), 'utf8'))
    return root
}

const realProd = readFileSync(path.join(repoRoot, 'prod.jenkinsfile'), 'utf8')

test('a new deploy pipeline in the repo is checked for collisions', (t) => {
    const root = makeRoot(t, {
        jenkinsfiles: {
            'preview.jenkinsfile': 'def cfg = [\n    tempPort:  8889,\n    realPort:  9000,\n]\ndeploy.healthGatedDeploy(cfg)\n',
        },
    })
    assert.match(findProblems(root).join('\n'), /8889: preview\.jenkinsfile tempPort and admin\.iuga\.info/)
})

test('a commented-out tempPort does not stand in for the live value', (t) => {
    const prod = realProd.replace('tempPort:  8890,', '// tempPort:  8890,\n    tempPort:  8889,')
    const root = makeRoot(t, { jenkinsfiles: { 'prod.jenkinsfile': prod } })
    assert.match(findProblems(root).join('\n'), /8889: prod\.jenkinsfile tempPort and admin\.iuga\.info/)
})

test('docs allocation table matches the ports the pipelines publish', (t) => {
    const docs = readFileSync(path.join(repoRoot, DOC_PATH), 'utf8').replace('| 8890 | Production site (candidate)', '| 8891 | Production site (candidate)')
    const root = makeRoot(t, { docs })
    assert.match(findProblems(root).join('\n'), /8890: prod\.jenkinsfile tempPort is not documented/)
})

test('a published port outside 1-65535 is reported', (t) => {
    const root = makeRoot(t, { jenkinsfiles: { 'prod.jenkinsfile': realProd.replace('tempPort:  8890,', 'tempPort:  80890,') } })
    assert.match(findProblems(root).join('\n'), /80890: prod\.jenkinsfile tempPort is outside 1-65535/)
})

test('the guard fails instead of passing when no deploy pipeline is found', (t) => {
    const root = makeRoot(t)
    for (const file of PIPELINES) rmSync(path.join(root, file))
    assert.throws(() => findProblems(root), /no deploy pipeline/)
})
