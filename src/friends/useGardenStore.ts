import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import {
  createFriend,
  deleteInteraction,
  editFriend,
  logInteraction,
  type CreateFriendInput,
  type EditFriendInput,
  type Friend,
  type LogInteractionInput,
} from './Friend'
import type { GardenStorage } from './storage'

export function useGardenStore(storage: GardenStorage) {
  const [error, setError] = useState<string | null>(null)
  const store = useMemo(() => {
    let current = storage.loadFriends()
    const listeners = new Set<() => void>()
    return {
      getSnapshot: () => current,
      subscribe(listener: () => void) {
        listeners.add(listener)
        const stop = storage.subscribe?.(() => {
          current = storage.loadFriends()
          listeners.forEach((notify) => notify())
        })
        return () => { listeners.delete(listener); stop?.() }
      },
      save(next: Friend[]) {
        storage.saveFriends(next)
        current = storage.subscribe ? storage.loadFriends() : next
        listeners.forEach((notify) => notify())
      },
    }
  }, [storage])
  const friends = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const update = useCallback((change: (current: Friend[]) => Friend[]) => {
    try {
      store.save(change(store.getSnapshot()))
      setError(null)
      return true
    } catch {
      setError('Could not save that change. Your previous garden is unchanged. Please try again.')
      return false
    }
  }, [store])

  const addFriend = useCallback(
    (data: CreateFriendInput) => {
      return update((prev) => [...prev, createFriend(data)])
    },
    [update],
  )

  const waterFriend = useCallback(
    (friendId: string, input?: LogInteractionInput) => {
      return update((prev) => prev.map((f) =>
          f.id === friendId ? logInteraction(f, input) : f,
        ))
    },
    [update],
  )

  const updateFriend = useCallback(
    (friendId: string, input: EditFriendInput) => {
      return update((prev) => prev.map((f) =>
          f.id === friendId ? editFriend(f, input) : f,
        ))
    },
    [update],
  )

  const removeFriend = useCallback(
    (friendId: string) => {
      return update((prev) => prev.filter((f) => f.id !== friendId))
    },
    [update],
  )

  const removeInteraction = useCallback(
    (friendId: string, interactionId: string) => {
      return update((prev) => prev.map((f) =>
          f.id === friendId ? deleteInteraction(f, interactionId) : f,
        ))
    },
    [update],
  )

  return { friends, addFriend, waterFriend, updateFriend, removeFriend, removeInteraction, error,
    replaceGarden: (next: Friend[]) => update(() => next) }
}
