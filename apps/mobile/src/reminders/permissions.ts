import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

export const REMINDER_CHANNEL = 'friendship-garden'

export async function ensureReminderChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
      name: 'Friendship reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    })
  }
}

export type PermissionStatus = 'granted' | 'denied' | 'undetermined'

function permissionStatus(permission: Notifications.NotificationPermissionsStatus): PermissionStatus {
  const ios = permission.ios?.status
  if (permission.status === 'granted' || ios === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    ios === Notifications.IosAuthorizationStatus.PROVISIONAL || ios === Notifications.IosAuthorizationStatus.EPHEMERAL) {
    return 'granted'
  }
  return permission.status === 'denied' ? 'denied' : 'undetermined'
}

export async function getNotificationPermissionStatus(): Promise<PermissionStatus> {
  return permissionStatus(await Notifications.getPermissionsAsync())
}

export async function requestNotificationPermission(): Promise<PermissionStatus> {
  await ensureReminderChannel()
  return permissionStatus(await Notifications.requestPermissionsAsync())
}
