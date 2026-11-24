import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Friend } from './Friend'

const KEY = 'friendship-garden:v1:friends'

function createMemoryStorage(): {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  mergeItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
  clear: () => Promise<void>
} {
  const data = new Map<string, string>()
  return {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => { data.set(key, value) },
    mergeItem: async (key, value) => { data.set(key, value) },
    removeItem: async (key) => { data.delete(key) },
    clear: async () => { data.clear() },
  }
}

const { getMemoryStorage } = vi.hoisted(() => {
  const storage = createMemoryStorage()
  return { getMemoryStorage: () => storage }
})

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: getMemoryStorage(),
  __esModule: true,
}))

import { asyncStorageStore } from './storage'

describe('asyncStorageStore', () => {
  beforeEach(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await getMemoryStorage().clear()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await getMemoryStorage().clear()
  })

  it('starts with no friends', async () => {
    const friends = await asyncStorageStore.loadFriends()
    expect(friends).toEqual([])
  })

  it('persists and loads friends', async () => {
    const friends: Friend[] = [
      {
        id: 'f-1',
        name: 'Alice',
        cadenceDays: 14,
        interactions: [],
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ]

    await asyncStorageStore.saveFriends(friends)

    const loaded = await asyncStorageStore.loadFriends()
    expect(loaded).toEqual(friends)
  })

  it('rejects malformed JSON without changing the saved bytes', async () => {
    await getMemoryStorage().setItem(KEY, '{nope')

    await expect(asyncStorageStore.loadFriends()).rejects.toThrow('stored data has not been replaced')
    expect(await getMemoryStorage().getItem(KEY)).toBe('{nope')
  })

  it('rejects non-array stored data instead of acknowledging an empty garden', async () => {
    await getMemoryStorage().setItem(KEY, JSON.stringify({ friends: [] }))

    await expect(asyncStorageStore.loadFriends()).rejects.toThrow('Could not read')
    expect(await getMemoryStorage().getItem(KEY)).toBe(JSON.stringify({ friends: [] }))
  })

  it('retains the complete original payload if any friend is invalid', async () => {
    await getMemoryStorage().setItem(
      KEY,
      JSON.stringify([
        {
          id: 'f-1',
          name: 'Alice',
          cadenceDays: 14,
          createdAt: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 123,
          name: 'Bad entry',
          cadenceDays: 14,
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      ]),
    )

    const before = await getMemoryStorage().getItem(KEY)
    await expect(asyncStorageStore.loadFriends()).rejects.toThrow('Could not read')
    expect(await getMemoryStorage().getItem(KEY)).toBe(before)
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('normalizes supported legacy friends without changing the stored copy', async () => {
    const original = [{ id: 'legacy', name: 'Alice', cadenceDays: 14, createdAt: '2025-01-01T00:00:00.000Z' }]
    await getMemoryStorage().setItem(KEY, JSON.stringify(original))
    expect(await asyncStorageStore.loadFriends()).toEqual([{ ...original[0], interactions: [] }])
    expect(await getMemoryStorage().getItem(KEY)).toBe(JSON.stringify(original))
  })

  it('redacts read failures and never treats them as an empty garden', async () => {
    vi.spyOn(getMemoryStorage(), 'getItem').mockRejectedValueOnce(new Error('private storage path'))
    await expect(asyncStorageStore.loadFriends()).rejects.not.toThrow('private')
    await getMemoryStorage().setItem(KEY, '')
    await expect(asyncStorageStore.loadFriends()).rejects.toThrow('Could not read')
  })
})
