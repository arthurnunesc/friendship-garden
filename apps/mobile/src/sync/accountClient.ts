import { AccountRequestError, type AccountClient, type AccountUser } from '../../../../packages/garden-sync/src/account'
import { mergeGardenSnapshots, type SyncSnapshot } from '../../../../packages/garden-sync/src/snapshot'
import { parseEmailReminderSettings } from '../../../../packages/garden-sync/src/reminderSettings'

/** The native auth adapter owns secure credential storage and provider callbacks. */
export interface NativeAuth {
  session(): Promise<AccountUser | null>
  google(): Promise<void>
  email(email: string): Promise<void>
  signOut(): Promise<void>
  getCookie(): string
}

export function createNativeAccountClient(options: {
  origin: string
  auth: NativeAuth
  fetcher?: typeof fetch
}): AccountClient {
  const { auth } = options
  const configured = new URL(options.origin)
  if (configured.protocol !== 'https:' || configured.origin !== options.origin) {
    throw new Error('Account sync needs a configured HTTPS origin.')
  }
  const origin = configured.origin
  const fetcher = options.fetcher ?? ((...args) => fetch(...args))
  async function request(userId: string, path: string, method: string, incoming?: unknown): Promise<unknown> {
    if (!userId.trim()) throw new AccountRequestError(401)
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), 15_000)
    try {
      const cookie = auth.getCookie()
      if (!cookie) throw new AccountRequestError(401)
      const response = await fetcher(origin + path, {
        method,
        credentials: 'omit', redirect: 'error', signal: abort.signal,
        // React Native's cache option adds a query parameter, which this endpoint rejects.
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store', origin, cookie, 'x-garden-account': userId },
        ...(incoming === undefined ? {} : { body: JSON.stringify(incoming) }),
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
    } finally { clearTimeout(timer) }
  }
  async function snapshot(userId: string, incoming?: SyncSnapshot): Promise<SyncSnapshot> {
    try { return mergeGardenSnapshots({ version: 1, friends: [], interactions: [] }, await request(userId, '/api/garden', incoming === undefined ? 'GET' : 'POST', incoming)) }
    catch (error) { if (error instanceof AccountRequestError) throw error; throw new AccountRequestError(0) }
  }
  async function reminderRequest(userId: string, method: string, incoming?: unknown) {
    try { return parseEmailReminderSettings(await request(userId, '/api/email-reminders', method, incoming)) }
    catch (error) { if (error instanceof AccountRequestError) throw error; throw new AccountRequestError(0) }
  }
  async function authAction<T>(action: () => Promise<T>): Promise<T> {
    try { return await action() } catch (error) {
      if (error instanceof AccountRequestError) throw error
      throw new AccountRequestError(0)
    }
  }
  return {
    emailReminders: {
      read: (userId) => reminderRequest(userId, 'GET'),
      update: (userId, change) => reminderRequest(userId, 'PUT', change),
    },
    async session() {
      const user = await authAction(() => auth.session())
      if (user === null) return null
      if (!user || typeof user.id !== 'string' || !user.id.trim()
        || typeof user.email !== 'string' || !user.email.trim()) throw new AccountRequestError(0)
      return { id: user.id, email: user.email }
    },
    google: () => authAction(() => auth.google()),
    email: (email) => authAction(() => auth.email(email)),
    signOut: () => authAction(() => auth.signOut()),
    read: (userId) => snapshot(userId),
    merge: (userId, incoming) => snapshot(userId, incoming),
  }
}
