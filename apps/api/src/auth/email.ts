import { createHash } from 'node:crypto'
import { Resend } from 'resend'
import type { AuthConfig } from './config.js'

export interface SignInLink {
  email: string
  url: string
}

export type SendSignInLink = (data: SignInLink) => Promise<void>

const magicLinkPath = '/api/auth/magic-link/verify'

function isExpectedMagicLink(url: string, baseURL: string): boolean {
  try {
    const link = new URL(url)
    return link.protocol === 'https:' && link.origin === baseURL && link.pathname === magicLinkPath
  } catch {
    return false
  }
}

/** Creates the provider-backed delivery boundary for Better Auth sign-in links. */
export function createResendSignInMailer(config: AuthConfig): SendSignInLink {
  const resend = new Resend(config.resendApiKey)

  return async ({ email, url }) => {
    if (!isExpectedMagicLink(url, config.baseURL)) {
      throw new Error('Unable to send sign-in email')
    }
    try {
      const response = await resend.emails.send(
        {
          from: config.emailFrom,
          to: [email],
          subject: 'Sign in to Friendship Garden',
          text: `Use this link to sign in to Friendship Garden. It expires in 5 minutes.\n\n${url}\n\nIf you did not request this email, you can ignore it.`,
        },
        { idempotencyKey: `sign-in/${createHash('sha256').update(url).digest('hex')}` },
      )
      if (response.error !== null) throw new Error('Resend email request failed')
    } catch {
      throw new Error('Unable to send sign-in email')
    }
  }
}
