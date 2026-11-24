import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { expect, it, vi } from 'vitest'
import { exportGarden as exportWebGarden } from '../../../../src/friends/Friend'
import { createFriend, type Friend } from './Friend'
import { useGardenStore } from './useGardenStore'
import { useReminders, type ReminderDependencies } from '../reminders/useReminders'
import { createReminderScheduler, REMINDER_PREFIX, type ScheduledReminder } from '../reminders/scheduler'

vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove() {} }) } }))
vi.mock('../reminders/notifications', () => ({ nativeReminderScheduler: { reconcile: vi.fn() } }))
vi.mock('../reminders/permissions', () => ({ getNotificationPermissionStatus: vi.fn(), requestNotificationPermission: vi.fn() }))
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

it('imports a real web export and replaces enabled reminder schedules without changing invalid imports', async () => {
  const original = createFriend({ name: 'Original' })
  const imported: Friend = {
    id: 'web-alice', name: 'Web Alice', birthday: '1990-05-14', cadenceDays: 21,
    createdAt: '2026-01-01T00:00:00.000Z', lastInteractionAt: '2026-10-01T10:00:00.000Z',
    interactions: [{ id: 'web-call', date: '2026-10-01T10:00:00.000Z', type: 'call', note: 'A long catch-up' }],
  }
  const pending = new Map<string, ScheduledReminder>()
  const cancel = vi.fn(async (id: string) => { pending.delete(id) })
  const schedule = vi.fn(async (plan: ScheduledReminder) => { pending.set(plan.identifier, plan); return plan.identifier })
  let identifiers: string[] = []
  const scheduler = createReminderScheduler({ list: async () => [...pending.values()], cancel, schedule }, {
    load: async () => identifiers,
    save: async (ids) => { identifiers = ids },
  }, () => new Date('2026-10-07T08:00:00Z'))
  const deps: ReminderDependencies = {
    storage: { load: async () => ({ enabled: true, preferredTime: '09:00' }), save: async () => {} },
    permissions: { get: async () => 'granted', request: vi.fn() },
    scheduler,
  }
  const storage = { loadFriends: async () => [original], saveFriends: vi.fn(async (_friends: Friend[]) => {}) }
  let garden!: ReturnType<typeof useGardenStore>
  function Harness() {
    garden = useGardenStore(storage)
    useReminders(garden.friends, garden.loaded, deps)
    return null
  }
  let view!: ReactTestRenderer
  await act(async () => { view = create(createElement(Harness)) })
  expect([...pending.keys()]).toEqual([REMINDER_PREFIX + original.id])
  await act(async () => { await garden.importGarden(JSON.parse(JSON.stringify(exportWebGarden([imported])))) })
  expect(garden.friends).toEqual([imported])
  expect(storage.saveFriends).toHaveBeenCalledWith([imported])
  expect(cancel).toHaveBeenCalledWith(REMINDER_PREFIX + original.id)
  expect([...pending.keys()]).toEqual([REMINDER_PREFIX + imported.id])
  expect(identifiers).toEqual([REMINDER_PREFIX + imported.id])
  const scheduled = pending.get(REMINDER_PREFIX + imported.id)!
  expect(scheduled.body).toBe('Web Alice may appreciate a check-in.')
  expect(scheduled.date.getDate()).toBe(22)
  expect(scheduled.date.getHours()).toBe(9)
  storage.saveFriends.mockClear()
  schedule.mockClear()
  cancel.mockClear()
  await act(async () => {
    expect((await garden.importGarden({ version: 1, friends: [{ ...imported, cadenceDays: 0 }] })).success).toBe(false)
  })
  expect(garden.friends).toEqual([imported])
  expect(storage.saveFriends).not.toHaveBeenCalled()
  expect(schedule).not.toHaveBeenCalled()
  expect(cancel).not.toHaveBeenCalled()
  await act(async () => { view.unmount() })
})
