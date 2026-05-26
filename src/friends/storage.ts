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
      if (!Array.isArray(data)) return []
      return data
        .filter(
          (item): item is Friend =>
            typeof item.id === 'string' &&
            typeof item.name === 'string' &&
            typeof item.cadenceDays === 'number' &&
            typeof item.createdAt === 'string',
        )
        .map((friend) => ({
          ...friend,
          interactions: Array.isArray(friend.interactions) ? friend.interactions : [],
        }))
    } catch {
      return []
    }
  },

  saveFriends(friends: Friend[]) {
    localStorage.setItem(KEY, JSON.stringify(friends))
  },
}
