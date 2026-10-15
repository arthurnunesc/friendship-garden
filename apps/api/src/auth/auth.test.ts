import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { getMigrations } from 'better-auth/db/migration'
import { createAuth } from './auth.js'
import type { AuthConfig } from './config.js'

const config: AuthConfig = {
  baseURL: 'https://garden.example',
  secret: 'a'.repeat(32),
  databaseURL: 'postgresql://garden:password@db.example/friendship_garden',
  googleClientId: 'google-client-id',
  googleClientSecret: 'google-client-secret',
  resendApiKey: 're_test_key',
  emailFrom: 'Friendship Garden <sign-in@garden.example>',
}

interface TestAuth {
  auth: ReturnType<typeof createAuth>
  database: DatabaseSync
  emails: { email: string; url: string }[]
}

const databases: DatabaseSync[] = []

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close()
})

async function createTestAuth(): Promise<TestAuth> {
  const database = new DatabaseSync(':memory:')
  databases.push(database)
  const emails: { email: string; url: string }[] = []
  const auth = createAuth(config, database, async (email) => {
    emails.push(email)
  })
  const { runMigrations } = await getMigrations(auth.options)
  await runMigrations()
  return { auth, database, emails }
}

function authRequest(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set('origin', config.baseURL)
  headers.set('x-auth-client-ip', '203.0.113.20')
  return new Request(`${config.baseURL}/api/auth${path}`, { ...init, headers })
}

async function requestMagicLink(testAuth: TestAuth, extra: Record<string, string> = {}): Promise<Response> {
  return testAuth.auth.handler(authRequest('/sign-in/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'friend@example.com', ...extra }),
  }))
}

describe('createAuth', () => {
  it('sends a hashed one-time magic link that creates a secure session', async () => {
    const testAuth = await createTestAuth()

    expect((await requestMagicLink(testAuth)).status).toBe(200)
    const delivered = testAuth.emails[0]
    expect(delivered).toEqual({ email: 'friend@example.com', url: expect.any(String) })
    if (delivered === undefined) throw new Error('Expected a delivered magic link')
    const rawToken = new URL(delivered.url).searchParams.get('token')
    expect(rawToken).toBeTruthy()
    const values = databaseValues(testAuth.database, 'SELECT value FROM verification')
    expect(values.join(' ')).not.toContain(rawToken)

    const verified = await testAuth.auth.handler(new Request(delivered.url))
    expect(verified.status).toBe(302)
    expect(verified.headers.get('set-cookie')).toMatch(/HttpOnly/i)
    expect(verified.headers.get('set-cookie')).toMatch(/Secure/i)

    const reused = await testAuth.auth.handler(new Request(delivered.url))
    expect(reused.headers.get('location')).toContain('error=INVALID_TOKEN')
    expect(reused.headers.get('set-cookie')).toBeNull()
  })

  it('rejects expired magic links', async () => {
    const testAuth = await createTestAuth()
    await requestMagicLink(testAuth)
    testAuth.database.prepare("UPDATE verification SET expiresAt = '2000-01-01T00:00:00.000Z'").run()

    const delivered = testAuth.emails[0]
    if (delivered === undefined) throw new Error('Expected a delivered magic link')
    const expired = await testAuth.auth.handler(new Request(delivered.url))
    expect(expired.headers.get('location')).toContain('error=INVALID_TOKEN')
    expect(expired.headers.get('set-cookie')).toBeNull()
  })

  it('reads an authenticated session and revokes it on sign-out', async () => {
    const testAuth = await createTestAuth()
    await requestMagicLink(testAuth)
    const delivered = testAuth.emails[0]
    if (delivered === undefined) throw new Error('Expected a delivered magic link')
    const verified = await testAuth.auth.handler(new Request(delivered.url))
    const cookie = verified.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
    const session = await testAuth.auth.handler(authRequest('/get-session', { headers: { cookie } }))

    expect(session.status).toBe(200)
    expect(await session.json()).toMatchObject({ user: { email: 'friend@example.com' } })
    expect((await testAuth.auth.handler(authRequest('/sign-out', { method: 'POST', headers: { cookie } }))).status).toBe(200)
    const revoked = await testAuth.auth.handler(authRequest('/get-session', { headers: { cookie } }))
    expect(await revoked.json()).toBeNull()
    expect(databaseValues(testAuth.database, 'SELECT id FROM session')).toEqual([])
  })

  it('rejects untrusted origins and callback URLs before dispatching email', async () => {
    const testAuth = await createTestAuth()
    const untrustedOrigin = await testAuth.auth.handler(new Request(`${config.baseURL}/api/auth/sign-in/magic-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie: 'session=irrelevant' },
      body: JSON.stringify({ email: 'friend@example.com' }),
    }))
    expect(untrustedOrigin.status).toBeGreaterThanOrEqual(400)

    const untrustedCallback = await requestMagicLink(testAuth, { callbackURL: 'https://evil.example/steal' })
    expect(untrustedCallback.status).toBeGreaterThanOrEqual(400)
    expect(testAuth.emails).toEqual([])
  })

  it.each(['newUserCallbackURL', 'errorCallbackURL'])('rejects an untrusted %s before dispatching email', async (field) => {
    const testAuth = await createTestAuth()
    expect((await requestMagicLink(testAuth, { [field]: 'https://evil.example/steal' })).status).toBe(403)
    expect(testAuth.emails).toEqual([])
  })

  it('enforces the database-backed magic-link request limit for the client IP', async () => {
    const testAuth = await createTestAuth()
    expect((await requestMagicLink(testAuth)).status).toBe(200)
    expect((await requestMagicLink(testAuth)).status).toBe(200)
    expect((await requestMagicLink(testAuth)).status).toBe(200)
    expect((await requestMagicLink(testAuth)).status).toBe(429)
    expect(databaseValues(testAuth.database, 'SELECT id FROM rateLimit')).not.toEqual([])
  })

  it('generates a Google authorization URL without enabling Apple or passwords', async () => {
    const testAuth = await createTestAuth()
    const google = await testAuth.auth.handler(authRequest('/sign-in/social', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'google', callbackURL: config.baseURL }),
    }))

    expect(google.status).toBe(200)
    const googleURL = new URL((await google.json() as { url: string }).url)
    expect(googleURL.hostname).toBe('accounts.google.com')
    expect(googleURL.pathname).toContain('/o/oauth2/')

    expect((await testAuth.auth.handler(authRequest('/sign-in/social', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'apple', callbackURL: config.baseURL }),
    }))).status).toBeGreaterThanOrEqual(400)
    expect((await testAuth.auth.handler(authRequest('/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'friend@example.com', password: 'not-a-real-password' }),
    }))).status).toBeGreaterThanOrEqual(400)
  })
})

function databaseValues(database: DatabaseSync, sql: string): string[] {
  return database.prepare(sql).all().flatMap((row) => Object.values(row).map(String))
}
