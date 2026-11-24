import { createHash } from 'node:crypto'

interface ReminderFriend {
  cadenceDays: number
  lastInteractionAt?: string
}

interface EmailDigestInput {
  accountId: string
  email: string
  emailVerified: boolean
  preference: { email: string; timeZone: string } | null
  now: Date
  friends: readonly ReminderFriend[]
}

const dayMs = 86_400_000

function localDay(format: Intl.DateTimeFormat, date: Date): string {
  const fields = format.formatToParts(date)
  return ['year', 'month', 'day'].map(type => fields.find(field => field.type === type)?.value).join('-')
}

/** Plan one digest without sending it or exposing any garden details. */
export function planEmailDigest(input: EmailDigestInput) {
  const { accountId, email, emailVerified, preference, now, friends } = input
  if (!preference || !emailVerified || !email || preference.email !== email) return null
  let format: Intl.DateTimeFormat
  try {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: preference.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    })
  } catch {
    return null
  }
  if (!Number.isFinite(now.getTime())) return null
  const date = localDay(format, now)
  const today = Date.parse(date)
  const due = friends.some(friend => {
    if (!Number.isSafeInteger(friend.cadenceDays) || friend.cadenceDays <= 0) return false
    if (!friend.lastInteractionAt) return true
    const last = new Date(friend.lastInteractionAt)
    if (!Number.isFinite(last.getTime()) || last > now) return false
    return (today - Date.parse(localDay(format, last))) / dayMs >= friend.cadenceDays
  })
  if (!due) return null

  return {
    localDay: date,
    to: email,
    subject: 'A Friendship Garden check-in is due',
    text: 'Someone in your garden may appreciate a check-in. Open Friendship Garden to see your garden or turn off email reminders in account settings.',
    idempotencyKey: `reminder/${createHash('sha256').update(JSON.stringify([accountId, date])).digest('hex')}`,
  }
}
