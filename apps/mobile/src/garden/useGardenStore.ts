import { useCallback, useEffect, useState } from 'react'
import type { Friend, CreateFriendInput, EditFriendInput, InteractionType } from './Friend'
import { createFriend, logInteraction, editFriend, validateAndImportGarden } from './Friend'
import type { GardenStorage } from './storage'

export function useGardenStore(storage: GardenStorage) {
  const [friends, setFriends] = useState<Friend[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    storage.loadFriends().then((data) => {
      setFriends(data)
      setLoaded(true)
    })
  }, [storage])

  const addFriend = useCallback(
    (input: CreateFriendInput) => {
      setFriends((prev) => {
        const updated = [...prev, createFriend(input)]
        storage.saveFriends(updated).catch(console.warn)
        return updated
      })
    },
    [storage],
  )

  const waterFriend = useCallback(
    (id: string, type?: InteractionType, note?: string) => {
      setFriends((prev) => {
        const updated = prev.map((f) =>
          f.id === id ? logInteraction(f, { type, note }) : f,
        )
        storage.saveFriends(updated).catch(console.warn)
        return updated
      })
    },
    [storage],
  )

  const updateFriend = useCallback(
    (id: string, input: EditFriendInput) => {
      setFriends((prev) => {
        const updated = prev.map((f) =>
          f.id === id ? editFriend(f, input) : f,
        )
        storage.saveFriends(updated).catch(console.warn)
        return updated
      })
    },
    [storage],
  )

  const removeFriend = useCallback(
    (id: string) => {
      setFriends((prev) => {
        const updated = prev.filter((f) => f.id !== id)
        storage.saveFriends(updated).catch(console.warn)
        return updated
      })
    },
    [storage],
  )

  // Phase 5 observes this same state boundary; the import UI comes in Phase 6.
  const importGarden = useCallback(async (payload: unknown) => {
    if (!loaded) throw new Error('Garden is still loading')
    const result = validateAndImportGarden(payload)
    if (!result.success) return result
    await storage.saveFriends(result.friends)
    setFriends(result.friends)
    return result
  }, [storage, loaded])

  return {
    friends,
    loaded,
    addFriend,
    waterFriend,
    updateFriend,
    removeFriend,
    importGarden,
  } as const
}
