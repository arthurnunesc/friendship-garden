export type EmailReminderSettings = { enabled: false } | { enabled: true; timeZone: string }
export type EmailReminderChange = { enabled: false } | { enabled: true; email: string; timeZone: string }

export interface EmailReminderClient {
  read(userId: string): Promise<EmailReminderSettings>
  update(userId: string, change: EmailReminderChange): Promise<EmailReminderSettings>
}

export function parseEmailReminderSettings(value: unknown): EmailReminderSettings {
  if (value && typeof value === 'object' && 'enabled' in value) {
    if (value.enabled === false) return { enabled: false }
    if (value.enabled === true && 'timeZone' in value && typeof value.timeZone === 'string' && value.timeZone.trim()) {
      return { enabled: true, timeZone: value.timeZone }
    }
  }
  throw new Error('Invalid email reminder settings.')
}
