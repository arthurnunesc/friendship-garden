import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { createReminderScheduler, REMINDER_PREFIX, type NotificationsPort, type ScheduleStorage } from './scheduler'
import { ensureReminderChannel, REMINDER_CHANNEL } from './permissions'

// The OS owns delivery, including when JavaScript and the app are not running.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export const nativeNotificationPort: NotificationsPort = {
  async list() {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync()
    return scheduled.filter((item) => item.identifier.startsWith(REMINDER_PREFIX)).map((item) => {
      const data = item.content.data
      return {
        identifier: item.identifier,
        friendId: typeof data?.friendId === 'string' ? data.friendId : '',
        title: item.content.title ?? '',
        body: item.content.body ?? '',
        date: new Date(typeof data?.scheduledFor === 'string' ? data.scheduledFor : 0),
      }
    })
  },
  async schedule(plan) {
    await ensureReminderChannel()
    return Notifications.scheduleNotificationAsync({
      identifier: plan.identifier,
      content: {
        title: plan.title,
        body: plan.body,
        sound: 'default',
        data: { friendId: plan.friendId, scheduledFor: plan.date.toISOString() },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: plan.date,
        channelId: REMINDER_CHANNEL,
      },
    })
  },
  cancel: (identifier) => Notifications.cancelScheduledNotificationAsync(identifier),
}

const SCHEDULE_KEY = 'friendship-garden:v1:scheduled-notifications'

export const scheduleStorage: ScheduleStorage = {
  async load() {
    const raw = await AsyncStorage.getItem(SCHEDULE_KEY)
    if (!raw) return []
    try {
      const ids: unknown = JSON.parse(raw)
      return Array.isArray(ids)
        ? ids.filter((id): id is string => typeof id === 'string' && id.startsWith(REMINDER_PREFIX))
        : []
    } catch {
      return []
    }
  },
  async save(ids) {
    await AsyncStorage.setItem(SCHEDULE_KEY, JSON.stringify(ids))
  },
}

export const nativeReminderScheduler = createReminderScheduler(nativeNotificationPort, scheduleStorage)
