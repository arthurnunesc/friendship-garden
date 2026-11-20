import type { EmailDigestMessage } from './deliverEmailDigest.ts'

export const reminderTag = 'friendship-garden-reminder-preview'

export function readPreviewDelivery(env: Record<string, string | undefined>, deployContext?: string) {
  if (env.EMAIL_REMINDER_DELIVERY !== 'preview-test' || !['branch-deploy', 'deploy-preview'].includes(deployContext ?? '')) return null
  const { EMAIL_REMINDER_TEST_TO: to, EMAIL_REMINDER_TEST_DATABASE_URL: databaseURL,
    EMAIL_REMINDER_FROM: from, EMAIL_REMINDER_WEBHOOK_SECRET: webhookSecret, RESEND_API_KEY: key } = env
  if (!to || !/^(delivered|bounced|complained)(\+[a-z0-9_-]{1,48})?@resend\.dev$/.test(to)
    || !databaseURL || databaseURL !== env.DATABASE_URL || !from || !key || !webhookSecret) return null
  return { to, databaseURL, from, key, webhookSecret }
}

export function createPreviewSender(config: { key: string; from: string; to: string }, fetcher = fetch) {
  return async (message: EmailDigestMessage) => {
    if (message.to !== config.to) throw new Error('Recipient is not the configured test inbox.')
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { authorization: `Bearer ${config.key}`, 'content-type': 'application/json', 'idempotency-key': message.idempotencyKey },
      body: JSON.stringify({ from: config.from, to: [message.to], subject: message.subject, text: message.text,
        tags: [{ name: 'category', value: reminderTag }] }),
    })
    if (!response.ok) throw new Error('Reminder submission failed.')
    const result: unknown = await response.json()
    if (!result || typeof result !== 'object' || !('id' in result) || typeof result.id !== 'string' || !result.id.trim()) {
      throw new Error('Reminder submission not acknowledged.')
    }
  }
}
