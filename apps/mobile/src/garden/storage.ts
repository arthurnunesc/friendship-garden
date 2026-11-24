import AsyncStorage from '@react-native-async-storage/async-storage'
import { isValidFriend, type Friend } from './Friend'

export interface GardenStorage {
  loadFriends(): Promise<Friend[]>
  saveFriends(friends: Friend[]): Promise<void>
  updateFriends?(change: (friends: Friend[]) => Friend[]): Promise<Friend[]>
  subscribe?(listener: () => void): () => void
}

const KEY = 'friendship-garden:v1:friends'

function normalizeStoredFriend(item: unknown): unknown {
  if (!item || typeof item !== 'object') return item
  const friend = item as Record<string, unknown>
  return {
    ...friend,
    interactions: friend.interactions === undefined ? [] : friend.interactions,
  }
}

export const asyncStorageStore: GardenStorage = {
  async loadFriends() {
    try {
      const raw = await AsyncStorage.getItem(KEY)
      if (raw === null) return []
      const data = JSON.parse(raw)
      if (!Array.isArray(data)) throw new Error()
      const friends = data.map(normalizeStoredFriend)
      if (!friends.every(isValidFriend)) throw new Error()
      return friends
    } catch {
      throw new Error('Could not read the saved garden. The stored data has not been replaced.')
    }
  },
  async saveFriends(friends: Friend[]) {
    await AsyncStorage.setItem(KEY, JSON.stringify(friends))
  },
}
