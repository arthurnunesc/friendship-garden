import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { createFriend, exportGarden } from './Friend'
import { useGardenStore } from './useGardenStore'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

describe('garden replacement boundary', () => {
  it('rejects replacement before hydration so a pending load cannot overwrite it', async () => {
    let finishLoad!: (friends: ReturnType<typeof createFriend>[]) => void
    const original = createFriend({ name: 'Alice' })
    const storage = {
      loadFriends: vi.fn(() => new Promise<ReturnType<typeof createFriend>[]>((resolve) => { finishLoad = resolve })),
      saveFriends: vi.fn(async () => {}),
    }
    let garden!: ReturnType<typeof useGardenStore>
    function Harness() { garden = useGardenStore(storage); return null }
    let view!: ReactTestRenderer
    await act(async () => { view = create(createElement(Harness)) })
    await expect(garden.importGarden(exportGarden([]))).rejects.toThrow('Garden is still loading')
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
    await act(async () => { view.unmount() })
  })
})
