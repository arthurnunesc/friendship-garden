import { isIP } from 'node:net'

export interface AuthRuntime {
  baseURL: string
  handle(request: Request): Promise<Response>
}

function unavailable(): Response {
  return Response.json({ error: 'Authentication is unavailable.' }, {
    status: 503,
    headers: { 'cache-control': 'no-store' },
  })
}

export function createAuthHandler(loadRuntime: () => AuthRuntime) {
  return async (request: Request, clientIP: string): Promise<Response> => {
    const url = new URL(request.url)
    if (url.pathname !== '/api/auth' && !url.pathname.startsWith('/api/auth/')) {
      return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } })
    }
    if (isIP(clientIP) === 0) return unavailable()

    try {
      const runtime = loadRuntime()
      if (url.origin !== runtime.baseURL) {
        return Response.json({ error: 'Invalid authentication origin.' }, {
          status: 400,
          headers: { 'cache-control': 'no-store' },
        })
      }
      const headers = new Headers(request.headers)
      headers.delete('x-forwarded-for')
      headers.delete('x-real-ip')
      headers.set('x-auth-client-ip', clientIP)
      const response = await runtime.handle(new Request(request, { headers }))
      if (response.status >= 500) {
        await response.body?.cancel()
        return unavailable()
      }
      const responseHeaders = new Headers(response.headers)
      responseHeaders.set('cache-control', 'no-store')
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      })
    } catch {
      return unavailable()
    }
  }
}
