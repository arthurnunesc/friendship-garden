import { createElement, useSyncExternalStore } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { expect, it, vi } from 'vitest'
import { createFriend } from './Friend'
import { useGardenStore } from './useGardenStore'
import { useReminders, type ReminderDependencies } from '../reminders/useReminders'
import { createReminderScheduler, REMINDER_PREFIX, type ScheduledReminder } from '../reminders/scheduler'
import { createGardenAccount } from '../sync/gardenAccount'
import { recordGardenChanges } from '../../../../packages/garden-sync/src/changes'

vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove() {} }) } }))
vi.mock('../reminders/notifications', () => ({ nativeReminderScheduler: { reconcile: vi.fn() } }))
vi.mock('../reminders/permissions', () => ({ getNotificationPermissionStatus: vi.fn(), requestNotificationPermission: vi.fn() }))
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

it('reconciles reminders as the account garden replaces and restores the guest garden', async () => {
  const guestFriend = createFriend({ name: 'Guest friend' })
  const remoteFriend = createFriend({ name: 'Remote friend' })
  const guest = {
    loadFriends: vi.fn(async () => [guestFriend]),
    saveFriends: vi.fn(async () => {}),
  }
  const clock = () => ({ updatedAt: '2026-10-18T08:00:00.000Z', changeId: 'account-reminder-test' })
  const remote = recordGardenChanges({ version: 1, friends: [], interactions: [] }, [remoteFriend], clock)
  const client = {
    session: vi.fn(async () => ({ id: 'user-a', email: 'a@example.com' })),
    google: vi.fn(async () => {}),
    email: vi.fn(async () => {}),
    read: vi.fn(async () => remote),
    merge: vi.fn(async () => remote),
    signOut: vi.fn(async () => {}),
  }
  const persisted = new Map<string, string>()
  let rejectNextWrite = false
  const persistence = {
    getItem: async (key: string) => persisted.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      if (rejectNextWrite) {
        rejectNextWrite = false
        throw new Error('persistence unavailable')
      }
      persisted.set(key, value)
    },
  }
  const account = createGardenAccount({ guest, persistence, client,
    clock })
  const pending = new Map<string, ScheduledReminder>()
  const cancel = vi.fn(async (id: string) => { pending.delete(id) })
  const schedule = vi.fn(async (plan: ScheduledReminder) => {
    pending.set(plan.identifier, plan)
    return plan.identifier
  })
  const scheduler = createReminderScheduler(
    { list: async () => [...pending.values()], cancel, schedule },
    { load: async () => [], save: async () => {} },
    () => new Date('2026-10-18T08:00:00.000Z'),
  )
  const reminders: ReminderDependencies = {
    storage: { load: async () => ({ enabled: true, preferredTime: '09:00' }), save: async () => {} },
    permissions: { get: async () => 'granted', request: vi.fn() },
    scheduler,
  }
  let garden!: ReturnType<typeof useGardenStore>
  function Harness() {
    const state = useSyncExternalStore(account.subscribe, account.getSnapshot, account.getSnapshot)
    garden = useGardenStore(state.storage)
    useReminders(garden.friends, garden.loaded, reminders)
    return null
  }

  await act(async () => { await account.initialize() })
  let view!: ReactTestRenderer
  await act(async () => { view = create(createElement(Harness)) })
  await act(async () => { await account.refresh() })
  expect([...pending.keys()]).toEqual([REMINDER_PREFIX + guestFriend.id])

  await act(async () => { await account.enable('account') })
  expect(client.read).toHaveBeenCalledWith('user-a')
  expect(garden.friends).toEqual([remoteFriend])
  expect(cancel).toHaveBeenCalledWith(REMINDER_PREFIX + guestFriend.id)
  expect([...pending.keys()]).toEqual([REMINDER_PREFIX + remoteFriend.id])

  rejectNextWrite = true
  await act(async () => { expect(await garden.addFriend({ name: 'Unsaved account friend' })).toBe(false) })
  expect(garden.friends).toEqual([remoteFriend])
  expect([...pending.keys()]).toEqual([REMINDER_PREFIX + remoteFriend.id])

  await act(async () => { await account.signOut() })
  expect(garden.friends).toEqual([guestFriend])
  expect(cancel).toHaveBeenCalledWith(REMINDER_PREFIX + remoteFriend.id)
  expect([...pending.keys()]).toEqual([REMINDER_PREFIX + guestFriend.id])
  await act(async () => { view.unmount() })
})
