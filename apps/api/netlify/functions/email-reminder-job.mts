import { Pool } from 'pg'
import { authPoolConfig } from '../../src/authDatabase.js'
import { createGardenStore } from '../../src/gardenStore.js'
import { createEmailReminderStore } from '../../src/reminders/emailReminderStore.js'
import { createPreviewSender, readPreviewDelivery } from '../../src/reminders/previewDelivery.js'
import { runPreviewReminderJob } from '../../src/reminders/previewReminderJob.js'

export default async (_request: Request, context?: { deploy?: { context?: string } }) => {
  const preview = readPreviewDelivery(process.env, context?.deploy?.context)
  if (!preview) return
  const pool = new Pool(authPoolConfig(preview.databaseURL))
  pool.on('error', () => console.error('Reminder test database connection failed.'))
  try {
    const result = await runPreviewReminderJob(preview.to, {
      store: createEmailReminderStore(pool), readGarden: createGardenStore(pool).read,
      now: () => new Date(), send: createPreviewSender(preview),
    })
    console.log(`Reminder preview job: ${result}.`)
  } catch {
    throw new Error('Reminder preview job failed.')
  } finally {
    await pool.end()
  }
}

export const config = { schedule: '*/10 * * * *' }
