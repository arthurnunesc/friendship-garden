import { createHmac } from 'node:crypto'
import { Resend } from 'resend'
import { describe, expect, it, vi } from 'vitest'
import { createPreviewSender, readPreviewDelivery, reminderTag } from './previewDelivery.js'
import { createReminderWebhook } from './reminderWebhook.js'

const to = 'delivered+fixture@resend.dev'
const from = 'reminders@example.invalid'
const env = { EMAIL_REMINDER_DELIVERY: 'preview-test', EMAIL_REMINDER_TEST_TO: to,
  EMAIL_REMINDER_TEST_DATABASE_URL: 'fixture-db', DATABASE_URL: 'fixture-db', EMAIL_REMINDER_FROM: from,
  EMAIL_REMINDER_WEBHOOK_SECRET: 'fixture', RESEND_API_KEY: 'fixture' }

it('fails closed unless an explicit preview test mode binds to a test inbox and matching database', () => {
  expect(readPreviewDelivery(env, 'branch-deploy')?.to).toBe(to)
  for (const context of [undefined, 'production', 'dev']) expect(readPreviewDelivery(env, context)).toBeNull()
  for (const invalid of [{ EMAIL_REMINDER_DELIVERY: '' }, { EMAIL_REMINDER_TEST_TO: 'a@example.invalid' },
    { EMAIL_REMINDER_TEST_TO: 'delivered@resend.dev.example.invalid' }, { DATABASE_URL: 'different' },
    { EMAIL_REMINDER_WEBHOOK_SECRET: '' }]) expect(readPreviewDelivery({ ...env, ...invalid }, 'branch-deploy')).toBeNull()
})

it('submits a tagged digest with its original idempotency key and never sends elsewhere', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'message-fixture' }))
  const send = createPreviewSender({ to, from, key: 'fixture' }, fetcher)
  const message = { to, idempotencyKey: 'reminder/stable-key', text: 'Check in', subject: 'Reminder' }
  await expect(send({ ...message, to: 'other@example.invalid' })).rejects.toThrow()
  expect(fetcher).not.toHaveBeenCalled()
  await send(message)
  expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.resend.com/emails')
  const init = fetcher.mock.calls[0]?.[1]
  expect(new Headers(init?.headers).get('idempotency-key')).toBe(message.idempotencyKey)
  expect(JSON.parse(String(init?.body))).toEqual({ from, to: [to], text: message.text, subject: message.subject,
    tags: [{ name: 'category', value: reminderTag }] })
  fetcher.mockResolvedValueOnce(Response.json({ id: '' }))
  await expect(send(message)).rejects.toThrow('not acknowledged')
})

describe('signed reminder events', () => {
  const secret = Buffer.from('local synthetic signed webhook fixture')
  const client = new Resend('fixture')
  const data = { to: [to], tags: { category: reminderTag } }
  function signed(event: unknown, tamper = false) {
    const id = 'msg_fixture'
    const timestamp = String(Math.floor(Date.now() / 1000))
    const body = JSON.stringify(event)
    const signature = createHmac('sha256', secret).update(`${id}.${timestamp}.${body}`).digest('base64')
    return new Request('https://garden.example.invalid/api/email-reminder-events', { method: 'POST',
      headers: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` },
      body: tamper ? body + ' ' : body })
  }
  function fixture() {
    const suppress = vi.fn<(email: string) => Promise<void>>().mockResolvedValue(undefined)
    return { suppress, handler: createReminderWebhook({ testAddress: to, suppress,
      verify: input => client.webhooks.verify({ ...input, webhookSecret: `whsec_${secret.toString('base64')}` }) }) }
  }

  it('suppresses only qualifying signed feedback for the tagged test inbox', async () => {
    const { suppress, handler } = fixture()
    const complaint = { type: 'email.complained', data }
    expect((await handler(signed(complaint, true))).status).toBe(401)
    for (const event of [{ ...complaint, data: { ...data, tags: {} } },
      { ...complaint, data: { ...data, to: ['another@example.invalid'] } },
      { type: 'email.bounced', data: { ...data, bounce: { type: 'Temporary' } } }]) {
      expect((await handler(signed(event))).status).toBe(204)
    }
    expect(suppress).not.toHaveBeenCalled()
    for (const event of [complaint, { type: 'email.suppressed', data },
      { type: 'email.bounced', data: { ...data, bounce: { type: 'Permanent' } } }]) {
      expect((await handler(signed(event))).status).toBe(204)
    }
    expect(suppress.mock.calls).toEqual([[to], [to], [to]])
  })

  it('requests a provider retry when suppression storage is unavailable', async () => {
    const { suppress, handler } = fixture()
    suppress.mockRejectedValueOnce(new Error('private'))
    expect((await handler(signed({ type: 'email.complained', data }))).status).toBe(503)
  })
})
