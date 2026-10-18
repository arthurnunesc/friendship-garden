import { AccountRequestError, type AccountUser } from '../../../../packages/garden-sync/src/account'
import { NATIVE_AUTH_CALLBACK, nativeCookieValue, parseNativeAuthCallback } from '../../../../packages/garden-sync/src/nativeAuth'
import type { NativeAuth } from './accountClient'

interface Pending { nonce: string, expires: number, kind: 'google' | 'email', email?: string }
interface Credentials { version: 1, cookie: string, pending: Pending | null, signedOut?: boolean }
export interface NativeAuthDependencies {
  origin: string
  secure: { getItem(key: string): Promise<string | null>, setItem(key: string, value: string): Promise<void> }
  fence: { getItem(key: string): Promise<string | null>, setItem(key: string, value: string): Promise<void> }
  randomState(): Promise<string>
  openBrowser(url: string, callback: string): Promise<{ type: string, url?: string }>
  fetcher?: typeof fetch
  now?: () => number
}

/** Device-correlated handoff; only a server-validated session reaches durable secure storage. */
export function createNativeAuth(options: NativeAuthDependencies): NativeAuth & {
  handleURL(url: string, coldStart?: boolean): Promise<boolean>
} {
  const origin = new URL(options.origin)
  if (origin.protocol !== 'https:' || origin.origin !== options.origin) throw new Error('Configure an HTTPS account origin.')
  const key = 'friendship-garden.auth.' + [...options.origin].map(char => char.charCodeAt(0).toString(16)).join('')
  const fetcher = options.fetcher ?? ((...args) => fetch(...args))
  const now = options.now ?? Date.now
  let credentials: Credentials | null = null
  let queue: Promise<unknown> = Promise.resolve()
  let epoch = 0
  let blocked = false
  const failure = () => new AccountRequestError(0)
  const serialize = <T,>(action: () => Promise<T>): Promise<T> => {
    const result = queue.then(action).catch((error: unknown) => {
      throw error instanceof AccountRequestError ? error : failure()
    })
    queue = result.catch(() => {})
    return result
  }
  async function load(): Promise<Credentials> {
    if (credentials) return credentials
    const fence = await options.fence.getItem(key)
    if (fence !== null && fence !== 'signed-out' && fence !== 'active') throw failure()
    if (fence === 'signed-out') blocked = true
    const raw = await options.secure.getItem(key)
    if (raw === null) return credentials = { version: 1, cookie: '', pending: null }
    const value = JSON.parse(raw) as Credentials
    if (value?.version !== 1 || typeof value.cookie !== 'string'
      || (value.cookie !== '' && !/^__Secure-better-auth\.session_token=[A-Za-z0-9._~%+\/-]+={0,2}$/.test(value.cookie))) throw failure()
    if (value.pending !== null && (!value.pending || !/^[a-f0-9]{64}$/.test(value.pending.nonce)
      || !Number.isFinite(value.pending.expires) || !['google', 'email'].includes(value.pending.kind)
      || (value.pending.kind === 'email' && typeof value.pending.email !== 'string'))) throw failure()
    if (value.signedOut !== undefined && typeof value.signedOut !== 'boolean') throw failure()
    if (value.signedOut) blocked = true
    return credentials = value
  }
  async function persist(next: Credentials) {
    await options.secure.setItem(key, JSON.stringify(next))
    credentials = next
  }
  async function request(path: string, body?: object, cookie = '') {
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), 15_000)
    try {
      const response = await fetcher(options.origin + '/api/auth' + path, {
        method: body ? 'POST' : 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: abort.signal,
        headers: { origin: options.origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      if (!response.ok) throw new AccountRequestError(response.status)
      return response
    } catch (error) { throw error instanceof AccountRequestError ? error : failure() }
    finally { clearTimeout(timer) }
  }
  async function identity(cookie: string): Promise<AccountUser | null> {
    const response = await request('/get-session?disableCookieCache=true&disableRefresh=true', undefined, cookie)
    const value = await response.json()
    if (value === null) return null
    if (typeof value?.user?.id !== 'string' || !value.user.id.trim()
      || typeof value.user.email !== 'string' || !value.user.email.trim() || value.user.emailVerified !== true) throw failure()
    return { id: value.user.id, email: value.user.email }
  }
  async function begin(kind: Pending['kind'], email?: string) {
    const ticket = ++epoch
    const nonce = await options.randomState()
    if (!/^[a-f0-9]{64}$/.test(nonce)) throw failure()
    await serialize(async () => {
      if (ticket !== epoch) throw failure()
      let previous = await load()
      if (blocked || previous.signedOut) {
        // Never discard the last cookie until its pending server revocation succeeds.
        if (previous.cookie) await request('/sign-out', {}, previous.cookie)
        previous = { version: 1, cookie: '', pending: null, signedOut: true }
        await persist(previous)
        await options.fence.setItem(key, 'active')
        blocked = false
      }
      await persist({ ...previous, pending: { nonce, kind, ...(email ? { email } : {}), expires: now() + 300_000 } })
    })
    if (ticket !== epoch) throw failure()
    return { ticket, nonce, callback: NATIVE_AUTH_CALLBACK + '?state=' + nonce }
  }
  const cancel = (nonce: string) => serialize(async () => {
    const saved = await load()
    if (saved.pending?.nonce === nonce) await persist({ ...saved, pending: null })
  })
  async function accept(url: string, allowGoogle: boolean): Promise<boolean> {
    const callback = parseNativeAuthCallback(url, true)
    if (!callback) return false
    const ticket = epoch
    return serialize(async () => {
      const saved = await load()
      const pending = saved.pending
      if (!pending || ticket !== epoch || pending.nonce !== callback.searchParams.get('state')
        || pending.expires <= now() || (!allowGoogle && pending.kind === 'google')) return false
      if (callback.searchParams.has('error')) {
        await persist({ ...saved, pending: null })
        throw failure()
      }
      const value = nativeCookieValue(callback.searchParams.get('cookie') ?? '', 'session_token')
      if (!value) throw failure()
      const cookie = '__Secure-better-auth.session_token=' + value
      const user = await identity(cookie)
      if (ticket !== epoch) return false
      if (!user || (pending.kind === 'email' && user.email.toLowerCase() !== pending.email)) throw failure()
      await persist({ version: 1, cookie, pending: null })
      if (ticket !== epoch) return false
      blocked = false
      return true
    })
  }
  return {
    getCookie: () => blocked ? '' : credentials?.cookie ?? '',
    session: () => serialize(async () => {
      const ticket = epoch
      const saved = await load()
      if (blocked || !saved.cookie) return null
      const user = await identity(saved.cookie)
      if (ticket !== epoch) return null
      if (!user) await persist({ ...saved, cookie: '' })
      return user
    }),
    async google() {
      let nonce: string | undefined
      try {
        const attempt = await begin('google')
        nonce = attempt.nonce
        const response = await request('/sign-in/social', { provider: 'google', callbackURL: attempt.callback, errorCallbackURL: attempt.callback })
        if (attempt.ticket !== epoch) throw failure()
        const result = await response.json()
        const target = new URL(result.url)
        if (target.origin !== 'https://accounts.google.com' || target.pathname !== '/o/oauth2/v2/auth'
          || target.username || target.password || target.hash) throw failure()
        const proxy = new URL(options.origin + '/api/auth/expo-authorization-proxy')
        proxy.searchParams.set('authorizationURL', target.toString())
        const oauthState = nativeCookieValue(response.headers.get('set-cookie') ?? '', 'oauth_state')
        if (oauthState) proxy.searchParams.set('oauthState', oauthState)
        const browser = await options.openBrowser(proxy.toString(), attempt.callback)
        if (attempt.ticket !== epoch || browser.type !== 'success' || !browser.url || !await accept(browser.url, true)) throw failure()
      } catch (error) {
        if (nonce) await cancel(nonce)
        throw error instanceof AccountRequestError ? error : failure()
      }
    },
    async email(address) {
      const email = address.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw failure()
      let nonce: string | undefined
      try {
        const attempt = await begin('email', email)
        nonce = attempt.nonce
        await request('/sign-in/magic-link', { email, callbackURL: attempt.callback,
          newUserCallbackURL: attempt.callback, errorCallbackURL: attempt.callback })
        if (attempt.ticket !== epoch) throw failure()
      } catch (error) {
        if (nonce) await cancel(nonce)
        throw error instanceof AccountRequestError ? error : failure()
      }
    },
    async signOut() {
      const ticket = ++epoch
      blocked = true
      let cookie = ''
      let storageFailed = false
      await serialize(async () => {
        // This independent store contains no token. It protects restart if Keychain writes fail.
        try { await options.fence.setItem(key, 'signed-out') } catch { /* The secure marker is still attempted. */ }
        try {
          const saved = await load()
          cookie = saved.cookie
          await persist({ ...saved, signedOut: true, pending: null })
        } catch { storageFailed = true }
      })
      // Revocation is attempted even if secure storage could not be cleared.
      if (cookie) await request('/sign-out', {}, cookie)
      if (storageFailed) throw failure()
      await serialize(async () => {
        if (ticket === epoch) await persist({ version: 1, cookie: '', pending: null, signedOut: true })
      })
    },
    handleURL: (url, coldStart = false) => accept(url, coldStart),
  }
}

export type NativeAuthController = ReturnType<typeof createNativeAuth>
