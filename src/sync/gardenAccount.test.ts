import { describe, expect, it, vi } from 'vitest'
import { createGardenAccount } from './gardenAccount'
import { AccountRequestError, type AccountClient, type AccountUser } from './accountClient'
import { mergeGardenSnapshots, type SyncSnapshot } from '../../packages/garden-sync/src/snapshot'
import type { Friend } from '../friends/Friend'

const empty = (): SyncSnapshot => ({ version: 1, friends: [], interactions: [] })
const friend = (id: string): Friend => ({ id, name: id, cadenceDays: 14, createdAt: '2026-01-01T00:00:00.000Z', interactions: [] })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
function setup() {
  let guest = [friend('local-only')]
  let user: AccountUser | null = { id: 'a', email: 'a@example.invalid' }
  let serial = 0
  const values = new Map<string, string>()
  const persistence = { getItem: (key: string) => values.get(key) ?? null, setItem: vi.fn((key: string, value: string) => { values.set(key, value) }) }
  const server = new Map<string, SyncSnapshot>()
  const client = {
    session: vi.fn(async () => user), google: vi.fn(async () => {}), email: vi.fn(async (_email: string) => {}), signOut: vi.fn(async () => { user = null }),
    read: vi.fn(async (id: string) => server.get(id) ?? empty()),
    merge: vi.fn(async (id: string, incoming: SyncSnapshot) => {
      if (id !== user?.id) throw new AccountRequestError(409, 'ACCOUNT_CHANGED')
      const snapshot = mergeGardenSnapshots(server.get(id) ?? empty(), incoming)
      server.set(id, snapshot)
      return snapshot
    }),
  } satisfies AccountClient
  const options = { persistence, client,
    guest: { loadFriends: () => guest, saveFriends: (next: Friend[]) => { guest = next } },
    clock: () => ({ updatedAt: '2026-10-17T00:00:00.000Z', changeId: `change-${++serial}` }),
  }
  return { account: createGardenAccount(options), options, values, persistence, client, server,
    setUser(next: AccountUser | null) { user = next }, get guest() { return guest } }
}

