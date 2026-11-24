import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthConfig } from './config.js'

const send = vi.hoisted(() => vi.fn())
const resendConstructor = vi.hoisted(() => vi.fn())

vi.mock('resend', () => ({
  Resend: class {
    emails = { send }

    constructor(apiKey: string) {
      resendConstructor(apiKey)
    }
  },
}))

import { createResendSignInMailer } from './email.js'

const config: AuthConfig = {
  baseURL: 'https://garden.example',
  secret: 'a'.repeat(32),
  databaseURL: 'postgresql://garden:password@db.example/friendship_garden',
  googleClientId: 'google-client-id',
  googleClientSecret: 'google-client-secret',
  resendApiKey: 're_test_key',
  emailFrom: 'Friendship Garden <sign-in@garden.example>',
}

const signInURL = 'https://garden.example/api/auth/magic-link/verify?token=token-value'

describe('createResendSignInMailer', () => {
  beforeEach(() => {
    send.mockReset()
    resendConstructor.mockReset()
  })

  it('sends a plain-text five-minute sign-in link with a stable idempotency key', async () => {
    send.mockResolvedValue({ data: { id: 'email_123' }, error: null })

    await createResendSignInMailer(config)({ email: 'friend@example.com', url: signInURL })

    expect(resendConstructor).toHaveBeenCalledWith(config.resendApiKey)
    expect(send).toHaveBeenCalledWith(
      {
        from: config.emailFrom,
        to: ['friend@example.com'],
        subject: 'Sign in to Friendship Garden',
        text: `Use this link to sign in to Friendship Garden. It expires in 5 minutes.\n\n${signInURL}\n\nIf you did not request this email, you can ignore it.`,
      },
      { idempotencyKey: `sign-in/${createHash('sha256').update(signInURL).digest('hex')}` },
    )
  })

  it.each([
    'http://garden.example/api/auth/magic-link/verify?token=token-value',
    'https://evil.example/api/auth/magic-link/verify?token=token-value',
    'https://garden.example/api/auth/magic-link/verify/extra?token=token-value',
    'https://garden.example/api/auth/session?token=token-value',
  ])('does not send a link outside the configured verification endpoint: %s', async (url) => {
    const mailer = createResendSignInMailer(config)

    await expect(mailer({ email: 'friend@example.com', url })).rejects.toThrow('Unable to send sign-in email')
    expect(send).not.toHaveBeenCalled()
  })

  it('hides provider errors and transport failures', async () => {
    const mailer = createResendSignInMailer(config)
    send.mockResolvedValueOnce({ data: null, error: { message: 'provider secret detail' } })
    await expect(mailer({ email: 'friend@example.com', url: signInURL })).rejects.toThrow('Unable to send sign-in email')

    send.mockRejectedValueOnce(new Error('network token detail'))
    await expect(mailer({ email: 'friend@example.com', url: signInURL })).rejects.toThrow('Unable to send sign-in email')
  })
})
