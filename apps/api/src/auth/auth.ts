import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { magicLink } from 'better-auth/plugins'
import type { AuthConfig } from './config.js'
import type { SendSignInLink } from './email.js'

/** Builds the authentication service from explicit runtime dependencies. */
export function createAuth(
  config: AuthConfig,
  database: BetterAuthOptions['database'],
  sendSignInLink: SendSignInLink,
) {
  const hasTrustedOrigin = (value: string): boolean => {
    try {
      return new URL(value, config.baseURL).origin === config.baseURL
    } catch {
      return false
    }
  }

  return betterAuth({
    baseURL: config.baseURL,
    basePath: '/api/auth',
    secret: config.secret,
    database,
    socialProviders: {
      google: {
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
      },
    },
    emailAndPassword: { enabled: false },
    account: { accountLinking: { enabled: false } },
    trustedOrigins: [config.baseURL],
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/magic-link': { window: 60, max: 3 },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ['x-auth-client-ip'] },
    },
    logger: { disabled: true },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (context.path !== '/sign-in/magic-link' || context.request?.method !== 'POST') return
        const origin = context.request.headers.get('origin')
        const callbacks = ['callbackURL', 'newUserCallbackURL', 'errorCallbackURL']
          .map((key) => context.body?.[key])
        if (
          (origin !== null && origin !== config.baseURL)
          || callbacks.some((callback) => typeof callback === 'string' && !hasTrustedOrigin(callback))
        ) throw APIError.fromStatus('FORBIDDEN', { message: 'Invalid sign-in request origin' })
      }),
    },
    plugins: [
      magicLink({
        expiresIn: 300,
        storeToken: 'hashed',
        sendMagicLink: ({ email, url }) => sendSignInLink({ email, url }),
      }),
    ],
  })
}
