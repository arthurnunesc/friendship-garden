import { useCallback, useState } from 'react'
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
  const [friends, setFriends] = useState<Friend[]>(() => storage.loadFriends())

  const addFriend = useCallback(
    (data: CreateFriendInput) => {
      setFriends((prev) => {
        const updated = [...prev, createFriend(data)]
        storage.saveFriends(updated)
        return updated
      })
    },
    [storage],
  )

  const waterFriend = useCallback(
    (friendId: string, input?: LogInteractionInput) => {
      setFriends((prev) => {
        const updated = prev.map((f) =>
          f.id === friendId ? logInteraction(f, input) : f,
        )
        storage.saveFriends(updated)
        return updated
      })
    },
    [storage],
  )

  const updateFriend = useCallback(
    (friendId: string, input: EditFriendInput) => {
      setFriends((prev) => {
        const updated = prev.map((f) =>
          f.id === friendId ? editFriend(f, input) : f,
        )
        storage.saveFriends(updated)
        return updated
      })
    },
    [storage],
  )

  const removeFriend = useCallback(
    (friendId: string) => {
      setFriends((prev) => {
        const updated = prev.filter((f) => f.id !== friendId)
        storage.saveFriends(updated)
        return updated
      })
    },
    [storage],
  )

  const removeInteraction = useCallback(
    (friendId: string, interactionId: string) => {
      setFriends((prev) => {
        const updated = prev.map((f) =>
          f.id === friendId ? deleteInteraction(f, interactionId) : f,
        )
        storage.saveFriends(updated)
        return updated
      })
    },
    [storage],
  )

  return { friends, addFriend, waterFriend, updateFriend, removeFriend, removeInteraction }
}
