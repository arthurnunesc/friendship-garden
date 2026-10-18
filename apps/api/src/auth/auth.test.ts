import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { getMigrations } from 'better-auth/db/migration'
import { createAuth } from './auth.js'
import type { AuthConfig } from './config.js'
import { NATIVE_AUTH_CALLBACK } from '../../../../packages/garden-sync/src/nativeAuth.ts'
import { createNativeAuth } from '../../../mobile/src/sync/nativeAuth.ts'
import { createNativeAccountClient } from '../../../mobile/src/sync/accountClient.ts'
import { createGardenAccount } from '../../../mobile/src/sync/gardenAccount.ts'
import { createGardenHandler } from '../gardenHandler.js'
import { mergeGardenSnapshots, type SyncSnapshot } from '../gardenSync.js'

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
  it('round-trips the native email adapter, explicit consent, garden transport and sign-out against real auth', async () => {
    const testAuth = await createTestAuth()
    const data = new Map<string, string>()
    const secure = { getItem: async (key: string) => data.get(key) ?? null,
      setItem: async (key: string, value: string) => { data.set(key, value) } }
    const empty = (): SyncSnapshot => ({ version: 1, friends: [], interactions: [] })
    let snapshot = empty()
    const gardenRequests: Request[] = []
    const handler = createGardenHandler(() => ({ baseURL: config.baseURL,
      getUserId: async (headers) => (await testAuth.auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }))?.user.id ?? null,
      gardens: { read: async () => snapshot, merge: async (_user, incoming) => {
        snapshot = mergeGardenSnapshots(snapshot, incoming)
        return snapshot
      } },
    }))
    const fetcher: typeof fetch = async (url, init) => {
      const request = new Request(url, init)
      if (new URL(request.url).pathname === '/api/garden') {
        gardenRequests.push(request)
        return handler(request, '203.0.113.20')
      }
      return testAuth.auth.handler(request)
    }
    const auth = createNativeAuth({ origin: config.baseURL, secure, fence: {
      getItem: (key) => secure.getItem(key + '.fence'), setItem: (key, value) => secure.setItem(key + '.fence', value),
    }, fetcher,
      randomState: async () => 'a'.repeat(64), openBrowser: async () => { throw new Error('Email flow does not open a provider') } })
    const client = createNativeAccountClient({ origin: config.baseURL, auth, fetcher })
    const guest = [{ id: 'local', name: 'Local friend', cadenceDays: 14, createdAt: '2026-10-18T00:00:00.000Z', interactions: [] }]
    let serial = 0
    const account = createGardenAccount({ guest: { loadFriends: async () => guest, saveFriends: async () => {} },
      client, persistence: secure, clock: () => ({ updatedAt: '2026-10-18T00:00:00.000Z', changeId: String(++serial) }) })
    await account.refresh()
    await client.email('friend@example.com')
    const verified = await testAuth.auth.handler(new Request(testAuth.emails[0]!.url))
    expect(await auth.handleURL(verified.headers.get('location')!)).toBe(true)
    await account.refresh()
    expect(account.getSnapshot().user?.email).toBe('friend@example.com')
    expect(gardenRequests).toEqual([])
    await account.enable('import')
    expect(account.getSnapshot().phase).toBe('ready')
    expect(snapshot.friends[0]?.value?.name).toBe('Local friend')
    expect(gardenRequests.map(request => request.method)).toEqual(['GET', 'POST'])
    expect(gardenRequests.every(request => request.headers.get('origin') === config.baseURL)).toBe(true)
    const cookie = auth.getCookie()
    await account.signOut()
    expect(account.getSnapshot().user).toBeNull()
    expect(await account.getSnapshot().storage.loadFriends()).toEqual(guest)
    expect(auth.getCookie()).toBe('')
    const revoked = await testAuth.auth.handler(authRequest('/get-session', { headers: { cookie } }))
    expect(await revoked.json()).toBeNull()
  })

  it('hands a native email session only to the exact app callback without changing web redirects', async () => {
    const testAuth = await createTestAuth()
    const callbackURL = NATIVE_AUTH_CALLBACK + '?state=' + 'a'.repeat(64)
    expect((await requestMagicLink(testAuth, { callbackURL, newUserCallbackURL: callbackURL, errorCallbackURL: callbackURL })).status).toBe(200)
    const verified = await testAuth.auth.handler(new Request(testAuth.emails[0]!.url))
    expect(verified.status).toBe(302)
    const redirect = new URL(verified.headers.get('location')!)
    expect(redirect.protocol).toBe('friendship-garden:')
    expect(redirect.host).toBe('auth')
    expect(redirect.pathname).toBe('/callback')
    expect(redirect.searchParams.get('state')).toBe('a'.repeat(64))
    expect(redirect.searchParams.get('cookie')).toContain('__Secure-better-auth.session_token=')
    const cookie = verified.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    const session = await testAuth.auth.handler(authRequest('/get-session', { headers: { cookie } }))
    expect(await session.json()).toMatchObject({ user: { email: 'friend@example.com', emailVerified: true } })
  })

  it.each([
    'friendship-garden://evil/callback?state=' + 'a'.repeat(64),
    NATIVE_AUTH_CALLBACK + '/other?state=' + 'a'.repeat(64),
    NATIVE_AUTH_CALLBACK + '?state=short',
    NATIVE_AUTH_CALLBACK + '?state=' + 'a'.repeat(64) + '&state=' + 'b'.repeat(64),
    NATIVE_AUTH_CALLBACK + '?state=' + 'a'.repeat(64) + '&cookie=injected',
    NATIVE_AUTH_CALLBACK + '?state=' + 'a'.repeat(64) + '#fragment',
    'exp://127.0.0.1:8081/callback',
  ])('rejects native callback lookalikes and injected fields: %s', async (callbackURL) => {
    const testAuth = await createTestAuth()
    expect((await requestMagicLink(testAuth, { callbackURL })).status).toBe(403)
    expect(testAuth.emails).toEqual([])
    const social = await testAuth.auth.handler(authRequest('/sign-in/social', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'google', callbackURL }),
    }))
    expect(social.status).toBe(403)
  })

  it('does not accept a native scheme or expo-origin as an authentication request origin', async () => {
    const testAuth = await createTestAuth()
    const response = await testAuth.auth.handler(new Request(config.baseURL + '/api/auth/sign-in/magic-link', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'friendship-garden://', 'expo-origin': config.baseURL },
      body: JSON.stringify({ email: 'friend@example.com', callbackURL: NATIVE_AUTH_CALLBACK + '?state=' + 'a'.repeat(64) }),
    }))
    expect(response.status).toBe(403)
    expect(testAuth.emails).toEqual([])
  })

  it('rejects changed email verification callbacks before setting any cookie', async () => {
    const testAuth = await createTestAuth()
    await requestMagicLink(testAuth)
    const link = new URL(testAuth.emails[0]!.url)
    link.searchParams.set('callbackURL', NATIVE_AUTH_CALLBACK + '/steal?state=' + 'a'.repeat(64))
    const response = await testAuth.auth.handler(new Request(link))
    expect(response.status).toBe(403)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('limits the native browser proxy to the configured Google authorization endpoint', async () => {
    const testAuth = await createTestAuth()
    for (const authorizationURL of ['https://evil.example/steal', config.baseURL + '/api/auth/callback/google',
      'http://accounts.google.com/o/oauth2/v2/auth', 'https://accounts.google.com.evil.example/o/oauth2/v2/auth',
      'https://accounts.google.com/o/oauth2/v2/auth/other']) {
      const response = await testAuth.auth.handler(authRequest('/expo-authorization-proxy?' + new URLSearchParams({ authorizationURL, oauthState: 'synthetic-state' })))
      expect(response.status).toBe(403)
      expect(response.headers.get('set-cookie')).toBeNull()
    }
    const authorizationURL = 'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic-state'
    const valid = await testAuth.auth.handler(authRequest('/expo-authorization-proxy?' + new URLSearchParams({ authorizationURL, oauthState: 'synthetic-state' })))
    expect(valid.status).toBe(302)
    expect(valid.headers.get('location')).toBe(authorizationURL)
    expect(valid.headers.get('set-cookie')).toContain('__Secure-better-auth.oauth_state=')
  })

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
