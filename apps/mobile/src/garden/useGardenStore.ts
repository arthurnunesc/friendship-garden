import { useCallback, useEffect, useState } from 'react'
import type { Friend, CreateFriendInput, EditFriendInput, InteractionType } from './Friend'
import { createFriend, logInteraction, editFriend } from './Friend'
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

  return {
    friends,
    loaded,
    addFriend,
    waterFriend,
    updateFriend,
    removeFriend,
  } as const
}
