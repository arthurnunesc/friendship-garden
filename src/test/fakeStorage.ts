import type { Friend } from '../friends/Friend'
import type { GardenStorage } from '../friends/storage'

export function createFakeStorage(initial: Friend[] = []): GardenStorage {
  let data = initial
  return {
    loadFriends: () => data,
    saveFriends: (friends) => {
      data = [...friends]
    },
  }
}
