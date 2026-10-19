import { describe, expect, it, vi } from 'vitest'
import { AccountRequestError, type AccountClient, type AccountUser } from '../../../../packages/garden-sync/src/account'
import { mergeGardenSnapshots, type SyncSnapshot } from '../../../../packages/garden-sync/src/snapshot'
import type { Friend } from '../garden/Friend'
import { createGardenAccount } from './gardenAccount'

const empty = (): SyncSnapshot => ({ version: 1, friends: [], interactions: [] })
const friend = (id: string): Friend => ({ id, name: id, cadenceDays: 14, createdAt: '2026-01-01T00:00:00.000Z', interactions: [] })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function setup() {
  let guestFriends = [friend('guest')]
  let user: AccountUser | null = { id: 'a', email: 'a@example.invalid' }
  let serial = 0
  const values = new Map<string, string>()
  const persistence = {
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { values.set(key, value) }),
  }
  const server = new Map<string, SyncSnapshot>()
  const client = {
    session: vi.fn(async () => user), google: vi.fn(async () => {}), email: vi.fn(async (_email: string) => {}),
    signOut: vi.fn(async () => { user = null }),
    read: vi.fn(async (id: string) => server.get(id) ?? empty()),
    merge: vi.fn(async (id: string, incoming: SyncSnapshot) => {
      if (id !== user?.id) throw new AccountRequestError(409, 'ACCOUNT_CHANGED')
      const result = mergeGardenSnapshots(server.get(id) ?? empty(), incoming)
      server.set(id, result)
      return result
    }),
  } satisfies AccountClient
  const guest = {
    loadFriends: vi.fn(async () => guestFriends),
    saveFriends: vi.fn(async (next: Friend[]) => { guestFriends = next }),
  }
  const options = { guest, persistence, client,
    clock: () => ({ updatedAt: '2026-10-18T00:00:00.000Z', changeId: `change-${++serial}` }) }
  return { options, account: createGardenAccount(options), values, persistence, client, server,
    get guestFriends() { return guestFriends }, setUser(next: AccountUser | null) { user = next } }
}

