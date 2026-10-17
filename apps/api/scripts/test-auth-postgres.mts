import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { Pool } from 'pg'
import { getMigrations } from 'better-auth/db/migration'
import { createAuth } from '../src/auth/auth.ts'
import { authPoolConfig } from '../src/authDatabase.ts'
import { applyAuthMigration } from '../src/authMigration.ts'
import { checkGardenPostgres } from './garden-postgres-checks.mts'

const usage = `Usage: node --experimental-strip-types scripts/test-auth-postgres.mts --run

Creates a schema-only test branch in the pinned development project, runs
PostgreSQL authentication and garden sync checks, then deletes only that owned branch.
Requires an authenticated Neon CLI. Does not load .env files or send email.

Examples:
  node --experimental-strip-types scripts/test-auth-postgres.mts --run
  node --experimental-strip-types scripts/test-auth-postgres.mts --help`

let verificationStage = 'arguments'

function neon(arguments_: string[]): unknown {
  const result = spawnSync('neon', arguments_, {
    encoding: 'utf8', timeout: 90_000,
    env: { ...process.env, CI: 'true', BROWSER: '/usr/bin/false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0) throw new Error('Neon test resource operation failed; provider output withheld.')
  return JSON.parse(result.stdout) as unknown
}

async function main() {
  if (process.argv.slice(2).join(' ') === '--help') { console.log(usage); return }
  if (process.argv.length !== 3 || process.argv[2] !== '--run') throw new Error(usage)
  const manifest = JSON.parse(await readFile(new URL('../development-database.json', import.meta.url), 'utf8')) as {
    purpose: string, projectId: string, branchId: string, host: string, database: string,
  }
  assert.equal(manifest.purpose, 'development')
  assert.match(manifest.projectId, /^[a-z0-9-]+$/)
  const name = `fg-auth-test-${Date.now()}-${randomBytes(4).toString('hex')}`
  let ownedBranch: string | undefined
  let creationAttempted = false
  let pool: Pool | undefined
  let cleanupPromise: Promise<void> | undefined
  const cleanup = () => cleanupPromise ??= (async () => {
    try {
      await pool?.end()
    } finally {
      if (creationAttempted) {
        const before = neon(['branches', 'list', '--project-id', manifest.projectId, '--output', 'json']) as
          { branches?: { id: string, name: string }[] } | { id: string, name: string }[]
        const candidates = Array.isArray(before) ? before : before.branches
        assert(candidates)
        const owned = candidates.find((branch) => branch.name === name)
        if (owned) {
          assert.notEqual(owned.id, manifest.branchId)
          neon(['branches', 'delete', owned.id, '--project-id', manifest.projectId, '--output', 'json'])
          const remaining = neon(['branches', 'list', '--project-id', manifest.projectId, '--output', 'json']) as
            { branches?: { id: string, name: string }[] } | { id: string, name: string }[]
          const branches = Array.isArray(remaining) ? remaining : remaining.branches
          assert(branches && !branches.some((branch) => branch.id === owned.id || branch.name === name))
          console.log(`Removed owned test branch: ${owned.id}`)
        } else {
          console.log(`No owned test branch remains: ${name}`)
        }
      }
    }
  })()
  const interrupt = () => { void cleanup().finally(() => process.exit(130)) }
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)
  try {
    creationAttempted = true
    const created = neon(['branches', 'create', '--project-id', manifest.projectId,
      '--parent', manifest.branchId, '--name', name, '--schema-only', '--cu', '0.25',
      '--expires-at', new Date(Date.now() + 3_600_000).toISOString(), '--no-secrets', '--output', 'json']) as {
        branch?: { id: string }, id?: string,
      }
    ownedBranch = created.branch?.id ?? created.id
    assert(ownedBranch && ownedBranch !== manifest.branchId)
    console.log(`Created owned test branch: ${ownedBranch}`)
    verificationStage = 'owned branch identity'
    const info = neon(['api', `/projects/${manifest.projectId}/branches/${ownedBranch}`, '--output', 'json']) as {
      branch: { id: string, name: string, parent_id?: string },
    }
    assert.equal(info.branch.id, ownedBranch)
    assert.equal(info.branch.name, name)
    // Schema-only branches are independent roots, not data-bearing child forks.
    assert(!info.branch.parent_id)
    verificationStage = 'disposable connection'
    const connection = spawnSync('neon', ['connection-string', ownedBranch, '--project-id', manifest.projectId, '--pooled'], {
      encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'],
    })
    assert.equal(connection.status, 0, 'Could not retrieve disposable branch credentials.')
    const databaseURL = connection.stdout.trim()
    const host = new URL(databaseURL).hostname.replace('-pooler.', '.')
    assert.notEqual(host, manifest.host)
    const endpoints = neon(['api', `/projects/${manifest.projectId}/endpoints`, '--output', 'json']) as {
      endpoints: { host: string, branch_id: string }[],
    }
    assert(endpoints.endpoints.some((endpoint) => endpoint.branch_id === ownedBranch && endpoint.host === host))
    pool = new Pool({ ...authPoolConfig(databaseURL), query_timeout: 15_000 })
    pool.on('error', () => { console.error('Disposable PostgreSQL connection failed.') })
    verificationStage = 'owned disposable schema reset'
    // This schema exists only on our newly created schema-only disposable branch.
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    const sql = await readFile(new URL('../migrations/0001_auth.sql', import.meta.url), 'utf8')
    const options = { databaseURL, target: { purpose: 'development' as const, host, database: manifest.database }, sql }
    verificationStage = 'migration dry run'
    assert.equal((await applyAuthMigration(pool, { ...options, dryRun: true })).status, 'pending')
    verificationStage = 'concurrent migrations'
    const migrations = await Promise.all([applyAuthMigration(pool, options), applyAuthMigration(pool, options)])
    assert.deepEqual(migrations.map((r) => r.status).sort(), ['already-applied', 'applied'])
    assert.equal((await applyAuthMigration(pool, { ...options, dryRun: true })).status, 'already-applied')
    await assert.rejects(applyAuthMigration(pool, { ...options, sql: sql + '\n-- changed' }), /checksum/)
    verificationStage = 'garden migration'
    const gardenSQL = await readFile(new URL('../migrations/0002_gardens.sql', import.meta.url), 'utf8')
    const gardenOptions = { ...options, sql: gardenSQL, version: '0002_gardens' as const }
    assert.equal((await applyAuthMigration(pool, { ...gardenOptions, dryRun: true })).status, 'pending')
    const gardenMigrations = await Promise.all([applyAuthMigration(pool, gardenOptions), applyAuthMigration(pool, gardenOptions)])
    assert.deepEqual(gardenMigrations.map((r) => r.status).sort(), ['already-applied', 'applied'])
    assert.equal((await applyAuthMigration(pool, { ...gardenOptions, dryRun: true })).status, 'already-applied')
    verificationStage = 'schema drift'
    const emails: { email: string, url: string }[] = []
    const baseURL = 'https://garden.example'
    const auth = createAuth({
      baseURL, secret: 'disposable-test-secret-'.repeat(3), databaseURL,
      googleClientId: 'test-google-client', googleClientSecret: 'test-google-secret',
      resendApiKey: 'test-not-used', emailFrom: 'sign-in@garden.example',
    }, pool, async (email) => { emails.push(email) })
    const drift = await getMigrations(auth.options)
    assert.equal(drift.toBeCreated.length, 0)
    assert.equal(drift.toBeAdded.length, 0)
    const email = 'synthetic-auth@example.invalid'
    const request = (path: string, options: RequestInit = {}) => new Request(baseURL + '/api/auth' + path, {
      ...options,
      headers: { origin: baseURL, 'content-type': 'application/json', 'x-auth-client-ip': '192.0.2.1', ...options.headers },
    })
    const signIn = () => auth.handler(request('/sign-in/magic-link', {
      method: 'POST', body: JSON.stringify({ email, callbackURL: '/' }),
    }))
    verificationStage = 'request magic link'
    assert.equal((await signIn()).status, 200)
    assert.equal(emails.length, 1)
    const link = emails[0]?.url
    assert(link)
    const rawToken = new URL(link).searchParams.get('token')
    assert(rawToken)
    const stored = await pool.query('SELECT identifier, value FROM verification')
    assert(!JSON.stringify(stored.rows).includes(rawToken), 'Raw magic-link token must not be stored.')
    verificationStage = 'verify magic link and session'
    const verified = await auth.handler(new Request(link))
    assert.equal(verified.status, 302)
    const cookies = verified.headers.getSetCookie()
    assert(cookies.some((cookie) => cookie.includes('HttpOnly') && cookie.includes('Secure')))
    const cookie = cookies.map((value) => value.split(';')[0]).join('; ')
    const session = await auth.handler(request('/get-session', { headers: { cookie } }))
    const sessionData = (await session.json()) as { user: { id: string, email: string } }
    assert.equal(sessionData.user.email, email)
    const replay = await auth.handler(new Request(link))
    assert(replay.headers.get('location')?.includes('INVALID_TOKEN'))
    verificationStage = 'account-isolated garden storage and HTTP'
    await checkGardenPostgres(pool, auth, baseURL, sessionData.user.id, cookie, emails)
    assert.equal((await auth.handler(request('/sign-out', { method: 'POST', headers: { cookie } }))).status, 200)
    assert.equal(await (await auth.handler(request('/get-session', { headers: { cookie } }))).json(), null)
    verificationStage = 'expiry and rate limit'
    await signIn()
    const expiredLink = emails.at(-1)?.url
    assert(expiredLink)
    await pool.query('UPDATE verification SET "expiresAt" = now() - interval \'1 minute\'')
    assert((await auth.handler(new Request(expiredLink))).headers.get('location')?.includes('INVALID_TOKEN'))
    await signIn()
    assert.equal((await signIn()).status, 429)
    console.log('PostgreSQL passed: concurrent/idempotent migrations, checksum guard, zero schema drift, hashed/single-use/expired links, secure session, sign-out, database rate limit.')
  } finally {
    await cleanup()
    process.removeListener('SIGINT', interrupt)
    process.removeListener('SIGTERM', interrupt)
  }
}

void main().catch((error: unknown) => {
  console.error('Verification stage:', verificationStage)
  if (error && typeof error === 'object' && 'code' in error && /^[A-Z_0-9]{1,40}$/.test(String(error.code))) {
    console.error('Error code:', error.code)
  }
  console.error(error instanceof Error && error.message.startsWith('Usage:') ? error.message : 'Disposable PostgreSQL verification failed; inspect the last completed check. No credentials are logged.')
  process.exitCode = 1
})
