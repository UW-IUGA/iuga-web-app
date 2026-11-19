// Regression test for the Discord settings each deploy pipeline forwards.
//
// Seam: the `cfg` map and Deploy-stage credential bindings in each *.jenkinsfile.
// ci/deploy.groovy forwards the Discord values when cfg.discordPublicKey is set,
// but it can only forward what the pipeline binds. An unbound DISCORD_PUBLIC_KEY
// reaches the container empty, so the interactions endpoint silently never mounts.
//
// Run: node --test ci/test/*.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..', '..')

const DISCORD_CREDENTIALS = [
    'DISCORD_PUBLIC_KEY',
    'DISCORD_BOT_TOKEN',
    'DISCORD_APP_ID',
    'DISCORD_GUILD_ID',
    'DISCORD_OFFICER_ROLE_ID',
    'DISCORD_MOD_ROLE_ID',
    'DISCORD_IUGA_OFFICER_ROLE_ID',
    'DISCORD_APPROVAL_CHANNEL_ID',
    'DISCORD_RSO_APPROVAL_CHANNEL_ID',
]

function readPipeline(file) {
    return readFileSync(path.join(repoRoot, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
}

function forwardsDiscord(src) {
    return /discordPublicKey:\s*true/.test(src)
}

function boundCredentials(src) {
    return [...src.matchAll(/string\(credentialsId:\s*'([A-Z_]+)',\s*variable:\s*'\1'\)/g)].map((m) => m[1])
}

for (const file of ['dev.jenkinsfile', 'prod.jenkinsfile']) {
    test(`${file} forwards Discord and binds every Discord credential`, () => {
        const src = readPipeline(file)
        assert.ok(forwardsDiscord(src), `${file} must set discordPublicKey: true`)
        const missing = DISCORD_CREDENTIALS.filter((name) => !boundCredentials(src).includes(name))
        assert.deepEqual(missing, [], `${file} forwards Discord but does not bind ${missing.join(', ')}`)
    })
}
