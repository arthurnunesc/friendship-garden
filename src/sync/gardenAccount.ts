import { materializeGarden, mergeGardenSnapshots, type SyncSnapshot } from '../../packages/garden-sync/src/snapshot'
import { recordGardenChanges } from '../../packages/garden-sync/src/changes'
import type { GardenStorage } from '../friends/storage'
import { AccountRequestError, type AccountClient, type AccountUser } from './accountClient'

const KEY = 'friendship-garden:v1:account-gardens'
const empty = (): SyncSnapshot => ({ version: 1, friends: [], interactions: [] })
interface SavedAccount {
  user: AccountUser
  enabled: boolean
  pending: boolean
  snapshot: SyncSnapshot
}
interface SavedState { version: 1, accounts: SavedAccount[] }
export interface GardenAccountState {
  user: AccountUser | null
  viewAccount: AccountUser | null
  storage: GardenStorage
  phase: 'local' | 'checking' | 'ready' | 'syncing' | 'offline'
  error: string | null
}

/** Guest data stays in its original store; one atomic envelope owns all account metadata. */
export function createGardenAccount(options: {
  guest: GardenStorage
  persistence: Pick<Storage, 'getItem' | 'setItem'>
  client: AccountClient
  clock?: () => { updatedAt: string, changeId: string }
}) {
  const { guest, persistence, client } = options
  const clock = options.clock ?? (() => ({ updatedAt: new Date().toISOString(), changeId: crypto.randomUUID() }))
  let saved: SavedState = { version: 1, accounts: [] }
  let damaged = false
  try {
    const raw = persistence.getItem(KEY)
    if (raw) {
      const value = JSON.parse(raw) as SavedState
      if (value.version !== 1 || !Array.isArray(value.accounts)) throw new Error()
      const ids = new Set<string>()
      saved = { version: 1, accounts: value.accounts.map((entry) => {
        if (!entry.user || typeof entry.user.id !== 'string' || !entry.user.id.trim()
          || typeof entry.user.email !== 'string' || typeof entry.enabled !== 'boolean'
          || typeof entry.pending !== 'boolean' || ids.has(entry.user.id)) throw new Error()
        ids.add(entry.user.id)
        return { ...entry, snapshot: mergeGardenSnapshots(empty(), entry.snapshot) }
      }) }
    }
  } catch { damaged = true }

  const listeners = new Set<() => void>()
  let epoch = 0
  let viewVersion = 0
  let viewId: string | null = null
  let friends = guest.loadFriends()
  let flight: { epoch: number, promise: Promise<void> } | null = null
  let consent: Promise<void> | null = null
  let paused = false
  let state: GardenAccountState
  const find = (id: string) => saved.accounts.find((entry) => entry.user.id === id)
  const publish = (patch: Partial<GardenAccountState> = {}) => {
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener())
  }
  function persist(entry: SavedAccount) {
    if (damaged) throw new Error('Saved account data could not be read. It has not been replaced.')
    const next: SavedState = { version: 1, accounts: [...saved.accounts.filter((item) => item.user.id !== entry.user.id), entry] }
    persistence.setItem(KEY, JSON.stringify(next))
    saved = next
  }
  function binding(): GardenStorage {
    const version = viewVersion
    const owner = viewId
    const initial = friends
    return {
      loadFriends: () => version === viewVersion ? friends : initial,
      subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      saveFriends(next) {
        if (version !== viewVersion || owner !== viewId) throw new Error('Your garden changed. Try again.')
        if (owner === null) {
          guest.saveFriends(next)
        } else {
          const current = find(owner)
          if (!current) throw new Error('Saved account garden is unavailable.')
          const snapshot = recordGardenChanges(current.snapshot, next, clock)
          persist({ ...current, snapshot, pending: true })
        }
        friends = next
        publish()
        if (owner !== null && state.user?.id === owner) void sync()
      },
    }
  }
  state = { user: null, viewAccount: null, storage: binding(), phase: 'local',
    error: damaged ? 'Saved account data could not be read. Your local garden is still available.' : null }

  function show(id: string | null) {
    if (id !== viewId) {
      viewId = id
      viewVersion += 1
      friends = id === null ? guest.loadFriends() : materializeGarden(find(id)?.snapshot ?? empty())
      publish({ storage: binding(), viewAccount: id === null ? null : find(id)?.user ?? null })
    } else if (id !== null) {
      friends = materializeGarden(find(id)?.snapshot ?? empty())
      publish()
    }
  }
  const message = (error: unknown) => error instanceof AccountRequestError ? error.message
    : 'Could not save or sync your account garden. Your existing data has not been replaced. Try again.'

  async function sync(): Promise<void> {
    const user = state.user
    const entry = user && find(user.id)
    if (paused || !user || viewId !== user.id || !entry?.enabled) return
    const ticket = epoch
    if (flight?.epoch === ticket) return flight.promise
    const task = (async () => {
      publish({ phase: 'syncing', error: null })
      try {
        let again: boolean
        do {
          const current = find(user.id)
          if (!current || ticket !== epoch || viewId !== user.id) return
          const sent = current.snapshot
          const remote = await client.merge(user.id, sent)
          if (ticket !== epoch || viewId !== user.id) return
          const latest = find(user.id)
          if (!latest) return
          again = latest.snapshot !== sent
          persist({ ...latest, snapshot: mergeGardenSnapshots(latest.snapshot, remote), pending: again })
          show(user.id)
        } while (again)
        publish({ phase: 'ready', error: null })
      } catch (error) {
        if (ticket !== epoch) return
        if (error instanceof AccountRequestError && (error.status === 401 || error.code === 'ACCOUNT_CHANGED')) {
          epoch += 1
          show(null)
          publish({ user: null, phase: 'local', error: message(error) })
        } else {
          publish({ phase: 'offline', error: message(error) })
        }
      }
    })()
    flight = { epoch: ticket, promise: task }
    await task
    if (flight?.promise === task) flight = null
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async refresh() {
      if (consent) {
        const waiting = epoch
        await consent
        if (waiting !== epoch) return
      }
      const ticket = ++epoch
      publish({ phase: 'checking' })
      try {
        const user = await client.session()
        if (ticket !== epoch) return
        if (viewId !== user?.id) show(null)
        publish({ user, error: damaged ? state.error : null, phase: 'local' })
        if (user && find(user.id)?.enabled && !damaged && !paused) {
          show(user.id)
          await sync()
        }
      } catch (error) {
        if (ticket === epoch) publish({ phase: 'offline', error: message(error) })
      }
    },
    async enable(choice: 'import' | 'account') {
      const user = state.user
      if (!user || state.phase === 'checking' || state.phase === 'syncing') return
      const ticket = epoch
      let release!: () => void
      const pending = new Promise<void>((resolve) => { release = resolve })
      // A foreground identity check must not invalidate an explicit import mid-read.
      consent = pending
      publish({ phase: 'checking', error: null })
      try {
        const remote = await client.read(user.id)
        if (ticket !== epoch || state.user?.id !== user.id) return
        const previous = find(user.id)
        let snapshot = mergeGardenSnapshots(previous?.snapshot ?? empty(), remote)
        if (choice === 'import') {
          snapshot = mergeGardenSnapshots(snapshot, recordGardenChanges(empty(), guest.loadFriends(), clock))
        }
        persist({ user, snapshot, enabled: true, pending: true })
        paused = false
        show(user.id)
        await sync()
      } catch (error) {
        if (ticket === epoch) publish({ phase: 'offline', error: message(error) })
      } finally {
        if (consent === pending) consent = null
        release()
      }
    },
    async signOut() {
      ++epoch
      paused = true
      const user = state.user
      let localFailure = false
      try {
        if (user) {
          const entry = find(user.id)
          if (entry) {
            try { persist({ ...entry, enabled: false }) } catch { localFailure = true }
          }
        }
        show(null)
        publish({ phase: 'checking', error: null })
        await client.signOut()
        publish({ user: null, phase: 'local', error: localFailure
          ? 'Signed out. Saved account settings could not be updated on this device.' : null })
      } catch (error) {
        show(null)
        publish({ phase: 'offline', error: message(error) })
      }
    },
    openOffline(userId: string) {
      if (state.user && state.user.id !== userId) return
      const cached = find(userId)
      if (!cached) return
      ++epoch
      show(userId)
      publish({ phase: 'offline', error: 'Showing the saved copy on this device. Reconnect to sync changes.' })
    },
    savedAccounts: () => saved.accounts.map((entry) => entry.user),
    sync,
    client,
    pause() { ++epoch },
  }
}

export type GardenAccount = ReturnType<typeof createGardenAccount>
