import { describe, expect, it, vi } from 'vitest'
import { createAuthHandler } from './authHandler.js'

const baseURL = 'https://garden.example.com'

describe('Netlify authentication handler', () => {
  it('returns an uncached generic failure when configuration is unavailable', async () => {
    const handler = createAuthHandler(() => { throw new Error('secret database password') })
    const response = await handler(new Request(`${baseURL}/api/auth/get-session`), '192.0.2.1')

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('{"error":"Authentication is unavailable."}')
  })

  it('does not initialize authentication for unrelated paths or missing trusted IPs', async () => {
    const load = vi.fn()
    const handler = createAuthHandler(load)

    expect((await handler(new Request(`${baseURL}/garden`), '192.0.2.1')).status).toBe(404)
    expect((await handler(new Request(`${baseURL}/api/auth/get-session`), '')).status).toBe(503)
    expect(load).not.toHaveBeenCalled()
  })

  it('rejects unexpected request hosts before invoking the auth library', async () => {
    const handle = vi.fn()
    const handler = createAuthHandler(() => ({ baseURL, handle }))
    const response = await handler(new Request('https://attacker.example/api/auth/get-session'), '192.0.2.1')

    expect(response.status).toBe(400)
    expect(handle).not.toHaveBeenCalled()
  })

  it('uses the platform client IP instead of spoofed request headers and preserves the body', async () => {
    const handle = vi.fn(async (request: Request) => {
      expect(request.headers.get('x-auth-client-ip')).toBe('192.0.2.1')
      expect(request.headers.has('x-forwarded-for')).toBe(false)
      expect(request.headers.has('x-real-ip')).toBe(false)
      expect(request.headers.get('origin')).toBe(baseURL)
      expect(await request.json()).toEqual({ email: 'test@example.com' })
      return Response.json({ status: true })
    })
    const handler = createAuthHandler(() => ({ baseURL, handle }))
    const response = await handler(new Request(`${baseURL}/api/auth/sign-in/magic-link`, {
      method: 'POST',
      headers: {
        origin: baseURL,
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.2',
        'x-real-ip': '198.51.100.3',
        'x-auth-client-ip': '198.51.100.4',
      },
      body: JSON.stringify({ email: 'test@example.com' }),
    }), '192.0.2.1')

    expect(response.status).toBe(200)
    expect(handle).toHaveBeenCalledOnce()
  })

  it('preserves redirects and separate session cookies while disabling caching', async () => {
    const headers = new Headers({ location: baseURL, 'cache-control': 'public' })
    headers.append('set-cookie', 'session=a; Secure; HttpOnly')
    headers.append('set-cookie', 'session_data=b; Secure; HttpOnly')
    const handler = createAuthHandler(() => ({
      baseURL,
      handle: async () => new Response(null, { status: 302, headers }),
    }))
    const response = await handler(new Request(`${baseURL}/api/auth/magic-link/verify`), '2001:db8::1')

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(baseURL)
    expect(response.headers.getSetCookie()).toEqual(headers.getSetCookie())
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('does not expose provider or database exceptions', async () => {
    const handler = createAuthHandler(() => ({
      baseURL,
      handle: async () => { throw new Error('token=private-token') },
    }))
    const response = await handler(new Request(`${baseURL}/api/auth/get-session`), '192.0.2.1')

    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private-token')
  })

  it('does not forward internal error responses from dependencies', async () => {
    const handler = createAuthHandler(() => ({
      baseURL,
      handle: async () => Response.json({ error: 'database password=private' }, { status: 500 }),
    }))
    const response = await handler(new Request(`${baseURL}/api/auth/get-session`), '192.0.2.1')

    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('password')
  })
})
