export interface AuthConfig {
  baseURL: string
  secret: string
  databaseURL: string
  googleClientId: string
  googleClientSecret: string
  resendApiKey: string
  emailFrom: string
}

type AuthEnvironment = Record<string, string | undefined>

const configError = (): never => {
  throw new Error('Invalid authentication configuration')
}

function required(value: string | undefined): string {
  const configured = value ?? configError()
  if (configured.trim().length === 0) configError()
  return configured
}

function baseURL(value: string): string {
  if (value.trim() !== value) configError()
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return configError()
  }
  if (
    url.protocol !== 'https:'
    || url.hostname.length === 0
    || url.username.length > 0
    || url.password.length > 0
    || url.pathname !== '/'
    || url.search.length > 0
    || url.hash.length > 0
    || value.includes('?')
    || value.includes('#')
  ) configError()
  return url.origin
}

function databaseURL(value: string): string {
  if (value.trim() !== value) configError()
  let url: URL
  let username: string
  let password: string
  try {
    url = new URL(value)
    username = decodeURIComponent(url.username)
    password = decodeURIComponent(url.password)
  } catch {
    return configError()
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol)
    || url.hostname.length === 0
    || url.username.length === 0
    || url.password.length === 0
    || username.trim().length === 0
    || password.trim().length === 0
    || url.pathname.length <= 1
  ) configError()
  return value
}

function emailFrom(value: string): string {
  if (/\r|\n/.test(value)) configError()
  const match = /^(?:[^<>\r\n]+\s+)?<([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>$/.exec(value)
  const mailbox = match?.[1] ?? value
  if (!/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(mailbox)) configError()
  return value
}

/** Validates only the explicit environment passed by the runtime entrypoint. */
export function readAuthConfig(env: AuthEnvironment): AuthConfig {
  const secret = required(env.BETTER_AUTH_SECRET)
  if (secret.trim().length < 32) configError()

  return {
    baseURL: baseURL(required(env.BETTER_AUTH_URL)),
    secret,
    databaseURL: databaseURL(required(env.DATABASE_URL)),
    googleClientId: required(env.GOOGLE_CLIENT_ID),
    googleClientSecret: required(env.GOOGLE_CLIENT_SECRET),
    resendApiKey: required(env.RESEND_API_KEY),
    emailFrom: emailFrom(required(env.AUTH_EMAIL_FROM)),
  }
}
