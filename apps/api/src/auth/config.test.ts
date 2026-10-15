import { describe, expect, it } from 'vitest'
import { readAuthConfig } from './config.js'

const validEnv = {
  BETTER_AUTH_URL: 'https://garden.example',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  DATABASE_URL: 'postgresql://garden:password@db.example:5432/friendship_garden',
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  RESEND_API_KEY: 're_test_key',
  AUTH_EMAIL_FROM: 'Friendship Garden <sign-in@garden.example>',
}

describe('readAuthConfig', () => {
  it('returns an explicit validated configuration without reading process.env', () => {
    expect(readAuthConfig(validEnv)).toEqual({
      baseURL: 'https://garden.example',
      secret: validEnv.BETTER_AUTH_SECRET,
      databaseURL: validEnv.DATABASE_URL,
      googleClientId: validEnv.GOOGLE_CLIENT_ID,
      googleClientSecret: validEnv.GOOGLE_CLIENT_SECRET,
      resendApiKey: validEnv.RESEND_API_KEY,
      emailFrom: validEnv.AUTH_EMAIL_FROM,
    })
  })

  it.each(Object.keys(validEnv) as (keyof typeof validEnv)[])('requires %s', (key) => {
    expect(() => readAuthConfig({ ...validEnv, [key]: undefined })).toThrowError('Invalid authentication configuration')
  })

  it.each([
    ['missing required value', { ...validEnv, GOOGLE_CLIENT_ID: undefined }],
    ['short secret', { ...validEnv, BETTER_AUTH_SECRET: 'too-short' }],
    ['HTTP base URL', { ...validEnv, BETTER_AUTH_URL: 'http://garden.example' }],
    ['base URL path', { ...validEnv, BETTER_AUTH_URL: 'https://garden.example/app' }],
    ['base URL query', { ...validEnv, BETTER_AUTH_URL: 'https://garden.example?next=/app' }],
    ['base URL credentials', { ...validEnv, BETTER_AUTH_URL: 'https://user:pass@garden.example' }],
    ['database without password', { ...validEnv, DATABASE_URL: 'postgres://garden@db.example/garden' }],
    ['database without host', { ...validEnv, DATABASE_URL: 'postgres://garden:password@/garden' }],
    ['malformed encoded database password', { ...validEnv, DATABASE_URL: 'postgres://garden:%ZZ@db.example/garden' }],
    ['unsupported database scheme', { ...validEnv, DATABASE_URL: 'mysql://garden:password@db.example/garden' }],
    ['sender header injection', { ...validEnv, AUTH_EMAIL_FROM: 'Garden <sign-in@garden.example>\r\nBcc: victim@example.com' }],
    ['invalid sender mailbox', { ...validEnv, AUTH_EMAIL_FROM: 'not an email' }],
  ])('rejects %s without exposing a configured value', (_reason, env) => {
    let error: unknown
    try { readAuthConfig(env) } catch (cause) { error = cause }
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('Invalid authentication configuration')
    expect(String(error)).not.toContain(validEnv.DATABASE_URL)
    expect(String(error)).not.toContain(validEnv.BETTER_AUTH_SECRET)
  })
})