describe('mobile consent-gated account gardens', () => {
  it('requires initialization or refresh and never reads/uploads a garden without consent', async () => {
    const f = setup()
    await expect(f.account.getSnapshot().storage.loadFriends()).rejects.toThrow('loading')
    await f.account.refresh()
    expect(f.account.getSnapshot().user?.id).toBe('a')
    expect(await f.account.getSnapshot().storage.loadFriends()).toEqual([friend('guest')])
    expect(f.client.read).not.toHaveBeenCalled()
    expect(f.client.merge).not.toHaveBeenCalled()
  })

  it('persists import consent before upload and leaves the original guest garden untouched', async () => {
    const f = setup(); await f.account.initialize(); await f.account.refresh()
    f.client.merge.mockImplementationOnce(async (_id, incoming) => {
      expect(f.persistence.setItem).toHaveBeenCalledOnce()
      return incoming
    })
    await f.account.enable('import')
    expect(f.client.read).toHaveBeenCalledOnce(); expect(f.client.merge).toHaveBeenCalledOnce()
    expect(f.account.getSnapshot().viewAccount?.id).toBe('a')
    expect(f.guestFriends).toEqual([friend('guest')])
  })

  it('waits for pending import consent before a concurrent refresh checks the session', async () => {
    const f = setup(); await f.account.refresh()
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
    expect(f.server.get('a')?.friends.some((item) => item.id === 'guest')).toBe(true)
    expect(f.account.getSnapshot().phase).toBe('ready')
    expect(f.client.session).toHaveBeenCalledTimes(2)
  })

  it('does not let sign-out release a queued refresh into a pending import', async () => {
    const f = setup(); await f.account.refresh()
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
    expect(await f.account.getSnapshot().storage.loadFriends()).toEqual(f.guestFriends)
    expect(f.client.merge).not.toHaveBeenCalled()
    expect(f.client.session).toHaveBeenCalledTimes(1)
  })

  it('enables an account-only garden without importing guest data', async () => {
    const f = setup(); await f.account.refresh(); await f.account.enable('account')
    expect(await f.account.getSnapshot().storage.loadFriends()).toEqual([])
    expect(f.client.merge.mock.calls[0][1]).toEqual(empty())
    expect(f.guestFriends).toEqual([friend('guest')])
  })

  it('does not expose or upload an enabled garden until its asynchronous consent write completes', async () => {
    const f = setup(); await f.account.refresh()
    const gate = deferred<void>()
    f.persistence.setItem.mockImplementationOnce(async (key, value) => { await gate.promise; f.values.set(key, value) })
    const enabling = f.account.enable('import')
    await vi.waitFor(() => expect(f.persistence.setItem).toHaveBeenCalledOnce())
    expect(f.account.getSnapshot().viewAccount).toBeNull()
    expect(f.client.merge).not.toHaveBeenCalled()
    gate.resolve(); await enabling
    expect(f.client.merge).toHaveBeenCalled()
    expect(f.account.getSnapshot().viewAccount?.id).toBe('a')
  })

  it('queues mutations and leaves the visible snapshot unchanged when persistence fails', async () => {
    const f = setup(); await f.account.refresh(); await f.account.enable('import')
    const storage = f.account.getSnapshot().storage
    const before = await storage.loadFriends()
    f.persistence.setItem.mockRejectedValueOnce(new Error('quota'))
    await expect(storage.saveFriends([friend('failed')])).rejects.toThrow()
    expect(await storage.loadFriends()).toEqual(before)
    await storage.saveFriends([friend('saved')])
    expect((await storage.loadFriends()).map(x => x.id)).toEqual(['saved'])
  })

  it('persists offline edits and tombstones, opens the saved copy, and replays it after restart', async () => {
    const f = setup(); await f.account.refresh(); await f.account.enable('import')
    f.client.merge.mockRejectedValue(new AccountRequestError(0))
    await f.account.getSnapshot().storage.saveFriends([friend('offline')])
    await f.account.sync()
    expect(f.account.getSnapshot().phase).toBe('offline')
    const restored = createGardenAccount(f.options)
    await restored.openOffline('a')
    expect((await restored.getSnapshot().storage.loadFriends()).map(x => x.id)).toEqual(['offline'])
    f.client.merge.mockImplementation(async (id, incoming) => {
      const result = mergeGardenSnapshots(f.server.get(id) ?? empty(), incoming); f.server.set(id, result); return result
    })
    await restored.refresh()
    expect(f.server.get('a')?.friends.find(x => x.id === 'guest')?.deleted).toBe(true)
    expect(f.server.get('a')?.friends.find(x => x.id === 'offline')?.deleted).toBe(false)
  })

  it('drains edits made during a POST using the latest persisted snapshot', async () => {
    const f = setup(); await f.account.refresh()
    const post = deferred<SyncSnapshot>()
    f.client.merge.mockImplementationOnce(() => post.promise)
    const enabling = f.account.enable('import')
    await vi.waitFor(() => expect(f.client.merge).toHaveBeenCalledOnce())
    await f.account.getSnapshot().storage.saveFriends([friend('guest'), friend('during-post')])
    post.resolve(f.client.merge.mock.calls[0][1]); await enabling
    expect(f.client.merge.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect((await f.account.getSnapshot().storage.loadFriends()).map(x => x.id)).toEqual(['during-post', 'guest'])
  })

  it('ignores an old account response after switching users and rejects an old binding', async () => {
    const f = setup(); await f.account.refresh(); await f.account.enable('import')
    const oldBinding = f.account.getSnapshot().storage
    const post = deferred<SyncSnapshot>(); f.client.merge.mockImplementationOnce(() => post.promise)
    const before = f.client.merge.mock.calls.length
    const syncing = f.account.sync(); await vi.waitFor(() => expect(f.client.merge).toHaveBeenCalledTimes(before + 1))
    f.setUser({ id: 'b', email: 'b@example.invalid' }); await f.account.refresh()
    await expect(oldBinding.saveFriends([friend('wrong-owner')])).rejects.toThrow('changed')
    post.resolve(f.client.merge.mock.calls.at(-1)![1]); await syncing
    expect(f.account.getSnapshot().user?.id).toBe('b')
    expect(f.account.getSnapshot().viewAccount).toBeNull()
    expect(await f.account.getSnapshot().storage.loadFriends()).toEqual(f.guestFriends)
    expect(f.server.has('b')).toBe(false)
  })

  it('keeps a completed old-account write while logout during that write returns the view to guest', async () => {
    const f = setup(); await f.account.refresh(); await f.account.enable('import')
    const write = deferred<void>()
    const before = f.persistence.setItem.mock.calls.length
    f.persistence.setItem.mockImplementationOnce(async (key, value) => { await write.promise; f.values.set(key, value) })
    const saving = f.account.getSnapshot().storage.saveFriends([friend('durable')])
    const staleResult = expect(saving).rejects.toThrow('changed')
    await vi.waitFor(() => expect(f.persistence.setItem).toHaveBeenCalledTimes(before + 1))
    const signingOut = f.account.signOut()
    expect(f.account.getSnapshot().viewAccount).toBeNull()
    write.resolve(); await Promise.all([staleResult, signingOut])
    expect(f.account.getSnapshot().user).toBeNull()
    expect(await f.account.getSnapshot().storage.loadFriends()).toEqual(f.guestFriends)
    expect(f.client.merge).toHaveBeenCalledTimes(1)
    const reopened = createGardenAccount(f.options); await reopened.openOffline('a')
    expect((await reopened.getSnapshot().storage.loadFriends()).map(x => x.id)).toContain('durable')
  })

  it('calls server sign-out even when local account settings cannot be persisted', async () => {
    const f = setup(); await f.account.refresh(); await f.account.enable('import')
    f.persistence.setItem.mockRejectedValue(new Error('quota'))
    await f.account.signOut()
    expect(f.client.signOut).toHaveBeenCalledOnce()
    expect(f.account.getSnapshot().user).toBeNull()
    expect(await f.account.getSnapshot().storage.loadFriends()).toEqual(f.guestFriends)
  })

  it('fails closed on malformed cached state without overwriting it or affecting guest data', async () => {
    const f = setup(); f.persistence.getItem.mockResolvedValue('{broken')
    await f.account.refresh(); await f.account.enable('import')
    expect(f.persistence.setItem).not.toHaveBeenCalled()
    expect(f.client.read).not.toHaveBeenCalled(); expect(f.client.merge).not.toHaveBeenCalled()
    expect(await f.account.getSnapshot().storage.loadFriends()).toEqual(f.guestFriends)
  })

  it('stops syncing and returns to guest when the server reports ACCOUNT_CHANGED', async () => {
    const f = setup(); await f.account.refresh(); await f.account.enable('import')
    f.client.merge.mockRejectedValueOnce(new AccountRequestError(409, 'ACCOUNT_CHANGED'))
    await f.account.sync()
    expect(f.account.getSnapshot().user).toBeNull()
    expect(f.account.getSnapshot().viewAccount).toBeNull()
    expect(f.account.getSnapshot().error?.toLowerCase()).toContain('account changed')
    expect(await f.account.getSnapshot().storage.loadFriends()).toEqual(f.guestFriends)
  })

  it('applies queued local edits atomically to the latest friends after a remote friend arrives', async () => {
    const f = setup(); await f.account.refresh(); await f.account.enable('account')
    const storage = f.account.getSnapshot().storage
    const write = deferred<void>()
    const before = f.persistence.setItem.mock.calls.length
    f.persistence.setItem.mockImplementationOnce(async (key, value) => { await write.promise; f.values.set(key, value) })
    const localEdit = storage.updateFriends!(current => [...current, friend('local-edit')])
    await vi.waitFor(() => expect(f.persistence.setItem).toHaveBeenCalledTimes(before + 1))
    const remoteSnapshot: SyncSnapshot = { version: 1, friends: [{ id: 'remote', updatedAt: '2026-10-18T00:00:00.000Z',
      changeId: 'remote-change', deleted: false, value: { name: 'remote', cadenceDays: 14, createdAt: '2026-01-01T00:00:00.000Z' } }], interactions: [] }
    // Apply the server change while the local persistence write is blocked.
    f.server.set('a', remoteSnapshot)
    write.resolve(); await localEdit
    await f.account.sync()
    const ids = (await storage.loadFriends()).map(x => x.id).sort()
    expect(ids).toEqual(['local-edit', 'remote'])
  })

  it('does not let a session refresh expose a garden while its acknowledgement write is blocked', async () => {
    const f = setup(); await f.account.refresh(); await f.account.enable('import')
    const ack = deferred<void>()
    const before = f.persistence.setItem.mock.calls.length
    f.persistence.setItem.mockImplementationOnce(async (key, value) => { await ack.promise; f.values.set(key, value) })
    const sync = f.account.sync()
    await vi.waitFor(() => expect(f.persistence.setItem).toHaveBeenCalledTimes(before + 1))
    f.setUser({ id: 'b', email: 'b@example.invalid' })
    const refreshing = f.account.refresh()
    expect(f.account.getSnapshot().viewAccount?.id).toBe('a')
    ack.resolve(); await Promise.all([sync, refreshing])
    expect(f.account.getSnapshot().user?.id).toBe('b')
    expect(f.account.getSnapshot().viewAccount).toBeNull()
    expect(await f.account.getSnapshot().storage.loadFriends()).toEqual(f.guestFriends)
  })

  it('runs a queued edit against the remote acknowledgement committed immediately before it', async () => {
    const f = setup(); await f.account.refresh(); await f.account.enable('account')
    const remote = friend('new-remote')
    f.server.set('a', { version: 1, friends: [{ id: remote.id, deleted: false,
      updatedAt: '2026-10-18T00:00:00.000Z', changeId: 'remote',
      value: { name: remote.name, createdAt: remote.createdAt, cadenceDays: 14 } }], interactions: [] })
    const gate = deferred<void>()
    const before = f.persistence.setItem.mock.calls.length
    f.persistence.setItem.mockImplementationOnce(async (key, value) => { await gate.promise; f.values.set(key, value) })
    const sync = f.account.sync()
    await vi.waitFor(() => expect(f.persistence.setItem).toHaveBeenCalledTimes(before + 1))
    const editing = f.account.getSnapshot().storage.updateFriends!(current => [...current, friend('local')])
    gate.resolve()
    await Promise.all([sync, editing]); await f.account.sync()
    const snapshot = f.server.get('a')!
    expect(snapshot.friends.find(item => item.id === 'new-remote')?.deleted).toBe(false)
    expect((await f.account.getSnapshot().storage.loadFriends()).map(item => item.id)).toEqual(['local', 'new-remote'])
  })
})
