import { AccountRequestError, type AccountClient, type AccountUser } from '../../../../packages/garden-sync/src/account'
import { materializeGarden, mergeGardenSnapshots, recoverLocalSyncCollisions, SyncCollisionError, type SyncSnapshot } from '../../../../packages/garden-sync/src/snapshot'
import { recordGardenChanges } from '../../../../packages/garden-sync/src/changes'
import type { Friend } from '../garden/Friend'
import type { GardenStorage } from '../garden/storage'

const KEY = 'friendship-garden:v1:account-gardens'
const empty = (): SyncSnapshot => ({ version: 1, friends: [], interactions: [] })
interface SavedAccount { user: AccountUser, enabled: boolean, pending: boolean, snapshot: SyncSnapshot }
interface SavedState { version: 1, accounts: SavedAccount[] }
export interface GardenAccountState {
  loaded: boolean
  user: AccountUser | null
  viewAccount: AccountUser | null
  storage: GardenStorage
  phase: 'loading' | 'local' | 'checking' | 'ready' | 'syncing' | 'offline' | 'conflict'
  pending: boolean
  syncEnabled: boolean
  error: string | null
}

/** One native instance owns the queue; every durable transition uses the same writer. */
export function createGardenAccount(options: {
  guest: GardenStorage
  persistence: { getItem(key: string): Promise<string | null>, setItem(key: string, value: string): Promise<void> }
  client: AccountClient
  clock: () => { updatedAt: string, changeId: string }
}) {
  const { guest, persistence, client, clock } = options
  const listeners = new Set<() => void>()
  const storageListeners = new Set<() => void>()
  let saved: SavedState = { version: 1, accounts: [] }
  let damaged = false
  let guestFriends: Friend[] = []
  let friends: Friend[] = []
  let viewId: string | null = null
  let generation = 0
  let epoch = 0
  let paused = false
  let queue: Promise<unknown> = Promise.resolve()
  let boot: Promise<void> | null = null
  let flight: { epoch: number, promise: Promise<void> } | null = null
  let consent: Promise<void> | null = null
  let consentConflict: { epoch: number; userId: string; imported: SyncSnapshot | null } | null = null
  let signingOut = false
  let state: GardenAccountState
  const find = (id: string) => saved.accounts.find((entry) => entry.user.id === id)
  const emit = (patch: Partial<GardenAccountState>) => {
    const viewed = viewId === null ? undefined : find(viewId)
    state = { ...state, ...patch, pending: viewed?.pending === true, syncEnabled: !paused && viewed?.enabled === true }
    listeners.forEach((listener) => listener())
  }
  const dataChanged = () => storageListeners.forEach((listener) => listener())
  const serialize = <T,>(action: () => Promise<T>): Promise<T> => {
    const result = queue.then(action)
    queue = result.catch(() => {})
    return result
  }
  const message = (error: unknown) => error instanceof AccountRequestError ? error.message
    : 'Could not save or sync your account garden. Your existing data has not been replaced. Try again.'
  async function persist(entry: SavedAccount) {
    if (damaged) throw new Error('Saved account data could not be read.')
    const next: SavedState = { version: 1, accounts: [...saved.accounts.filter((item) => item.user.id !== entry.user.id), entry] }
    await persistence.setItem(KEY, JSON.stringify(next))
    // An old account's completed write still belongs to that account, never the current view.
    saved = next
  }
  function binding(): GardenStorage {
    const version = generation
    const owner = viewId
    const initial = friends
    const active = () => version === generation && owner === viewId && state.loaded
    const update = (change: (current: Friend[]) => Friend[]) => serialize(async () => {
      if (!active()) throw new Error('Your garden changed. Try again.')
      const next = change(friends)
      if (owner === null) {
        await guest.saveFriends(next)
        guestFriends = next
      } else {
        const entry = find(owner)
        if (!entry) throw new Error('Saved account garden is unavailable.')
        const snapshot = recordGardenChanges(entry.snapshot, next, clock)
        await persist({ ...entry, snapshot, pending: true })
      }
      if (!active()) throw new Error('Your garden changed. Try again.')
      friends = owner === null ? guestFriends : materializeGarden(find(owner)!.snapshot)
      if (owner !== null && !state.pending) emit({})
      dataChanged()
      if (owner !== null && state.user?.id === owner) void sync()
      return friends
    })
    return {
      async loadFriends() {
        if (!state.loaded) throw new Error('Garden is still loading')
        return active() ? friends : initial
      },
      subscribe(listener) { storageListeners.add(listener); return () => { storageListeners.delete(listener) } },
      async saveFriends(next) { await update(() => next) },
      updateFriends: update,
    }
  }
  state = { loaded: false, user: null, viewAccount: null, storage: binding(), phase: 'loading', error: null, pending: false, syncEnabled: false }

  function show(id: string | null) {
    const changed = viewId !== id
    viewId = id
    friends = id === null ? guestFriends : materializeGarden(find(id)?.snapshot ?? empty())
    if (changed) {
      generation += 1
      emit({ storage: binding(), viewAccount: id === null ? null : find(id)?.user ?? null })
    } else {
      emit({ viewAccount: id === null ? null : find(id)?.user ?? null })
    }
    dataChanged()
  }

  async function initialize(): Promise<void> {
    if (state.loaded) return
    if (boot) return boot
    boot = (async () => {
      try {
        guestFriends = await guest.loadFriends()
        try {
          const raw = await persistence.getItem(KEY)
          if (raw !== null) {
            const value = JSON.parse(raw) as SavedState
            if (value.version !== 1 || !Array.isArray(value.accounts)) throw new Error()
            const ids = new Set<string>()
            saved = { version: 1, accounts: value.accounts.map((entry) => {
              if (!entry.user || typeof entry.user.id !== 'string' || !entry.user.id.trim()
                || typeof entry.user.email !== 'string' || !entry.user.email.trim()
                || typeof entry.enabled !== 'boolean' || typeof entry.pending !== 'boolean'
                || ids.has(entry.user.id)) throw new Error()
              ids.add(entry.user.id)
              return { user: { id: entry.user.id, email: entry.user.email }, enabled: entry.enabled,
                pending: entry.pending, snapshot: mergeGardenSnapshots(empty(), entry.snapshot) }
            }) }
          }
        } catch { damaged = true }
        friends = guestFriends
        emit({ loaded: true, phase: 'local', error: damaged
          ? 'Saved account data could not be read. Your local garden is still available.' : null })
        dataChanged()
      } catch {
        emit({ phase: 'offline', error: 'Could not load the local garden. Please try again.' })
      }
    })()
    await boot
    boot = null
  }

  async function sync(recover = false): Promise<void> {
    const user = state.user
    if (!state.loaded || paused || !user || viewId !== user.id || !find(user.id)?.enabled || (recover && state.phase !== 'conflict')) return
    const ticket = epoch
    if (flight?.epoch === ticket) return flight.promise
    const task = (async () => {
      emit({ phase: 'syncing', error: null })
      try {
        if (recover) {
          const remote = await client.read(user.id)
          await serialize(async () => {
            if (ticket !== epoch || viewId !== user.id) return
            const current = find(user.id)
            if (!current?.enabled) return
            const snapshot = recoverLocalSyncCollisions(current.snapshot, remote, () => clock().changeId)
            await persist({ ...current, snapshot, pending: true })
            if (ticket === epoch && viewId === user.id) show(user.id)
          })
        }
        let again: boolean
        do {
          const sent = await serialize(async () => ticket === epoch ? find(user.id)?.snapshot : undefined)
          if (!sent || ticket !== epoch || viewId !== user.id) return
          const remote = await client.merge(user.id, sent)
          again = await serialize(async () => {
            if (ticket !== epoch || viewId !== user.id) return false
            const latest = find(user.id)
            if (!latest) return false
            const changed = latest.snapshot !== sent
            await persist({ ...latest, snapshot: mergeGardenSnapshots(latest.snapshot, remote), pending: changed })
            if (ticket === epoch && viewId === user.id) show(user.id)
            return changed
          })
          if (ticket !== epoch) return
        } while (again)
        emit({ phase: 'ready', error: null })
      } catch (error) {
        if (ticket !== epoch) return
        if (error instanceof AccountRequestError && (error.status === 401 || error.code === 'ACCOUNT_CHANGED')) {
          epoch += 1
          show(null)
          emit({ user: null, phase: 'local', error: message(error) })
        } else if (error instanceof SyncCollisionError || (error instanceof AccountRequestError && error.code === 'SYNC_COLLISION')) {
          emit({ phase: 'conflict', error: 'Two edits have the same sync version. Your changes are still on this device.' })
        } else emit({ phase: 'offline', error: message(error) })
      }
    })()
    flight = { epoch: ticket, promise: task }
    await task
    if (flight?.promise === task) flight = null
    if (ticket === epoch && state.phase === 'ready' && find(user.id)?.pending) void sync()
  }

  const actions = {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    initialize,
    async refresh() {
      if (signingOut) return
      if (consent) {
        const waiting = epoch
        await consent
        if (waiting !== epoch) return
      }
      const ticket = ++epoch
      await initialize()
      if (!state.loaded || ticket !== epoch) return
      emit({ phase: 'checking' })
      try {
        const user = await client.session()
        if (ticket !== epoch) return
        await serialize(async () => {
          if (ticket !== epoch) return
          if (viewId !== user?.id) show(null)
          emit({ user, phase: 'local', error: damaged ? state.error : null })
          if (user && find(user.id)?.enabled && !damaged && !paused) show(user.id)
        })
        if (ticket === epoch) await sync()
      } catch (error) { if (ticket === epoch) emit({ phase: 'offline', error: message(error) }) }
    },
    async enable(choice: 'import' | 'account') { await enable(choice) },
    async signOut() {
      if (signingOut) return
      signingOut = true
      const ticket = ++epoch
      paused = true
      const user = state.user
      let localFailure = false
      try {
        show(null)
        emit({ phase: 'checking' })
        await serialize(async () => {
          const entry = user && find(user.id)
          if (entry) {
            try { await persist({ ...entry, enabled: false }) } catch { localFailure = true }
          }
        })
        await client.signOut()
        if (ticket === epoch) emit({ user: null, phase: 'local', error: localFailure
          ? 'Signed out. Saved account settings could not be updated on this device.' : null })
      } catch (error) {
        if (ticket === epoch) emit({ phase: 'offline', error: message(error) })
      } finally {
        signingOut = false
      }
    },
    async openOffline(userId: string) {
      await initialize()
      if (!state.loaded || (state.user && state.user.id !== userId) || !find(userId)) return
      ++epoch
      show(userId)
      emit({ phase: 'offline', error: 'Showing the saved copy on this device. Reconnect to sync changes.' })
    },
    savedAccounts: () => saved.accounts.map((entry) => entry.user),
    sync: () => sync(),
    recoverCollision: () => {
      const retry = consentConflict
      if (state.phase === 'conflict' && retry?.epoch === epoch && retry.userId === state.user?.id) return enable('account', retry)
      return sync(true)
    },
    client,
    pause() { ++epoch; paused = true },
  }

  async function enable(choice: 'import' | 'account', recovery?: NonNullable<typeof consentConflict>) {
      const user = state.user
      if (!user || !state.loaded || consent || signingOut || state.phase === 'checking' || state.phase === 'syncing') return
      const ticket = epoch
      consentConflict = null
      let release!: () => void
      const pending = new Promise<void>((resolve) => { release = resolve })
      // A foreground identity check must not invalidate an explicit import mid-read.
      consent = pending
      let imported: SyncSnapshot | null = recovery?.imported ?? null
      try {
        if (!recovery && choice === 'import') imported = recordGardenChanges(empty(), guestFriends, clock)
        emit({ phase: 'checking', error: null })
        if (damaged) throw new Error('Account cache is unavailable')
        const remote = await client.read(user.id)
        await serialize(async () => {
          if (ticket !== epoch || state.user?.id !== user.id) return
          const previous = find(user.id)
          const cached = previous?.snapshot ?? empty()
          let snapshot = mergeGardenSnapshots(recovery ? recoverLocalSyncCollisions(cached, remote, () => clock().changeId) : cached, remote)
          if (imported) snapshot = mergeGardenSnapshots(snapshot, recovery
            ? recoverLocalSyncCollisions(imported, snapshot, () => clock().changeId) : imported)
          await persist({ user, snapshot, enabled: true, pending: Boolean(recovery) || previous?.pending === true || Boolean(imported?.friends.length) })
          if (ticket !== epoch || state.user?.id !== user.id) return
          paused = false
          show(user.id)
        })
        if (ticket === epoch) await sync()
      } catch (error) {
        if (ticket === epoch && error instanceof SyncCollisionError) {
          consentConflict = { epoch, userId: user.id, imported }
          emit({ phase: 'conflict', error: 'A saved account edit has the same sync version as another edit. Nothing was uploaded.' })
        } else if (ticket === epoch) emit({ phase: 'offline', error: message(error) })
      } finally {
        if (consent === pending) consent = null
        release()
      }
  }
  return actions
}

export type GardenAccount = ReturnType<typeof createGardenAccount>
