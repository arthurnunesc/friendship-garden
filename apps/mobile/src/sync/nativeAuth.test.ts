import { describe, expect, it, vi } from 'vitest'
import { AccountRequestError } from '../../../../packages/garden-sync/src/account'
import { NATIVE_AUTH_CALLBACK } from '../../../../packages/garden-sync/src/nativeAuth'
import { type NativeAuth } from './accountClient'
import { createNativeAuth } from './nativeAuth'

const origin = 'https://garden.example'
const state = 'a'.repeat(64)
const otherState = 'b'.repeat(64)
const storageKey = 'friendship-garden.auth.' + [...origin].map(char => char.charCodeAt(0).toString(16)).join('')
const sessionCookie = '__Secure-better-auth.session_token=session-value'
const callback = (nonce = state, cookie = sessionCookie) => `${NATIVE_AUTH_CALLBACK}?state=${nonce}&cookie=${cookie}`

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function setup(options: {
  values?: Map<string, string>
  fenceValues?: Map<string, string>
  now?: number
  fetcher?: (url: string, init: RequestInit) => Promise<Response>
  browser?: (url: string, callbackURL: string) => Promise<{ type: string, url?: string }>
} = {}) {
  const values = options.values ?? new Map<string, string>()
  const fenceValues = options.fenceValues ?? new Map<string, string>()
  const fence = { getItem: vi.fn(async (key: string) => fenceValues.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { fenceValues.set(key, value) }) }
  let time = options.now ?? 1_000
  const secure = {
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { values.set(key, value) }),
  }
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (options.fetcher) return options.fetcher(url, init!)
    if (url.includes('/get-session')) return Response.json({ user: { id: 'user-a', email: 'person@example.invalid', emailVerified: true } })
    return Response.json({})
  })
  const openBrowser = vi.fn(async (url: string, callbackURL: string) => options.browser
    ? options.browser(url, callbackURL)
    : { type: 'cancel' })
  const auth = createNativeAuth({ origin, secure, fence, fetcher, openBrowser,
    randomState: vi.fn(async () => state), now: () => time })
  return { auth, secure, fence, fenceValues, fetcher, openBrowser, values, setNow: (next: number) => { time = next } }
}

function saved(fixture: ReturnType<typeof setup>) {
  return JSON.parse(fixture.values.get(storageKey)!) as { cookie: string, pending: unknown, signedOut?: boolean }
}

