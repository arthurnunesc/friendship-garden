import { createAuthRuntime } from '../../src/authRuntime.js'
import { readAuthConfig } from '../../src/auth/config.js'
import { createEmailReminderHandler } from '../../src/reminders/emailReminderHandler.js'

let runtime: ReturnType<typeof createAuthRuntime> | undefined
const handler = createEmailReminderHandler(() => {
  runtime ??= createAuthRuntime(readAuthConfig(process.env))
  return runtime
})

export default (request: Request, context: { ip: string }) => handler(request, context.ip)

export const config = { path: '/api/email-reminders' }
