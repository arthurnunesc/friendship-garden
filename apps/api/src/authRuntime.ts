import { Pool, type PoolConfig } from 'pg'
import { createAuth } from './auth/auth.js'
import { type AuthConfig } from './auth/config.js'
import { createResendSignInMailer } from './auth/email.js'

export function authPoolConfig(databaseURL: string): PoolConfig {
  const url = new URL(databaseURL)
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname.length <= 1) {
    throw new Error('Invalid authentication database configuration.')
  }
  // Explicit fields prevent URL sslmode options from overriding certificate checks.
  return {
    host: url.hostname.replace(/^\[(.*)\]$/, '$1'),
    port: url.port ? Number(url.port) : 5432,
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: { rejectUnauthorized: true },
    max: 2,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    allowExitOnIdle: true,
  }
}

export function createAuthRuntime(config: AuthConfig) {
  const pool = new Pool(authPoolConfig(config.databaseURL))
  pool.on('error', () => { console.error('Authentication database connection failed.') })
  try {
    const auth = createAuth(config, pool, createResendSignInMailer(config))
    return {
      baseURL: config.baseURL,
      handle: (request: Request) => auth.handler(request),
      close: () => pool.end(),
    }
  } catch (error) {
    void pool.end()
    throw error
  }
}
