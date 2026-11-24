import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { magicLink } from 'better-auth/plugins'
import { expo } from '@better-auth/expo'
import { NATIVE_AUTH_CALLBACK, parseNativeAuthCallback } from '../../../../packages/garden-sync/src/nativeAuth.ts'
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
      return parseNativeAuthCallback(value) !== null || new URL(value, config.baseURL).origin === config.baseURL
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
    trustedOrigins: [config.baseURL, NATIVE_AUTH_CALLBACK],
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
        const origin = context.request?.headers.get('origin') ?? null
        if (context.request?.method === 'POST' && origin !== null && origin !== config.baseURL) {
          throw APIError.fromStatus('FORBIDDEN', { message: 'Invalid sign-in request origin' })
        }
        for (const source of [context.body, context.query]) {
          for (const field of ['callbackURL', 'newUserCallbackURL', 'errorCallbackURL', 'redirectTo']) {
            const value = source?.[field]
            if (typeof value === 'string' && value.startsWith('friendship-garden:') && !parseNativeAuthCallback(value)) {
              throw APIError.fromStatus('FORBIDDEN', { message: 'Invalid native callback' })
            }
          }
        }
        if (context.path === '/expo-authorization-proxy') {
          // The upstream proxy permits any external HTTPS host. This app uses Google only.
          try {
            const target = new URL(String(context.query?.authorizationURL))
            if (target.origin !== 'https://accounts.google.com' || target.pathname !== '/o/oauth2/v2/auth'
              || target.username || target.password || target.hash) throw new Error()
          } catch { throw APIError.fromStatus('FORBIDDEN', { message: 'Invalid authorization target' }) }
        }
        const initiating = (context.path === '/sign-in/magic-link' || context.path === '/sign-in/social')
          && context.request?.method === 'POST'
        const verifying = context.path === '/magic-link/verify'
        if (!initiating && !verifying) return
        const callbacks = ['callbackURL', 'newUserCallbackURL', 'errorCallbackURL']
          .map((key) => initiating ? context.body?.[key] : context.query?.[key])
        if (
          (origin !== null && origin !== config.baseURL)
          || callbacks.some((callback) => callback !== undefined && (typeof callback !== 'string' || !hasTrustedOrigin(callback)))
        ) throw APIError.fromStatus('FORBIDDEN', { message: 'Invalid sign-in request origin' })
      }),
    },
    plugins: [
      expo({ disableOriginOverride: true }),
      magicLink({
        expiresIn: 300,
        storeToken: 'hashed',
        sendMagicLink: ({ email, url }) => sendSignInLink({ email, url }),
      }),
    ],
  })
}
