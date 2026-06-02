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

  it('returns an empty garden for malformed json', async () => {
    await getMemoryStorage().setItem(KEY, '{nope')

    const friends = await asyncStorageStore.loadFriends()
    expect(friends).toEqual([])
    expect(console.warn).toHaveBeenCalledWith('Failed to parse stored garden data')
  })

  it('returns an empty garden when stored data is not an array', async () => {
    await getMemoryStorage().setItem(KEY, JSON.stringify({ friends: [] }))

    const friends = await asyncStorageStore.loadFriends()
    expect(friends).toEqual([])
    expect(console.warn).toHaveBeenCalledWith('Stored garden data is not an array')
  })

  it('drops invalid friends and normalizes missing interactions', async () => {
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

    const loaded = await asyncStorageStore.loadFriends()
    expect(loaded).toEqual([
      {
        id: 'f-1',
        name: 'Alice',
        cadenceDays: 14,
        interactions: [],
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ])
    expect(console.warn).toHaveBeenCalledWith(
      'Dropping invalid friend from storage:',
      expect.objectContaining({ name: 'Bad entry' }),
    )
  })
})
