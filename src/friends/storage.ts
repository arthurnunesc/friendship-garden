import { isValidFriend, type Friend } from './Friend'

export interface GardenStorage {
  loadFriends(): Friend[]
  saveFriends(friends: Friend[]): void
}

const KEY = 'friendship-garden:v1:friends'

function normalizeStoredFriend(item: unknown): unknown {
  if (!item || typeof item !== 'object') return item
  const friend = item as Record<string, unknown>
  return {
    ...friend,
    interactions: Array.isArray(friend.interactions) ? friend.interactions : [],
  }
}

export const localStorageStore: GardenStorage = {
  loadFriends() {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return []
      const data = JSON.parse(raw)
      if (!Array.isArray(data)) {
        console.warn('Stored garden data is not an array')
        return []
      }
      return data
        .map(normalizeStoredFriend)
        .filter((item): item is Friend => {
          const valid = isValidFriend(item)
          if (!valid) {
            console.warn('Dropping invalid friend from storage:', item)
          }
          return valid
        })
    } catch {
      console.warn('Failed to parse stored garden data')
      return []
    }
  },

  saveFriends(friends: Friend[]) {
    localStorage.setItem(KEY, JSON.stringify(friends))
  },
}