describe('native Better Auth handoff', () => {
  it('keeps a failed revocation until it succeeds before starting a new sign-in', async () => {
    const values = new Map([[storageKey, JSON.stringify({ version: 1, cookie: sessionCookie, pending: null })]])
    let online = false
    const f = setup({ values, fetcher: async (url) => url.endsWith('/sign-out')
      ? Response.json({}, { status: online ? 200 : 503 }) : Response.json({}) })
    await expect(f.auth.signOut()).rejects.toMatchObject({ status: 503 })
    await expect(f.auth.email('person@example.invalid')).rejects.toMatchObject({ status: 503 })
    expect(saved(f).cookie).toBe(sessionCookie)
    expect(f.fetcher.mock.calls.some(([url]) => String(url).endsWith('/sign-in/magic-link'))).toBe(false)
    online = true
    await f.auth.email('person@example.invalid')
    expect(saved(f).cookie).toBe('')
    const paths = f.fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)
    expect(paths.slice(-2)).toEqual(['/api/auth/sign-out', '/api/auth/sign-in/magic-link'])
  })

  it('uses an independent non-secret fence after keychain and server sign-out failures', async () => {
    const values = new Map([[storageKey, JSON.stringify({ version: 1, cookie: sessionCookie, pending: null })]])
    const first = setup({ values, fetcher: async () => Response.json({}, { status: 503 }) })
    first.secure.setItem.mockRejectedValue(new Error('keychain unavailable'))
    await expect(first.auth.signOut()).rejects.toMatchObject({ status: 503 })
    expect([...first.fenceValues.values()]).toEqual(['signed-out'])
    expect(saved(first).cookie).toBe(sessionCookie)
    const restarted = setup({ values, fenceValues: first.fenceValues, fetcher: async () => Response.json({}, { status: 503 }) })
    expect(await restarted.auth.session()).toBeNull()
    expect(restarted.auth.getCookie()).toBe('')
    expect(restarted.fetcher).not.toHaveBeenCalled()
    await expect(restarted.auth.google()).rejects.toMatchObject({ status: 503 })
    expect(saved(restarted).cookie).toBe(sessionCookie)
  })

  it('reports failure if neither durable store nor server can acknowledge sign-out', async () => {
    const f = setup({ values: new Map([[storageKey, JSON.stringify({ version: 1, cookie: sessionCookie, pending: null })]]),
      fetcher: async () => Response.json({}, { status: 503 }) })
    f.secure.setItem.mockRejectedValue(new Error('private keychain path'))
    f.fence.setItem.mockRejectedValue(new Error('private filesystem path'))
    await expect(f.auth.signOut()).rejects.toMatchObject({ status: 503 })
    expect(f.auth.getCookie()).toBe('')
  })

  it('does not let an old sign-out response erase a newer correlated login', async () => {
    const oldRevocation = deferred<Response>()
    let revocations = 0
    const f = setup({ values: new Map([[storageKey, JSON.stringify({ version: 1, cookie: sessionCookie, pending: null })]]),
      fetcher: async (url) => {
        if (url.endsWith('/sign-out')) return ++revocations === 1 ? oldRevocation.promise : Response.json({})
        if (url.includes('/get-session')) return Response.json({ user: { id: 'new', email: 'person@example.invalid', emailVerified: true } })
        return Response.json({})
      } })
    const signingOut = f.auth.signOut()
    await vi.waitFor(() => expect(revocations).toBe(1))
    await f.auth.email('person@example.invalid')
    await expect(f.auth.handleURL(callback(state, '__Secure-better-auth.session_token=new-session'))).resolves.toBe(true)
    oldRevocation.resolve(Response.json({}))
    await signingOut
    expect(f.auth.getCookie()).toBe('__Secure-better-auth.session_token=new-session')
  })

  it('persists an exact 64-hex email nonce before the magic-link HTTP request', async () => {
    const events: string[] = []
    const f = setup({
      fetcher: async () => { events.push('fetch'); return Response.json({}) },
    })
    f.secure.setItem.mockImplementation(async (key, value) => { events.push('store'); f.values.set(key, value) })

    await f.auth.email(' Person@Example.Invalid ')

    expect(events.slice(0, 2)).toEqual(['store', 'fetch'])
    expect(saved(f)).toMatchObject({ pending: { nonce: state, kind: 'email', email: 'person@example.invalid', expires: 301_000 } })
    const [url, init] = f.fetcher.mock.calls[0]
    expect(url).toBe(origin + '/api/auth/sign-in/magic-link')
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { origin } })
    expect(JSON.parse(String(init?.body))).toEqual({ email: 'person@example.invalid',
      callbackURL: `${NATIVE_AUTH_CALLBACK}?state=${state}`,
      newUserCallbackURL: `${NATIVE_AUTH_CALLBACK}?state=${state}`,
      errorCallbackURL: `${NATIVE_AUTH_CALLBACK}?state=${state}` })
  })

  it('rejects unsolicited, wrong-path, wrong-nonce, duplicate, and expired callbacks without an identity request', async () => {
    const cases = [
      { url: callback(), begin: false },
      { url: `friendship-garden://auth/not-callback?state=${state}&cookie=session-value`, begin: false },
      { url: callback(otherState), begin: true },
      { url: `${NATIVE_AUTH_CALLBACK}?state=${state}&state=${state}&cookie=session-value`, begin: true },
      { url: callback(), begin: true, expired: true },
    ]
    for (const test of cases) {
      const f = setup()
      if (test.begin) await f.auth.email('person@example.invalid')
      if (test.expired) f.setNow(301_000)
      const writes = f.secure.setItem.mock.calls.length

      await expect(f.auth.handleURL(test.url)).resolves.toBe(false)

      expect(f.fetcher.mock.calls.filter(([url]) => String(url).includes('/get-session'))).toHaveLength(0)
      expect(f.secure.setItem).toHaveBeenCalledTimes(writes)
    }
  })

  it('verifies the correlated candidate online before it durably acknowledges the cookie', async () => {
    const identity = deferred<Response>()
    const f = setup({ fetcher: async (url) => url.includes('/get-session') ? identity.promise : Response.json({}) })
    await f.auth.email('person@example.invalid')

    const accepted = f.auth.handleURL(callback())
    await vi.waitFor(() => expect(f.fetcher).toHaveBeenCalledTimes(2))
    expect(saved(f)).toMatchObject({ cookie: '', pending: { nonce: state, kind: 'email' } })
    identity.resolve(Response.json({ user: { id: 'user-a', email: 'person@example.invalid', emailVerified: true } }))

    await expect(accepted).resolves.toBe(true)
    expect(saved(f)).toEqual({ version: 1, cookie: sessionCookie, pending: null })
  })

  it.each([
    ['a different user email', { user: { id: 'user-b', email: 'other@example.invalid', emailVerified: true } }],
    ['an unverified user', { user: { id: 'user-a', email: 'person@example.invalid', emailVerified: false } }],
    ['a null session', null],
  ])('does not accept %s', async (_name, response) => {
    const f = setup({ fetcher: async (url) => url.includes('/get-session') ? Response.json(response) : Response.json({}) })
    await f.auth.email('person@example.invalid')

    await expect(f.auth.handleURL(callback())).rejects.toBeInstanceOf(AccountRequestError)

    expect(saved(f)).toMatchObject({ cookie: '', pending: { nonce: state, kind: 'email' } })
  })

  it('consumes an accepted callback once', async () => {
    const f = setup()
    await f.auth.email('person@example.invalid')

    await expect(f.auth.handleURL(callback())).resolves.toBe(true)
    await expect(f.auth.handleURL(callback())).resolves.toBe(false)

    expect(f.fetcher.mock.calls.filter(([url]) => String(url).includes('/get-session'))).toHaveLength(1)
  })

  it('accepts an email callback after an application restart with the pending handoff', async () => {
    const values = new Map<string, string>()
    const first = setup({ values })
    await first.auth.email('person@example.invalid')
    const restarted = setup({ values })

    await expect(restarted.auth.handleURL(callback())).resolves.toBe(true)
    expect(saved(restarted)).toEqual({ version: 1, cookie: sessionCookie, pending: null })
  })

  it('opens only the Google authorization endpoint, propagates oauth state, and consumes its browser callback', async () => {
    const f = setup({
      fetcher: async (url) => {
        if (url.includes('/sign-in/social')) return new Response(JSON.stringify({
          url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=client',
        }), { headers: { 'set-cookie': '__Secure-better-auth.oauth_state=oauth-state; Path=/; Secure' } })
        if (url.includes('/get-session')) return Response.json({ user: { id: 'user-a', email: 'person@example.invalid', emailVerified: true } })
        return Response.json({})
      },
      browser: async () => ({ type: 'success', url: callback() }),
    })

    await expect(f.auth.google()).resolves.toBeUndefined()

    const [opened, expectedCallback] = f.openBrowser.mock.calls[0]
    const proxy = new URL(opened)
    expect(proxy.origin + proxy.pathname).toBe(origin + '/api/auth/expo-authorization-proxy')
    expect(proxy.searchParams.get('authorizationURL')).toBe('https://accounts.google.com/o/oauth2/v2/auth?client_id=client')
    expect(proxy.searchParams.get('oauthState')).toBe('oauth-state')
    expect(expectedCallback).toBe(`${NATIVE_AUTH_CALLBACK}?state=${state}`)
    expect(saved(f)).toEqual({ version: 1, cookie: sessionCookie, pending: null })
  })

  it('clears a Google pending handoff when the browser is cancelled', async () => {
    const f = setup({
      fetcher: async (url) => url.includes('/sign-in/social')
        ? Response.json({ url: 'https://accounts.google.com/o/oauth2/v2/auth' }) : Response.json({}),
    })

    await expect(f.auth.google()).rejects.toBeInstanceOf(AccountRequestError)

    expect(saved(f)).toEqual({ version: 1, cookie: '', pending: null })
  })

  it.each([
    'https://evil.example/o/oauth2/v2/auth',
    'https://accounts.google.com/o/oauth2/v3/auth',
  ])('rejects an unsafe Google authorization target %s', async (target) => {
    const f = setup({ fetcher: async (url) => url.includes('/sign-in/social') ? Response.json({ url: target }) : Response.json({}) })

    await expect(f.auth.google()).rejects.toBeInstanceOf(AccountRequestError)

    expect(f.openBrowser).not.toHaveBeenCalled()
    expect(saved(f)).toEqual({ version: 1, cookie: '', pending: null })
  })

  it('permits a Google callback only from its browser flow or explicit cold start', async () => {
    const browser = deferred<{ type: string, url?: string }>()
    const f = setup({
      fetcher: async (url) => url.includes('/sign-in/social')
        ? Response.json({ url: 'https://accounts.google.com/o/oauth2/v2/auth' })
        : Response.json({ user: { id: 'user-a', email: 'person@example.invalid', emailVerified: true } }),
      browser: async () => browser.promise,
    })
    const signingIn = f.auth.google()
    await vi.waitFor(() => expect(f.openBrowser).toHaveBeenCalledOnce())

    await expect(f.auth.handleURL(callback())).resolves.toBe(false)
    browser.resolve({ type: 'success', url: callback() })
    await expect(signingIn).resolves.toBeUndefined()
  })

  it('fails closed with a generic error when SecureStore cannot create an email draft', async () => {
    const f = setup()
    f.secure.setItem.mockRejectedValue(new Error('private keychain failure'))

    await expect(f.auth.email('person@example.invalid')).rejects.toMatchObject({ status: 0 })
    await expect(f.auth.email('person@example.invalid')).rejects.not.toThrow('private keychain')
    expect(f.fetcher).not.toHaveBeenCalled()
    expect(f.values.get(storageKey)).toBeUndefined()
  })

  it('does not overwrite malformed secure data or disclose its contents', async () => {
    const values = new Map([[storageKey, '{private malformed data']])
    const f = setup({ values })

    await expect(f.auth.session()).rejects.toMatchObject({ status: 0 })
    await expect(f.auth.session()).rejects.not.toThrow('private malformed data')
    expect(f.secure.setItem).not.toHaveBeenCalled()
    expect(f.values.get(storageKey)).toBe('{private malformed data')
    expect(f.fetcher).not.toHaveBeenCalled()
  })

  it('uses a forced fresh get-session lookup and returns an identity without session tokens', async () => {
    const values = new Map([[storageKey, JSON.stringify({ version: 1, cookie: sessionCookie, pending: null })]])
    const f = setup({ values })
    const auth: NativeAuth = f.auth

    await expect(auth.session()).resolves.toEqual({ id: 'user-a', email: 'person@example.invalid' })

    const [url, init] = f.fetcher.mock.calls[0]
    expect(url).toBe(origin + '/api/auth/get-session?disableCookieCache=true&disableRefresh=true')
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error',
      headers: { origin, cookie: sessionCookie } })
  })

  it('never sends a callback through the garden data endpoint', async () => {
    const f = setup()
    await f.auth.email('person@example.invalid')
    await f.auth.handleURL(callback())

    expect(f.fetcher.mock.calls.map(([url]) => String(url))).not.toContain(origin + '/api/garden')
  })

  it('invalidates an in-flight browser callback when signing out', async () => {
    const browser = deferred<{ type: string, url?: string }>()
    const values = new Map([[storageKey, JSON.stringify({ version: 1, cookie: sessionCookie, pending: null })]])
    const f = setup({ values,
      fetcher: async (url) => url.includes('/sign-in/social')
        ? Response.json({ url: 'https://accounts.google.com/o/oauth2/v2/auth' })
        : Response.json({}),
      browser: async () => browser.promise,
    })
    const signingIn = f.auth.google()
    await vi.waitFor(() => expect(f.openBrowser).toHaveBeenCalledOnce())
    const signingOut = f.auth.signOut()
    expect(f.auth.getCookie()).toBe('')
    browser.resolve({ type: 'success', url: callback() })

    await expect(signingOut).resolves.toBeUndefined()
    await expect(signingIn).rejects.toBeInstanceOf(AccountRequestError)
    expect(f.fetcher.mock.calls.some(([url]) => String(url).endsWith('/sign-out'))).toBe(true)
    expect(f.fetcher.mock.calls.some(([url]) => String(url).includes('/get-session'))).toBe(false)
  })

  it('attempts server revocation even if local sign-out persistence fails without leaking the failure', async () => {
    const values = new Map([[storageKey, JSON.stringify({ version: 1, cookie: sessionCookie, pending: null })]])
    const f = setup({ values })
    f.secure.setItem.mockRejectedValue(new Error('private SecureStore error'))

    await expect(f.auth.signOut()).rejects.toMatchObject({ status: 0 })
    await expect(f.auth.signOut()).rejects.not.toThrow('private SecureStore')

    const revoke = f.fetcher.mock.calls.find(([url]) => String(url).endsWith('/sign-out'))
    expect(revoke?.[1]).toMatchObject({ headers: { cookie: sessionCookie } })
    expect(f.auth.getCookie()).toBe('')
  })

  it('durably blocks an old cookie after failed remote sign-out and retries its revocation after restart', async () => {
    const values = new Map([[storageKey, JSON.stringify({ version: 1, cookie: sessionCookie, pending: null })]])
    let fail = true
    const fetcher = async (url: string) => url.endsWith('/sign-out') && fail
      ? Response.json({}, { status: 503 }) : Response.json({})
    const first = setup({ values, fetcher })

    await expect(first.auth.signOut()).rejects.toMatchObject({ status: 503 })
    expect(saved(first)).toEqual({ version: 1, cookie: sessionCookie, pending: null, signedOut: true })

    const restarted = setup({ values, fetcher })
    await expect(restarted.auth.session()).resolves.toBeNull()
    expect(restarted.auth.getCookie()).toBe('')
    fail = false
    await expect(restarted.auth.signOut()).resolves.toBeUndefined()
    expect(saved(restarted)).toEqual({ version: 1, cookie: '', pending: null, signedOut: true })
  })
})
