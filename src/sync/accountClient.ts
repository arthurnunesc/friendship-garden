import { mergeGardenSnapshots, type SyncSnapshot } from '../../packages/garden-sync/src/snapshot'

export interface AccountUser { id: string, email: string }
export interface AccountClient {
  session(): Promise<AccountUser | null>
  google(): Promise<void>
  email(email: string): Promise<void>
  signOut(): Promise<void>
  read(userId: string): Promise<SyncSnapshot>
  merge(userId: string, snapshot: SyncSnapshot): Promise<SyncSnapshot>
}

export class AccountRequestError extends Error {
  constructor(public readonly status: number, public readonly code?: string) {
    super(status === 401 ? 'Your session ended. Sign in again; your changes are kept on this device.'
      : code === 'ACCOUNT_CHANGED' ? 'Your account changed. Reconnect before syncing.'
      : status === 409 ? 'Two changes have the same sync version. Your local changes are kept.'
      : status === 413 ? 'This garden is too large to sync. Your changes are kept on this device.'
      : status === 429 ? 'Too many sign-in attempts. Try again in a minute.'
      : 'Cannot connect right now. Your garden is safe on this device. Try again.')
  }
}

const empty = (): SyncSnapshot => ({ version: 1, friends: [], interactions: [] })

export function createAccountClient(
  origin: string,
  fetcher: typeof fetch = (...args) => fetch(...args),
  navigate: (url: string) => void = (url) => window.location.assign(url),
): AccountClient {
  async function request(path: string, method = 'GET', body?: unknown, userId?: string): Promise<unknown> {
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), 15_000)
    try {
      const response = await fetcher(origin + path, {
        method, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: abort.signal,
        headers: { 'content-type': 'application/json', ...(userId ? { 'x-garden-account': userId } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
      const result: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const code = result && typeof result === 'object' && 'code' in result ? result.code : undefined
        throw new AccountRequestError(response.status, code === 'ACCOUNT_CHANGED' ? code : undefined)
      }
      return result
    } catch (error) {
      if (error instanceof AccountRequestError) throw error
      throw new AccountRequestError(0)
    } finally {
      clearTimeout(timer)
    }
  }

  function snapshot(value: unknown): SyncSnapshot {
    try { return mergeGardenSnapshots(empty(), value) } catch { throw new AccountRequestError(0) }
  }
  return {
    async session() {
      const value = await request('/api/auth/get-session')
      if (value === null) return null
      const user = (value as { user?: Partial<AccountUser> }).user
      if (!user || typeof user.id !== 'string' || !user.id.trim() || typeof user.email !== 'string' || !user.email.trim()) {
        throw new AccountRequestError(0)
      }
      return { id: user.id, email: user.email }
    },
    async google() {
      const value = await request('/api/auth/sign-in/social', 'POST', {
        provider: 'google', callbackURL: origin + '/', errorCallbackURL: origin + '/?sign-in-error=1', disableRedirect: true,
      })
      try {
        const url = new URL((value as { url: string }).url)
        if (url.origin !== 'https://accounts.google.com') throw new Error()
        navigate(url.href)
      } catch { throw new AccountRequestError(0) }
    },
    async email(email) {
      await request('/api/auth/sign-in/magic-link', 'POST', {
        email, callbackURL: origin + '/', errorCallbackURL: origin + '/?sign-in-error=1',
      })
    },
    async signOut() { await request('/api/auth/sign-out', 'POST') },
    async read(userId) { return snapshot(await request('/api/garden', 'GET', undefined, userId)) },
    async merge(userId, incoming) { return snapshot(await request('/api/garden', 'POST', incoming, userId)) },
  }
}
