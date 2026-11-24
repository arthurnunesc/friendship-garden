import AsyncStorage from '@react-native-async-storage/async-storage'

export interface ReminderSettings {
  enabled: boolean
  preferredTime: string
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  preferredTime: '09:00',
}

const SETTINGS_KEY = 'friendship-garden:v1:reminder-settings'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function isReminderTime(value: string): boolean {
  return TIME_RE.test(value)
}

export async function loadReminderSettings(): Promise<ReminderSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY)
  if (!raw) return { ...DEFAULT_REMINDER_SETTINGS }

  try {
    const parsed = JSON.parse(raw)
    return {
      enabled:
        typeof parsed.enabled === 'boolean'
          ? parsed.enabled
          : DEFAULT_REMINDER_SETTINGS.enabled,
      preferredTime:
        typeof parsed.preferredTime === 'string' &&
        isReminderTime(parsed.preferredTime)
          ? parsed.preferredTime
          : DEFAULT_REMINDER_SETTINGS.preferredTime,
    }
  } catch {
    return { ...DEFAULT_REMINDER_SETTINGS }
  }
}

export async function saveReminderSettings(
  settings: ReminderSettings,
): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({
    enabled: settings.enabled,
    preferredTime: isReminderTime(settings.preferredTime)
      ? settings.preferredTime
      : DEFAULT_REMINDER_SETTINGS.preferredTime,
  }))
}
