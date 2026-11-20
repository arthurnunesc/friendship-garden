import { Pool } from 'pg'
import { Resend } from 'resend'
import { authPoolConfig } from '../../src/authDatabase.js'
import { createEmailReminderStore } from '../../src/reminders/emailReminderStore.js'
import { readPreviewDelivery } from '../../src/reminders/previewDelivery.js'
import { createReminderWebhook } from '../../src/reminders/reminderWebhook.js'

export default async (request: Request, context?: { deploy?: { context?: string } }) => {
  const preview = readPreviewDelivery(process.env, context?.deploy?.context)
  if (!preview) return new Response(null, { status: 404 })
  const resend = new Resend(preview.key)
  const pool = new Pool(authPoolConfig(preview.databaseURL))
  pool.on('error', () => console.error('Reminder test database connection failed.'))
  try {
    return await createReminderWebhook({
      verify: (data) => resend.webhooks.verify({ ...data, webhookSecret: preview.webhookSecret }),
      testAddress: preview.to, suppress: createEmailReminderStore(pool).suppress,
    })(request)
  } catch {
    return new Response(null, { status: 503 })
  } finally {
    await pool.end()
  }
}

export const config = { path: '/api/email-reminder-events' }