describe('consent-gated account gardens', () => {
  it('does not read or upload any garden merely because the user signed in', async () => {
    const f = setup()
    await f.account.refresh()
    expect(f.account.getSnapshot().user?.id).toBe('a')
    expect(f.account.getSnapshot().storage.loadFriends()).toEqual([friend('local-only')])
    expect(f.client.read).not.toHaveBeenCalled()
    expect(f.client.merge).not.toHaveBeenCalled()
    expect(f.persistence.setItem).not.toHaveBeenCalled()
  })

  it('persists explicit import consent before uploading and preserves the original guest garden', async () => {
    const f = setup()
    await f.account.refresh()
    f.client.merge.mockImplementationOnce(async (id, incoming) => {
      expect(f.persistence.setItem).toHaveBeenCalledOnce()
      expect(id).toBe('a')
      return incoming
    })
    await f.account.enable('import')
    expect(f.client.merge).toHaveBeenCalledOnce()
    expect(f.account.getSnapshot().viewAccount?.id).toBe('a')
    expect(f.account.getSnapshot().storage.loadFriends()[0].name).toBe('local-only')
    expect(f.guest).toEqual([friend('local-only')])
  })

  it('waits for pending import consent before a concurrent refresh checks the session', async () => {
    const f = setup()
    await f.account.refresh()
    const read = deferred<SyncSnapshot>()
    f.client.read.mockImplementationOnce(() => read.promise)

    const enabling = f.account.enable('import')
    await vi.waitFor(() => expect(f.client.read).toHaveBeenCalledOnce())
    const refreshing = Promise.all([f.account.refresh(), f.account.refresh()])
    await Promise.resolve()
    expect(f.client.session).toHaveBeenCalledTimes(1)

    read.resolve(empty())
    await Promise.all([enabling, refreshing])

    expect(f.account.getSnapshot().viewAccount?.id).toBe('a')
    expect(f.server.get('a')?.friends.some((item) => item.id === 'local-only')).toBe(true)
    expect(f.account.getSnapshot().phase).toBe('ready')
    expect(f.client.session).toHaveBeenCalledTimes(2)
  })

  it('releases pending consent when the initial checking notification throws', async () => {
    const f = setup()
    await f.account.refresh()
    let listenerActive = true
    let threw = false
    const unsubscribe = f.account.subscribe(() => {
      if (listenerActive && !threw && f.account.getSnapshot().phase === 'checking') {
        threw = true
        throw new Error('listener failed')
      }
    })

    const enabling = f.account.enable('import')
    listenerActive = false
    unsubscribe()
    await enabling.catch(() => undefined)

    let refreshSettled = false
    const refreshing = f.account.refresh().then(() => { refreshSettled = true })
    await Promise.resolve()
    await vi.waitFor(() => expect(refreshSettled).toBe(true), { timeout: 100 })
    await refreshing
    await f.account.enable('import')
    expect(f.account.getSnapshot().viewAccount?.id).toBe('a')
  })

  it('does not refresh the session while sign-out is revoking it during pending consent', async () => {
    const f = setup()
    await f.account.refresh()
    const read = deferred<SyncSnapshot>()
    const revoke = deferred<void>()
    f.client.read.mockImplementationOnce(() => read.promise)
    f.client.signOut.mockImplementationOnce(async () => { await revoke.promise; f.setUser(null) })

    const enabling = f.account.enable('import')
    await vi.waitFor(() => expect(f.client.read).toHaveBeenCalledOnce())
    const signingOut = f.account.signOut()
    await vi.waitFor(() => expect(f.client.signOut).toHaveBeenCalledOnce())
    const sessionsBeforeRefresh = f.client.session.mock.calls.length
    const refreshing = f.account.refresh()
    read.resolve(empty())
    await Promise.all([enabling, refreshing])
    const sessionsDuringRevocation = f.client.session.mock.calls.length
    const viewDuringRevocation = f.account.getSnapshot().viewAccount

    revoke.resolve()
    await Promise.all([enabling, signingOut, refreshing])
    expect(sessionsDuringRevocation).toBe(sessionsBeforeRefresh)
    expect(viewDuringRevocation).toBeNull()
    expect(f.account.getSnapshot().user).toBeNull()
    expect(f.account.getSnapshot().viewAccount).toBeNull()
    expect(f.account.getSnapshot().storage.loadFriends()).toEqual(f.guest)
    expect(f.client.merge).not.toHaveBeenCalled()
  })

  it('allows refresh and a sign-out retry after revocation fails', async () => {
    const f = setup()
    await f.account.refresh()
    f.client.signOut.mockRejectedValueOnce(new Error('offline'))
    await f.account.signOut()
    expect(f.account.getSnapshot().phase).toBe('offline')
    await f.account.refresh()
    expect(f.client.session).toHaveBeenCalledTimes(2)
    await f.account.signOut()
    expect(f.client.signOut).toHaveBeenCalledTimes(2)
    expect(f.account.getSnapshot().user).toBeNull()
  })

  it('does not let sign-out release a queued refresh into a pending import', async () => {
    const f = setup()
    await f.account.refresh()
    const read = deferred<SyncSnapshot>()
    f.client.read.mockImplementationOnce(() => read.promise)

    const enabling = f.account.enable('import')
    await vi.waitFor(() => expect(f.client.read).toHaveBeenCalledOnce())
    const refreshing = f.account.refresh()
    await Promise.resolve()
    const signingOut = f.account.signOut()
    await signingOut
    read.resolve(empty())
    await Promise.all([enabling, refreshing])

    expect(f.account.getSnapshot().user).toBeNull()
    expect(f.account.getSnapshot().viewAccount).toBeNull()
    expect(f.account.getSnapshot().storage.loadFriends()).toEqual(f.guest)
    expect(f.client.merge).not.toHaveBeenCalled()
    expect(f.client.session).toHaveBeenCalledTimes(1)
  })

  it('can use an account garden without ever importing local guest data', async () => {
    const f = setup()
    await f.account.refresh()
    await f.account.enable('account')
    expect(f.account.getSnapshot().storage.loadFriends()).toEqual([])
    expect(f.client.merge.mock.calls[0][1]).toEqual(empty())
    expect(f.guest).toEqual([friend('local-only')])
  })

  it('saves offline edits and tombstones durably, then replays them after restart', async () => {
    const f = setup()
    await f.account.refresh()
    await f.account.enable('import')
    f.client.merge.mockRejectedValue(new AccountRequestError(0))
    f.account.getSnapshot().storage.saveFriends([friend('new-offline')])
    await f.account.sync()
    expect(f.account.getSnapshot().phase).toBe('offline')
    expect(f.account.getSnapshot().storage.loadFriends().map((item) => item.id)).toEqual(['new-offline'])
    const restored = createGardenAccount(f.options)
    expect(restored.getSnapshot().viewAccount).toBeNull()
    restored.openOffline('a')
    expect(restored.getSnapshot().storage.loadFriends().map((item) => item.id)).toEqual(['new-offline'])
    f.client.merge.mockImplementation(async (id, incoming) => {
      const result = mergeGardenSnapshots(f.server.get(id) ?? empty(), incoming)
      f.server.set(id, result)
      return result
    })
    await restored.refresh()
    expect(f.server.get('a')?.friends.find((item) => item.id === 'local-only')?.deleted).toBe(true)
    expect(f.server.get('a')?.friends.find((item) => item.id === 'new-offline')?.deleted).toBe(false)
  })

  it('does not lose edits made while an upload is in flight', async () => {
    const f = setup()
    await f.account.refresh()
    let resolve!: (snapshot: SyncSnapshot) => void
    f.client.merge.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    const enabling = f.account.enable('import')
    await vi.waitFor(() => expect(f.client.merge).toHaveBeenCalledOnce())
    f.account.getSnapshot().storage.saveFriends([friend('local-only'), friend('while-uploading')])
    resolve(f.client.merge.mock.calls[0][1])
    await enabling
    expect(f.client.merge).toHaveBeenCalledTimes(2)
    expect(f.account.getSnapshot().storage.loadFriends().map((item) => item.id)).toEqual(['local-only', 'while-uploading'])
  })

  it('never applies an old account response or stale UI action after switching accounts', async () => {
    const f = setup()
    await f.account.refresh()
    await f.account.enable('import')
    const oldBinding = f.account.getSnapshot().storage
    let resolve!: (snapshot: SyncSnapshot) => void
    f.client.merge.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    const oldSync = f.account.sync()
    f.setUser({ id: 'b', email: 'b@example.invalid' })
    await f.account.refresh()
    expect(() => oldBinding.saveFriends([friend('wrong-owner')])).toThrow('changed')
    resolve(f.client.merge.mock.calls[f.client.merge.mock.calls.length - 1][1])
    await oldSync
    expect(f.account.getSnapshot().user?.id).toBe('b')
    expect(f.account.getSnapshot().viewAccount).toBeNull()
    expect(f.account.getSnapshot().storage.loadFriends()).toEqual(f.guest)
    expect(f.server.has('b')).toBe(false)
  })

  it('stops uploads if the cookie switches accounts before the request reaches the server', async () => {
    const f = setup()
    await f.account.refresh()
    await f.account.enable('import')
    f.setUser({ id: 'b', email: 'b@example.invalid' })
    await f.account.sync()
    expect(f.account.getSnapshot().user).toBeNull()
    expect(f.account.getSnapshot().error).toContain('account changed')
    expect(f.server.has('b')).toBe(false)
  })

  it('never uploads or switches gardens when saving consent fails', async () => {
    const f = setup()
    await f.account.refresh()
    f.persistence.setItem.mockImplementation(() => { throw new Error('quota private details') })
    await f.account.enable('import')
    expect(f.client.merge).not.toHaveBeenCalled()
    expect(f.account.getSnapshot().viewAccount).toBeNull()
    expect(f.account.getSnapshot().storage.loadFriends()).toEqual(f.guest)
    expect(f.account.getSnapshot().error).not.toContain('private')
  })

  it('keeps the prior account snapshot when a local edit cannot be persisted', async () => {
    const f = setup()
    await f.account.refresh()
    await f.account.enable('import')
    const before = f.account.getSnapshot().storage.loadFriends()
    const calls = f.client.merge.mock.calls.length
    f.persistence.setItem.mockImplementation(() => { throw new Error('quota') })
    expect(() => f.account.getSnapshot().storage.saveFriends([friend('not-saved')])).toThrow()
    expect(f.account.getSnapshot().storage.loadFriends()).toEqual(before)
    expect(f.client.merge).toHaveBeenCalledTimes(calls)
  })

  it('returns to the original local garden on sign-out and pauses saved account syncing', async () => {
    const f = setup()
    await f.account.refresh()
    await f.account.enable('import')
    await f.account.signOut()
    expect(f.account.getSnapshot().user).toBeNull()
    expect(f.account.getSnapshot().storage.loadFriends()).toEqual(f.guest)
    const calls = f.client.merge.mock.calls.length
    f.setUser({ id: 'a', email: 'a@example.invalid' })
    await f.account.refresh()
    expect(f.account.getSnapshot().viewAccount).toBeNull()
    expect(f.client.merge).toHaveBeenCalledTimes(calls)
  })

  it('still revokes the server session when local settings cannot be updated on sign-out', async () => {
    const f = setup()
    await f.account.refresh()
    await f.account.enable('import')
    f.persistence.setItem.mockImplementation(() => { throw new Error('quota') })
    await f.account.signOut()
    expect(f.client.signOut).toHaveBeenCalledOnce()
    expect(f.account.getSnapshot().user).toBeNull()
    expect(f.account.getSnapshot().storage.loadFriends()).toEqual(f.guest)
  })

  it('fails closed on corrupt account storage without replacing it or harming the guest garden', async () => {
    const f = setup()
    f.options.persistence.getItem = () => '{invalid'
    const account = createGardenAccount(f.options)
    await account.refresh()
    await account.enable('import')
    expect(f.persistence.setItem).not.toHaveBeenCalled()
    expect(f.client.merge).not.toHaveBeenCalled()
    expect(account.getSnapshot().storage.loadFriends()).toEqual(f.guest)
  })
})
