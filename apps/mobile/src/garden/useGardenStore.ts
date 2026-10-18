import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { CreateFriendInput, EditFriendInput, Friend, InteractionType } from './Friend'
import { createFriend, editFriend, logInteraction, validateAndImportGarden } from './Friend'
import type { GardenStorage } from './storage'

type Snapshot = Readonly<{
  friends: Friend[]
  loaded: boolean
  error: string | null
}>

const SAVE_ERROR = 'Unable to save garden changes. Please try again.'
const NOT_READY_ERROR = 'Garden is still loading.'

function snapshot(friends: Friend[], loaded: boolean, error: string | null): Snapshot {
  return Object.freeze({
    friends: Object.freeze([...friends]) as unknown as Friend[],
    loaded,
    error,
  })
}

function createGardenStore(storage: GardenStorage) {
  let current = snapshot([], false, null)
  let disposed = false
  let mounted = false
  let lifecycle = 0
  let storageEpoch = 0
  let revision = 0
  let writesInFlight = 0
  let refreshAfterWrite = false
  let queue: Promise<void> = Promise.resolve()
  let unsubscribe: (() => void) | undefined
  const listeners = new Set<() => void>()

  const emit = () => {
    listeners.forEach((listener) => listener())
  }

  const publish = (friends: Friend[], loaded: boolean, error: string | null) => {
    current = snapshot(friends, loaded, error)
    emit()
  }

  const setError = (error: string | null) => {
    if (current.error !== error) publish(current.friends, current.loaded, error)
  }

  const reload = async () => {
    const reloadLifecycle = lifecycle
    const reloadEpoch = storageEpoch
    const reloadRevision = revision
    try {
      const friends = await storage.loadFriends()
      if (
        disposed ||
        !mounted ||
        reloadLifecycle !== lifecycle ||
        reloadEpoch !== storageEpoch ||
        reloadRevision !== revision ||
        writesInFlight !== 0
      ) return
      publish(friends, true, null)
    } catch {
      if (
        disposed ||
        !mounted ||
        reloadLifecycle !== lifecycle ||
        reloadEpoch !== storageEpoch ||
        reloadRevision !== revision ||
        writesInFlight !== 0
      ) return
      publish(current.friends, current.loaded, 'Unable to load the saved garden. Please try again.')
    }
  }

  const active = (actionEpoch: number, actionLifecycle: number) =>
    !disposed && mounted && actionEpoch === storageEpoch && actionLifecycle === lifecycle

  const enqueue = <T,>(action: () => Promise<T>): Promise<T> => {
    const result = queue.then(action, action)
    queue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  const mutate = (change: (friends: Friend[]) => Friend[]): Promise<boolean> => {
    if (disposed || !mounted || !current.loaded) {
      setError(NOT_READY_ERROR)
      return Promise.resolve(false)
    }
    const actionEpoch = storageEpoch
    const actionLifecycle = lifecycle
    return enqueue(async () => {
      if (!active(actionEpoch, actionLifecycle) || !current.loaded) return false
      const actionRevision = ++revision
      let next: Friend[]
      writesInFlight += 1
      try {
        if (storage.updateFriends) {
          next = await storage.updateFriends(change)
        } else {
          next = change(current.friends)
          await storage.saveFriends(next)
        }
      } catch {
        if (active(actionEpoch, actionLifecycle)) setError(SAVE_ERROR)
        return false
      } finally {
        writesInFlight -= 1
        if (refreshAfterWrite) {
          refreshAfterWrite = false
          void reload()
        }
      }
      if (!active(actionEpoch, actionLifecycle) || actionRevision !== revision) {
        if (mounted && !disposed) void reload()
        return false
      }
      publish(next, true, null)
      return true
    })
  }

  const importGarden = async (payload: unknown) => {
    if (disposed || !mounted || !current.loaded) throw new Error('Garden is still loading')
    const result = validateAndImportGarden(payload)
    if (!result.success) return result
    const actionEpoch = storageEpoch
    const actionLifecycle = lifecycle
    return enqueue(async () => {
      if (!active(actionEpoch, actionLifecycle) || !current.loaded) {
        throw new Error('Garden storage is no longer active')
      }
      const actionRevision = ++revision
      writesInFlight += 1
      try {
        await storage.saveFriends(result.friends)
      } catch (error) {
        if (active(actionEpoch, actionLifecycle)) setError(SAVE_ERROR)
        throw error
      } finally {
        writesInFlight -= 1
        if (refreshAfterWrite) {
          refreshAfterWrite = false
          void reload()
        }
      }
      if (!active(actionEpoch, actionLifecycle) || actionRevision !== revision) {
        if (mounted && !disposed) void reload()
        throw new Error('Garden storage is no longer active')
      }
      publish(result.friends, true, null)
      return result
    })
  }

  return {
    getSnapshot: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start() {
      if (disposed || mounted) return
      mounted = true
      lifecycle += 1
      if (storage.subscribe) unsubscribe = storage.subscribe(() => {
        if (writesInFlight !== 0) refreshAfterWrite = true
        else void reload()
      })
      void reload()
    },
    stop() {
      if (!mounted) return
      mounted = false
      lifecycle += 1
      unsubscribe?.()
      unsubscribe = undefined
    },
    dispose() {
      if (disposed) return
      disposed = true
      storageEpoch += 1
      this.stop()
      listeners.clear()
    },
    addFriend(input: CreateFriendInput) {
      return mutate((friends) => [...friends, createFriend(input)])
    },
    waterFriend(id: string, type?: InteractionType, note?: string) {
      return mutate((friends) => friends.map((friend) => (
        friend.id === id ? logInteraction(friend, { type, note }) : friend
      )))
    },
    updateFriend(id: string, input: EditFriendInput) {
      return mutate((friends) => friends.map((friend) => (
        friend.id === id ? editFriend(friend, input) : friend
      )))
    },
    removeFriend(id: string) {
      return mutate((friends) => friends.filter((friend) => friend.id !== id))
    },
    importGarden,
    retryLoad: reload,
  }
}

type GardenStore = ReturnType<typeof createGardenStore>

export function useGardenStore(storage: GardenStorage) {
  const storeRef = useRef<{ storage: GardenStorage; store: GardenStore } | null>(null)
  if (!storeRef.current || storeRef.current.storage !== storage) {
    storeRef.current?.store.dispose()
    storeRef.current = { storage, store: createGardenStore(storage) }
  }
  const store = storeRef.current.store
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)

  useEffect(() => {
    store.start()
    return () => store.stop()
  }, [store])

  return {
    ...state,
    addFriend: store.addFriend,
    waterFriend: store.waterFriend,
    updateFriend: store.updateFriend,
    removeFriend: store.removeFriend,
    importGarden: store.importGarden,
    retryLoad: store.retryLoad,
  } as const
}
