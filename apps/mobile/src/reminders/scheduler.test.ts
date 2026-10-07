import { describe, expect, it, vi } from 'vitest'
import {
  REMINDER_PREFIX,
  createReminderScheduler,
  nextReminderDate,
} from './scheduler'
import type { Friend } from '../garden/Friend'
import type {
  NotificationsPort,
  ReminderPlan,
  ScheduleStorage,
  ScheduledReminder,
} from './scheduler'
import type { ReminderSettings } from './settings'

function friend(overrides: Partial<Friend> = {}): Friend {
  return {
    id: 'alice',
    name: 'Alice',
    cadenceDays: 14,
    lastInteractionAt: '2026-06-01T15:30:00.000Z',
    interactions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('nextReminderDate', () => {
  it('uses the cadence due calendar day at the preferred local time', () => {
    const actual = nextReminderDate(
      friend(),
      '09:00',
      new Date(2026, 5, 2, 12, 0),
    )

    expect(actual).toEqual(new Date(2026, 5, 15, 9, 0))
  })

  it('uses the next preferred time today for a friend without an interaction', () => {
    const actual = nextReminderDate(
      friend({ lastInteractionAt: undefined }),
      '18:30',
      new Date(2026, 5, 2, 12, 0),
    )

    expect(actual).toEqual(new Date(2026, 5, 2, 18, 30))
  })

  it('uses tomorrow when the preferred time has passed or is now', () => {
    const now = new Date(2026, 5, 2, 18, 30)

    expect(nextReminderDate(friend({ lastInteractionAt: undefined }), '18:29', now))
      .toEqual(new Date(2026, 5, 3, 18, 29))
    expect(nextReminderDate(friend({ lastInteractionAt: undefined }), '18:30', now))
      .toEqual(new Date(2026, 5, 3, 18, 30))
  })

  it('uses the next preferred time for an already due friend', () => {
    const actual = nextReminderDate(
      friend({ lastInteractionAt: '2026-05-01T12:00:00.000Z' }),
      '09:00',
      new Date(2026, 5, 2, 8, 0),
    )

    expect(actual).toEqual(new Date(2026, 5, 2, 9, 0))
  })

  it('treats a reminder due at the current instant as due', () => {
    const now = new Date(2026, 5, 2, 9, 0)
    const lastInteraction = new Date(2026, 4, 19, 12, 0).toISOString()

    expect(nextReminderDate(friend({ lastInteractionAt: lastInteraction }), '09:00', now))
      .toEqual(new Date(2026, 5, 3, 9, 0))
  })

  it('rejects invalid reminder inputs descriptively', () => {
    expect(() => nextReminderDate(friend(), '9:00', new Date())).toThrow(
      'Invalid preferred reminder time',
    )
    expect(() =>
      nextReminderDate(friend({ cadenceDays: 0 }), '09:00', new Date()),
    ).toThrow('invalid cadenceDays')
    expect(() =>
      nextReminderDate(
        friend({ lastInteractionAt: 'not-a-date' }),
        '09:00',
        new Date(),
      ),
    ).toThrow('invalid lastInteractionAt date')
    expect(() => nextReminderDate(friend(), '09:00', new Date('invalid'))).toThrow(
      'Invalid current reminder date',
    )
  })
})

function scheduledFrom(plan: ReminderPlan): ScheduledReminder {
  return { ...plan, date: new Date(plan.date) }
}

function createPorts(initial: ScheduledReminder[] = []): {
  notifications: NotificationsPort
  storage: ScheduleStorage
  scheduled: ScheduledReminder[]
  savedIds: string[]
  cancelled: string[]
} {
  const scheduled = initial.map(scheduledFrom)
  const savedIds: string[] = []
  const cancelled: string[] = []
  const notifications: NotificationsPort = {
    list: vi.fn(async () => scheduled.map(scheduledFrom)),
    schedule: vi.fn(async (plan) => {
      scheduled.push(scheduledFrom(plan))
      return plan.identifier
    }),
    cancel: vi.fn(async (identifier) => {
      cancelled.push(identifier)
      const index = scheduled.findIndex(
        (reminder) => reminder.identifier === identifier,
      )
      if (index >= 0) scheduled.splice(index, 1)
    }),
  }
  const storage: ScheduleStorage = {
    load: vi.fn(async () => [...savedIds]),
    save: vi.fn(async (ids) => {
      savedIds.splice(0, savedIds.length, ...ids)
    }),
  }
  return { notifications, storage, scheduled, savedIds, cancelled }
}

const enabled: ReminderSettings = { enabled: true, preferredTime: '09:00' }
const disabled: ReminderSettings = { enabled: false, preferredTime: '09:00' }
const clock = () => new Date(2026, 5, 2, 8, 0)

describe('createReminderScheduler', () => {
  it('reschedules after logging an interaction and editing cadence or name', async () => {
    const ports = createPorts()
    const scheduler = createReminderScheduler(
      ports.notifications,
      ports.storage,
      clock,
    )
    const alice = friend()

    await scheduler.reconcile([alice], enabled, true)
    await scheduler.reconcile(
      [
        friend({
          name: 'Alicia',
          cadenceDays: 7,
          lastInteractionAt: '2026-06-02T07:00:00.000Z',
        }),
      ],
      enabled,
      true,
    )

    expect(ports.cancelled).toEqual([`${REMINDER_PREFIX}alice`])
    expect(ports.scheduled).toEqual([
      expect.objectContaining({
        identifier: `${REMINDER_PREFIX}alice`,
        body: 'Alicia may appreciate a check-in.',
        date: new Date(2026, 5, 9, 9, 0),
      }),
    ])
  })

  it('cancels reminders after deletion or disabling reminders', async () => {
    const ports = createPorts()
    const scheduler = createReminderScheduler(
      ports.notifications,
      ports.storage,
      clock,
    )

    await scheduler.reconcile([friend()], enabled, true)
    await scheduler.reconcile([], enabled, true)
    await scheduler.reconcile([friend()], enabled, true)
    await scheduler.reconcile([friend()], disabled, true)

    expect(ports.scheduled).toEqual([])
    expect(ports.cancelled).toEqual([
      `${REMINDER_PREFIX}alice`,
      `${REMINDER_PREFIX}alice`,
    ])
    expect(ports.savedIds).toEqual([])
  })

  it('cancels reminders when notification permission is unavailable', async () => {
    const ports = createPorts()
    const scheduler = createReminderScheduler(
      ports.notifications,
      ports.storage,
      clock,
    )

    await scheduler.reconcile([friend()], enabled, true)
    await scheduler.reconcile([friend()], enabled, false)

    expect(ports.scheduled).toEqual([])
    expect(ports.savedIds).toEqual([])
  })

  it('reconciles an imported replacement garden snapshot', async () => {
    const ports = createPorts()
    const scheduler = createReminderScheduler(
      ports.notifications,
      ports.storage,
      clock,
    )

    await scheduler.reconcile([friend()], enabled, true)
    await scheduler.reconcile([friend({ id: 'bob', name: 'Bob' })], enabled, true)

    expect(ports.cancelled).toEqual([`${REMINDER_PREFIX}alice`])
    expect(ports.scheduled).toEqual([
      expect.objectContaining({ identifier: `${REMINDER_PREFIX}bob` }),
    ])
  })

  it('keeps unchanged startup schedules and repeated calls without duplicates', async () => {
    const existing: ScheduledReminder = {
      identifier: `${REMINDER_PREFIX}alice`,
      friendId: 'alice',
      title: 'Friendship Garden',
      body: 'Alice may appreciate a check-in.',
      date: new Date(2026, 5, 15, 9, 0),
    }
    const ports = createPorts([existing])
    ports.savedIds.push(existing.identifier)
    const scheduler = createReminderScheduler(
      ports.notifications,
      ports.storage,
      clock,
    )

    await scheduler.reconcile([friend()], enabled, true)
    await scheduler.reconcile([friend()], enabled, true)

    expect(ports.notifications.schedule).not.toHaveBeenCalled()
    expect(ports.notifications.cancel).not.toHaveBeenCalled()
    expect(ports.scheduled).toHaveLength(1)
    expect(ports.savedIds).toEqual([existing.identifier])
  })

  it('cancels stale own OS schedules when its registry is missing', async () => {
    const stale: ScheduledReminder = {
      identifier: `${REMINDER_PREFIX}removed`,
      friendId: 'removed',
      title: 'Friendship Garden',
      body: 'Removed may appreciate a check-in.',
      date: new Date(2026, 5, 2, 9, 0),
    }
    const ports = createPorts([stale])
    const scheduler = createReminderScheduler(
      ports.notifications,
      ports.storage,
      clock,
    )

    await scheduler.reconcile([], enabled, true)

    expect(ports.cancelled).toEqual([stale.identifier])
    expect(ports.savedIds).toEqual([])
  })

  it('reschedules desired reminders that are persisted but missing from the OS', async () => {
    const ports = createPorts()
    ports.savedIds.push(`${REMINDER_PREFIX}alice`)
    const scheduler = createReminderScheduler(
      ports.notifications,
      ports.storage,
      clock,
    )

    await scheduler.reconcile([friend()], enabled, true)

    expect(ports.notifications.schedule).toHaveBeenCalledTimes(1)
    expect(ports.savedIds).toEqual([`${REMINDER_PREFIX}alice`])
  })

  it('preserves unrelated notifications', async () => {
    const unrelated: ScheduledReminder = {
      identifier: 'another-app:reminder',
      friendId: 'not-a-friend',
      title: 'Other app',
      body: 'Leave this alone.',
      date: new Date(2026, 5, 2, 9, 0),
    }
    const ports = createPorts([unrelated])
    const scheduler = createReminderScheduler(
      ports.notifications,
      ports.storage,
      clock,
    )

    await scheduler.reconcile([], disabled, true)

    expect(ports.notifications.cancel).not.toHaveBeenCalled()
    expect(ports.scheduled).toEqual([unrelated])
  })

  it('serializes rapid snapshots so the final disabled snapshot wins', async () => {
    const ports = createPorts()
    const scheduler = createReminderScheduler(
      ports.notifications,
      ports.storage,
      clock,
    )

    await Promise.all([
      scheduler.reconcile([friend()], enabled, true),
      scheduler.reconcile([friend()], disabled, true),
    ])

    expect(ports.scheduled).toEqual([])
    expect(ports.savedIds).toEqual([])
  })

  it('rejects scheduling failures and lets the next reconciliation recover', async () => {
    const ports = createPorts()
    const schedule = vi
      .spyOn(ports.notifications, 'schedule')
      .mockRejectedValueOnce(new Error('OS unavailable'))
    const scheduler = createReminderScheduler(
      ports.notifications,
      ports.storage,
      clock,
    )

    await expect(scheduler.reconcile([friend()], enabled, true)).rejects.toThrow(
      'OS unavailable',
    )
    schedule.mockImplementation(async (plan) => {
      ports.scheduled.push(scheduledFrom(plan))
      return plan.identifier
    })
    await scheduler.reconcile([friend()], enabled, true)

    expect(ports.scheduled).toEqual([
      expect.objectContaining({ identifier: `${REMINDER_PREFIX}alice` }),
    ])
  })

  it('runs a queued reconciliation after the prior one fails', async () => {
    const ports = createPorts()
    const schedule = vi
      .spyOn(ports.notifications, 'schedule')
      .mockRejectedValueOnce(new Error('OS unavailable'))
      .mockImplementationOnce(async (plan) => {
        ports.scheduled.push(scheduledFrom(plan))
        return plan.identifier
      })
    const scheduler = createReminderScheduler(
      ports.notifications,
      ports.storage,
      clock,
    )

    const results = await Promise.allSettled([
      scheduler.reconcile([friend()], enabled, true),
      scheduler.reconcile([friend()], enabled, true),
    ])

    expect(results.map((result) => result.status)).toEqual(['rejected', 'fulfilled'])
    expect(schedule).toHaveBeenCalledTimes(2)
    expect(ports.scheduled).toHaveLength(1)
  })
})
