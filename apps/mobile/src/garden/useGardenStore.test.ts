import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { createFriend, exportGarden, type Friend } from './Friend'
import { useGardenStore } from './useGardenStore'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

describe('garden replacement boundary', () => {
  it('rejects replacement before hydration so a pending load cannot overwrite it', async () => {
    let finishLoad!: (friends: Friend[]) => void
    const original = createFriend({ name: 'Alice' })
    const storage = {
      loadFriends: vi.fn(() => new Promise<Friend[]>((resolve) => { finishLoad = resolve })),
      saveFriends: vi.fn(async () => {}),
    }
    let garden!: ReturnType<typeof useGardenStore>
    function Harness() { garden = useGardenStore(storage); return null }
    let view!: ReactTestRenderer
    await act(async () => { view = create(createElement(Harness)) })
    await expect(garden.importGarden(exportGarden([]))).rejects.toThrow('Garden is still loading')
    await act(async () => { await expect(garden.addFriend({ name: 'Bob' })).resolves.toBe(false) })
    expect(storage.saveFriends).not.toHaveBeenCalled()
    await act(async () => { finishLoad([original]) })
    expect(garden.friends).toEqual([original])
    await act(async () => { view.unmount() })
  })

  it('imports validated data and persists it before replacing the garden', async () => {
    const original = createFriend({ name: 'Alice' })
    const imported = createFriend({ name: 'Bob' })
    const storage = { loadFriends: vi.fn(async () => [original]), saveFriends: vi.fn(async () => {}) }
    let garden!: ReturnType<typeof useGardenStore>
    function Harness() { garden = useGardenStore(storage); return null }
    let view!: ReactTestRenderer
    await act(async () => { view = create(createElement(Harness)) })
    await act(async () => { await garden.importGarden(exportGarden([imported])) })
    expect(garden.friends).toEqual([imported])
    expect(storage.saveFriends).toHaveBeenLastCalledWith([imported])
    await act(async () => { view.unmount() })
  })

  it('leaves the existing garden intact for malformed imports or failed persistence', async () => {
    const original = createFriend({ name: 'Alice' })
    const storage = { loadFriends: vi.fn(async () => [original]), saveFriends: vi.fn(async () => {}) }
    let garden!: ReturnType<typeof useGardenStore>
    function Harness() { garden = useGardenStore(storage); return null }
    let view!: ReactTestRenderer
    await act(async () => { view = create(createElement(Harness)) })
    await act(async () => { expect((await garden.importGarden({ friends: [] })).success).toBe(false) })
    expect(storage.saveFriends).not.toHaveBeenCalled()
    storage.saveFriends.mockRejectedValueOnce(new Error('Storage unavailable'))
    await act(async () => {
      await expect(garden.importGarden(exportGarden([]))).rejects.toThrow('Storage unavailable')
    })
    expect(garden.friends).toEqual([original])
    expect(garden.error).toBe('Unable to save garden changes. Please try again.')
    await act(async () => { view.unmount() })
  })
})

