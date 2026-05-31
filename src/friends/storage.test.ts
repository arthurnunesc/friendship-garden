import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Friend } from './Friend'
import { localStorageStore } from './storage'

const KEY = 'friendship-garden:v1:friends'

function createMemoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => data.set(key, value),
  }
}

describe('localStorageStore', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('starts with no friends', () => {
    expect(localStorageStore.loadFriends()).toEqual([])
  })

  it('persists and loads friends', () => {
    const friends: Friend[] = [
      {
        id: 'f-1',
        name: 'Alice',
        cadenceDays: 14,
        interactions: [],
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ]

    localStorageStore.saveFriends(friends)

    expect(localStorageStore.loadFriends()).toEqual(friends)
  })

  it('returns an empty garden for malformed json', () => {
    localStorage.setItem(KEY, '{nope')

    expect(localStorageStore.loadFriends()).toEqual([])
    expect(console.warn).toHaveBeenCalledWith('Failed to parse stored garden data')
  })

  it('returns an empty garden when stored data is not an array', () => {
    localStorage.setItem(KEY, JSON.stringify({ friends: [] }))

    expect(localStorageStore.loadFriends()).toEqual([])
    expect(console.warn).toHaveBeenCalledWith('Stored garden data is not an array')
  })

  it('drops invalid friends and normalizes missing interactions', () => {
    localStorage.setItem(
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

    expect(localStorageStore.loadFriends()).toEqual([
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
