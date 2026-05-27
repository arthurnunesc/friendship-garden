import type { Friend } from './Friend'

export interface GardenStorage {
  loadFriends(): Friend[]
  saveFriends(friends: Friend[]): void
}

const KEY = 'friendship-garden:v1:friends'

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
        .filter(
          (item): item is Friend => {
            const valid =
              typeof item.id === 'string' &&
              typeof item.name === 'string' &&
              typeof item.cadenceDays === 'number' &&
              typeof item.createdAt === 'string'
            if (!valid) {
              console.warn('Dropping invalid friend from storage:', item)
            }
            return valid
          },
        )
        .map((friend) => ({
          ...friend,
          interactions: Array.isArray(friend.interactions) ? friend.interactions : [],
        }))
    } catch {
      console.warn('Failed to parse stored garden data')
      return []
    }
  },

  saveFriends(friends: Friend[]) {
    localStorage.setItem(KEY, JSON.stringify(friends))
  },
}
