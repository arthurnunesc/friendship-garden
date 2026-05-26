import { describe, it, expect, beforeEach } from 'vitest'
import type { Friend } from './Friend'
import type { GardenStorage } from './storage'

function createFakeStorage(): GardenStorage {
  let data: Friend[] = []
  return {
    loadFriends: () => data,
    saveFriends: (friends) => {
      data = [...friends]
    },
  }
}

describe('GardenStorage interface', () => {
  let storage: GardenStorage

  beforeEach(() => {
    storage = createFakeStorage()
  })

  it('starts with no friends', () => {
    expect(storage.loadFriends()).toEqual([])
  })

  it('persists and loads friends', () => {
    const friends: Friend[] = [
      {
        id: 'f-1',
        name: 'Alice',
        cadenceDays: 14,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ]
    storage.saveFriends(friends)
    expect(storage.loadFriends()).toEqual(friends)
  })

  it('overwrites previously saved friends', () => {
    const first: Friend[] = [
      {
        id: 'f-1',
        name: 'Alice',
        cadenceDays: 14,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ]
    const second: Friend[] = [
      {
        id: 'f-2',
        name: 'Bob',
        cadenceDays: 14,
        createdAt: '2025-02-01T00:00:00.000Z',
      },
    ]
    storage.saveFriends(first)
    storage.saveFriends(second)
    expect(storage.loadFriends()).toEqual(second)
  })
})
