import { describe, expect, it } from 'vitest'
import { authPoolConfig } from './authRuntime.js'

describe('authentication PostgreSQL connection configuration', () => {
  it('always verifies TLS certificates, even if the URL tries to disable SSL', () => {
    const config = authPoolConfig('postgresql://auth:p%40ss@db.example.com/garden?sslmode=disable&ssl=false')

    expect(config).toMatchObject({
      host: 'db.example.com', port: 5432, database: 'garden', user: 'auth', password: 'p@ss',
      ssl: { rejectUnauthorized: true },
    })
    expect(config).not.toHaveProperty('connectionString')
  })

  it('preserves explicit ports, encoded database names, and IPv6 hostnames', () => {
    expect(authPoolConfig('postgres://auth:pass@[::1]:5433/garden%20test')).toMatchObject({
      host: '::1', port: 5433, database: 'garden test',
    })
  })

  it('rejects non-PostgreSQL URLs and absent database names without connecting', () => {
    expect(() => authPoolConfig('https://db.example.com/garden')).toThrow()
    expect(() => authPoolConfig('postgres://auth:pass@db.example.com/')).toThrow()
  })
})
