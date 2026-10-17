import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAuthRuntime } from './authRuntime.js'

const { getSession, handle } = vi.hoisted(() => ({ getSession: vi.fn(), handle: vi.fn() }))
vi.mock('./auth/auth.js', () => ({ createAuth: () => ({ api: { getSession }, handler: handle }) }))

afterEach(() => { vi.clearAllMocks() })

describe('garden session lookup in the deployed runtime', () => {
  it('derives the user ID from a fresh database-backed session without a cookie refresh', async () => {
    const runtime = createAuthRuntime({
      baseURL: 'https://garden.example', secret: 'unit-test-secret-'.repeat(3),
      databaseURL: 'postgresql://synthetic:unused@not-contacted.invalid/garden',
      googleClientId: 'not-used', googleClientSecret: 'not-used',
      resendApiKey: 're_not_used', emailFrom: 'sign-in@garden.example',
    })
    try {
      const headers = new Headers({ cookie: 'synthetic-cookie' })
      getSession.mockResolvedValueOnce({ user: { id: 'session-user' } }).mockResolvedValueOnce(null)
      expect(await runtime.getUserId(headers)).toBe('session-user')
      expect(getSession).toHaveBeenCalledWith({ headers, query: { disableCookieCache: true, disableRefresh: true } })
      expect(await runtime.getUserId(headers)).toBeNull()
      expect(runtime.gardens.read).toBeTypeOf('function')
      expect(runtime.gardens.merge).toBeTypeOf('function')
    } finally {
      await runtime.close()
    }
  })
})
