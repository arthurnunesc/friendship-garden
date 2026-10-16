import { type PoolConfig } from 'pg'

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
