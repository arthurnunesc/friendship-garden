import type { Friend } from '../garden/Friend'
import type { ReminderSettings } from './settings'

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export const REMINDER_PREFIX = 'friendship-garden:'

export interface ReminderPlan {
  identifier: string
  friendId: string
  title: string
  body: string
  date: Date
}

export interface ScheduledReminder extends ReminderPlan {}

export interface NotificationsPort {
  list(): Promise<ScheduledReminder[]>
  schedule(plan: ReminderPlan): Promise<string>
  cancel(identifier: string): Promise<void>
}

export interface ScheduleStorage {
  load(): Promise<string[]>
  save(ids: string[]): Promise<void>
}

export interface ReminderScheduler {
  reconcile(
    friends: Friend[],
    settings: ReminderSettings,
    permissionGranted: boolean,
  ): Promise<void>
}

export function nextReminderDate(
  friend: Friend,
  preferredTime: string,
  now: Date,
): Date {
  if (Number.isNaN(now.getTime())) {
    throw new Error('Invalid current reminder date')
  }
  const time = parsePreferredTime(preferredTime)
  const lastInteraction = friend.lastInteractionAt
    ? parseInteractionDate(friend.lastInteractionAt, friend.id)
    : undefined

  if (!Number.isInteger(friend.cadenceDays) || friend.cadenceDays <= 0) {
    throw new Error(`Friend ${friend.id} has an invalid cadenceDays value`)
  }

  if (lastInteraction) {
    const due = new Date(lastInteraction)
    due.setDate(due.getDate() + friend.cadenceDays)
    due.setHours(time.hours, time.minutes, 0, 0)
    if (due > now) return due
  }

  const next = new Date(now)
  next.setHours(time.hours, time.minutes, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)
  return next
}

export function createReminderScheduler(
  notifications: NotificationsPort,
  storage: ScheduleStorage,
  now: () => Date = () => new Date(),
): ReminderScheduler {
  let pending = Promise.resolve()

  return {
    reconcile(friends, settings, permissionGranted) {
      const friendsSnapshot = friends.map(copyFriend)
      const settingsSnapshot = { ...settings }
      const run = pending.then(() =>
        reconcileSnapshot(
          notifications,
          storage,
          friendsSnapshot,
          settingsSnapshot,
          permissionGranted,
          now(),
        ),
      )

      pending = run.catch(() => undefined)
      return run
    },
  }
}

async function reconcileSnapshot(
  notifications: NotificationsPort,
  storage: ScheduleStorage,
  friends: Friend[],
  settings: ReminderSettings,
  permissionGranted: boolean,
  now: Date,
): Promise<void> {
  const [scheduled, persistedIds] = await Promise.all([
    notifications.list(),
    storage.load(),
  ])
  const desired = settings.enabled && permissionGranted
    ? friends.map((friend) => reminderPlan(friend, settings.preferredTime, now))
    : []
  const desiredByIdentifier = new Map(
    desired.map((plan) => [plan.identifier, plan]),
  )
  const scheduledByIdentifier = new Map(
    scheduled
      .filter((reminder) => reminder.identifier.startsWith(REMINDER_PREFIX))
      .map((reminder) => [reminder.identifier, reminder]),
  )
  const trackedIds = new Set(
    persistedIds.filter((identifier) => identifier.startsWith(REMINDER_PREFIX)),
  )
  const identifiersToCancel = new Set<string>()

  for (const [identifier, reminder] of scheduledByIdentifier) {
    const plan = desiredByIdentifier.get(identifier)
    if (!plan || !sameReminder(reminder, plan)) {
      identifiersToCancel.add(identifier)
    }
  }

  for (const identifier of trackedIds) {
    if (!scheduledByIdentifier.has(identifier) && !desiredByIdentifier.has(identifier)) {
      identifiersToCancel.add(identifier)
    }
  }

  await Promise.all(
    [...identifiersToCancel].map((identifier) => notifications.cancel(identifier)),
  )

  const resultingIds: string[] = []
  for (const plan of desired) {
    const existing = scheduledByIdentifier.get(plan.identifier)
    if (existing && sameReminder(existing, plan)) {
      resultingIds.push(existing.identifier)
      continue
    }
    resultingIds.push(await notifications.schedule(plan))
  }
  await storage.save(resultingIds)
}

function reminderPlan(
  friend: Friend,
  preferredTime: string,
  now: Date,
): ReminderPlan {
  return {
    identifier: `${REMINDER_PREFIX}${friend.id}`,
    friendId: friend.id,
    title: 'Friendship Garden',
    body: `${friend.name} may appreciate a check-in.`,
    date: nextReminderDate(friend, preferredTime, now),
  }
}

function sameReminder(
  scheduled: ScheduledReminder,
  plan: ReminderPlan,
): boolean {
  return (
    scheduled.friendId === plan.friendId &&
    scheduled.title === plan.title &&
    scheduled.body === plan.body &&
    scheduled.date.getTime() === plan.date.getTime()
  )
}

function copyFriend(friend: Friend): Friend {
  return {
    ...friend,
    interactions: friend.interactions.map((interaction) => ({ ...interaction })),
  }
}

function parsePreferredTime(preferredTime: string): {
  hours: number
  minutes: number
} {
  const match = TIME_RE.exec(preferredTime)
  if (!match) {
    throw new Error(`Invalid preferred reminder time: ${preferredTime}`)
  }
  return { hours: Number(match[1]), minutes: Number(match[2]) }
}

function parseInteractionDate(value: string, friendId: string): Date {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Friend ${friendId} has an invalid lastInteractionAt date`)
  }
  return date
}