describe('garden mutations', () => {
  it('blocks mutations and reminders-ready state after a failed load until retry succeeds', async () => {
    const original = createFriend({ name: 'Preserved' })
    const storage = { loadFriends: vi.fn().mockRejectedValueOnce(new Error('private storage path')).mockResolvedValueOnce([original]),
      saveFriends: vi.fn(async () => {}) }
    let garden!: ReturnType<typeof useGardenStore>
    function Harness() { garden = useGardenStore(storage); return null }
    let view!: ReactTestRenderer
    await act(async () => { view = create(createElement(Harness)) })
    expect(garden.loaded).toBe(false)
    expect(garden.error).not.toContain('private')
    await act(async () => { expect(await garden.addFriend({ name: 'Must not overwrite' })).toBe(false) })
    expect(storage.saveFriends).not.toHaveBeenCalled()
    await act(async () => { await garden.retryLoad() })
    expect(garden.loaded).toBe(true)
    expect(garden.friends).toEqual([original])
    await act(async () => { view.unmount() })
  })

  it('keeps state unchanged and returns false when durable persistence fails', async () => {
    const original = createFriend({ name: 'Alice' })
    const storage = {
      loadFriends: vi.fn(async () => [original]),
      saveFriends: vi.fn(async () => { throw new Error('secret backend detail') }),
    }
    let garden!: ReturnType<typeof useGardenStore>
    function Harness() { garden = useGardenStore(storage); return null }
    let view!: ReactTestRenderer
    await act(async () => { view = create(createElement(Harness)) })
    await act(async () => { await expect(garden.addFriend({ name: 'Bob' })).resolves.toBe(false) })
    expect(garden.friends).toEqual([original])
    expect(garden.error).toBe('Unable to save garden changes. Please try again.')
    await act(async () => { view.unmount() })
  })

  it('serializes rapid adds from the latest committed garden', async () => {
    const storage = { loadFriends: vi.fn(async () => []), saveFriends: vi.fn(async (_friends: Friend[]) => {}) }
    let garden!: ReturnType<typeof useGardenStore>
    function Harness() { garden = useGardenStore(storage); return null }
    let view!: ReactTestRenderer
    await act(async () => { view = create(createElement(Harness)) })
    let results!: boolean[]
    await act(async () => { results = await Promise.all([garden.addFriend({ name: 'Alice' }), garden.addFriend({ name: 'Bob' })]) })
    expect(results).toEqual([true, true])
    expect(garden.friends.map((friend) => friend.name)).toEqual(['Alice', 'Bob'])
    expect(storage.saveFriends.mock.calls[1][0].map((friend: Friend) => friend.name)).toEqual(['Alice', 'Bob'])
    await act(async () => { view.unmount() })
  })

  it('serializes watering and edits without losing either change', async () => {
    const original = createFriend({ name: 'Alice' })
    const storage = { loadFriends: vi.fn(async () => [original]), saveFriends: vi.fn(async () => {}) }
    let garden!: ReturnType<typeof useGardenStore>
    function Harness() { garden = useGardenStore(storage); return null }
    let view!: ReactTestRenderer
    await act(async () => { view = create(createElement(Harness)) })
    await act(async () => {
      await Promise.all([
        garden.waterFriend(original.id, 'call', 'hello'),
        garden.updateFriend(original.id, { name: 'Alicia', cadenceDays: 21 }),
      ])
    })
    expect(garden.friends[0]).toMatchObject({ name: 'Alicia', cadenceDays: 21 })
    expect(garden.friends[0].interactions).toHaveLength(1)
    await act(async () => { view.unmount() })
  })

  it('continues a queued mutation after an earlier save fails', async () => {
    const storage = {
      loadFriends: vi.fn(async () => []),
      saveFriends: vi.fn().mockRejectedValueOnce(new Error('nope')).mockResolvedValueOnce(undefined),
    }
    let garden!: ReturnType<typeof useGardenStore>
    function Harness() { garden = useGardenStore(storage); return null }
    let view!: ReactTestRenderer
    await act(async () => { view = create(createElement(Harness)) })
    let results!: boolean[]
    await act(async () => { results = await Promise.all([garden.addFriend({ name: 'Alice' }), garden.addFriend({ name: 'Bob' })]) })
    expect(results).toEqual([false, true])
    expect(garden.friends.map((friend) => friend.name)).toEqual(['Bob'])
    await act(async () => { view.unmount() })
  })

  it('does not publish an old load after storage changes', async () => {
    const oldLoad = deferred<Friend[]>()
    const oldStorage = { loadFriends: vi.fn(() => oldLoad.promise), saveFriends: vi.fn(async () => {}) }
    const fresh = createFriend({ name: 'Fresh' })
    const newLoad = deferred<Friend[]>()
    const newStorage = { loadFriends: vi.fn(() => newLoad.promise), saveFriends: vi.fn(async () => {}) }
    let garden!: ReturnType<typeof useGardenStore>
    function Harness({ storage }: { storage: typeof oldStorage | typeof newStorage }) {
      garden = useGardenStore(storage)
      return null
    }
    let view!: ReactTestRenderer
    await act(async () => { view = create(createElement(Harness, { storage: oldStorage })) })
    await act(async () => { view.update(createElement(Harness, { storage: newStorage })) })
    expect(garden.loaded).toBe(false)
    await act(async () => { oldLoad.resolve([createFriend({ name: 'Old' })]) })
    expect(garden.loaded).toBe(false)
    await act(async () => { newLoad.resolve([fresh]) })
    expect(garden.friends).toEqual([fresh])
    await act(async () => { view.unmount() })
  })

  it('invalidates pending and queued writes when storage changes', async () => {
    const pendingSave = deferred<void>()
    const oldStorage = { loadFriends: vi.fn(async () => []), saveFriends: vi.fn(() => pendingSave.promise) }
    const fresh = createFriend({ name: 'Fresh' })
    const newStorage = { loadFriends: vi.fn(async () => [fresh]), saveFriends: vi.fn(async () => {}) }
    let garden!: ReturnType<typeof useGardenStore>
    function Harness({ storage }: { storage: typeof oldStorage | typeof newStorage }) {
      garden = useGardenStore(storage)
      return null
    }
    let view!: ReactTestRenderer
    await act(async () => { view = create(createElement(Harness, { storage: oldStorage })) })
    const first = garden.addFriend({ name: 'Old one' })
    const second = garden.addFriend({ name: 'Old two' })
    await act(async () => { await Promise.resolve() })
    expect(oldStorage.saveFriends).toHaveBeenCalledTimes(1)
    await act(async () => { view.update(createElement(Harness, { storage: newStorage })) })
    await act(async () => { pendingSave.resolve() })
    await expect(first).resolves.toBe(false)
    await expect(second).resolves.toBe(false)
    expect(newStorage.saveFriends).not.toHaveBeenCalled()
    expect(garden.friends).toEqual([fresh])
    await act(async () => { view.unmount() })
  })

  it('serializes imports with ordinary edits', async () => {
    const original = createFriend({ name: 'Alice' })
    const imported = createFriend({ name: 'Bob' })
    const storage = { loadFriends: vi.fn(async () => [original]), saveFriends: vi.fn(async () => {}) }
    let garden!: ReturnType<typeof useGardenStore>
    function Harness() { garden = useGardenStore(storage); return null }
    let view!: ReactTestRenderer
    await act(async () => { view = create(createElement(Harness)) })
    await act(async () => {
      await Promise.all([
        garden.importGarden(exportGarden([imported])),
        garden.updateFriend(imported.id, { name: 'Robert', cadenceDays: 30 }),
      ])
    })
    expect(garden.friends).toMatchObject([{ id: imported.id, name: 'Robert', cadenceDays: 30 }])
    expect(storage.saveFriends).toHaveBeenCalledTimes(2)
    await act(async () => { view.unmount() })
  })

  it('reloads the published garden when storage notifies subscribers', async () => {
    const original = createFriend({ name: 'Alice' })
    const remote = createFriend({ name: 'Bob' })
    let notify!: () => void
    const storage = {
      loadFriends: vi.fn().mockResolvedValueOnce([original]).mockResolvedValueOnce([remote]),
      saveFriends: vi.fn(async () => {}),
      subscribe: vi.fn((listener: () => void) => { notify = listener; return () => {} }),
    }
    let garden!: ReturnType<typeof useGardenStore>
    function Harness() { garden = useGardenStore(storage); return null }
    let view!: ReactTestRenderer
    await act(async () => { view = create(createElement(Harness)) })
    await act(async () => { notify() })
    expect(garden.friends).toEqual([remote])
    expect(storage.subscribe).toHaveBeenCalledTimes(1)
    await act(async () => { view.unmount() })
  })

  it('uses the storage atomic update boundary instead of a stale displayed garden', async () => {
    const old = createFriend({ name: 'Alice' })
    const remote = createFriend({ name: 'Remote friend' })
    const storage = {
      loadFriends: vi.fn(async () => [old]), saveFriends: vi.fn(async () => {}),
      updateFriends: vi.fn(async (change: (current: Friend[]) => Friend[]) => change([old, remote])),
    }
    let garden!: ReturnType<typeof useGardenStore>
    function Harness() { garden = useGardenStore(storage); return null }
    let view!: ReactTestRenderer
    await act(async () => { view = create(createElement(Harness)) })
    await act(async () => { await garden.updateFriend(old.id, { name: 'Alicia', cadenceDays: 21 }) })
    expect(garden.friends.map(friend => friend.name)).toEqual(['Alicia', 'Remote friend'])
    expect(storage.saveFriends).not.toHaveBeenCalled()
    await act(async () => { view.unmount() })
  })

  it('replays storage notifications received while an import is being persisted', async () => {
    let current: Friend[] = []
    let notify!: () => void
    const remote = createFriend({ name: 'Remote' })
    const imported = createFriend({ name: 'Imported' })
    const storage = {
      loadFriends: vi.fn(async () => current),
      saveFriends: vi.fn(async (friends: Friend[]) => { current = [...friends, remote]; notify() }),
      subscribe: (listener: () => void) => { notify = listener; return () => {} },
    }
    let garden!: ReturnType<typeof useGardenStore>
    function Harness() { garden = useGardenStore(storage); return null }
    let view!: ReactTestRenderer
    await act(async () => { view = create(createElement(Harness)) })
    await act(async () => { await garden.importGarden(exportGarden([imported])) })
    expect(garden.friends.map(friend => friend.name)).toEqual(['Imported', 'Remote'])
    await act(async () => { view.unmount() })
  })
})
