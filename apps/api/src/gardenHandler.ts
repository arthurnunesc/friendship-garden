import { isIP } from 'node:net'
import { InvalidSyncSnapshotError, SyncCollisionError, type SyncSnapshot } from './gardenSync.ts'
import { GardenStorageLimitError, MAX_GARDEN_BYTES } from './gardenStore.ts'

export interface GardenRuntime {
  baseURL: string
  getUserId(headers: Headers): Promise<string | null>
  gardens: {
    read(userId: string): Promise<SyncSnapshot>
    merge(userId: string, incoming: unknown): Promise<SyncSnapshot>
  }
}

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', 'vary': 'Cookie', 'x-content-type-options': 'nosniff', ...headers },
  })
}

class InvalidBodyError extends Error {}

async function readSnapshot(request: Request): Promise<unknown> {
  const length = request.headers.get('content-length')
  if (length !== null && !/^\d+$/.test(length)) throw new InvalidBodyError()
  if (length !== null && Number(length) > MAX_GARDEN_BYTES) throw new GardenStorageLimitError()
  if (!request.body) throw new InvalidBodyError()
  const reader = request.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > MAX_GARDEN_BYTES) {
        await reader.cancel()
        throw new GardenStorageLimitError()
      }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
    const parsed: unknown = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)
      || Object.keys(parsed).some((key) => !['version', 'friends', 'interactions'].includes(key))) {
      throw new InvalidBodyError()
    }
    return parsed
  } catch (error) {
    if (error instanceof GardenStorageLimitError) throw error
    throw new InvalidBodyError()
  } finally {
    reader.releaseLock()
  }
}

/** Only the validated session can select a garden; request fields never select its owner. */
export function createGardenHandler(loadRuntime: () => GardenRuntime) {
  return async (request: Request, clientIP: string): Promise<Response> => {
    const url = new URL(request.url)
    if (url.pathname !== '/api/garden') return json({ error: 'Not found.' }, 404)
    if (!['GET', 'POST'].includes(request.method)) {
      return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, POST' })
    }
    if (url.search) return json({ error: 'Invalid garden request.' }, 400)
    if (isIP(clientIP) === 0) return json({ error: 'Garden sync is unavailable.' }, 503)
    try {
      const runtime = loadRuntime()
      const origin = request.headers.get('origin')
      if (url.origin !== runtime.baseURL
        || (origin !== null && origin !== runtime.baseURL)
        || (request.method === 'POST' && origin !== runtime.baseURL)
        || request.headers.get('sec-fetch-site') === 'cross-site') {
        return json({ error: 'Invalid garden request origin.' }, 403)
      }
      // Do not pass caller-selected auth headers or a bearer token to cookie authentication.
      const sessionHeaders = new Headers({ 'x-auth-client-ip': clientIP })
      const cookie = request.headers.get('cookie')
      if (cookie) sessionHeaders.set('cookie', cookie)
      const userId = await runtime.getUserId(sessionHeaders)
      if (!userId) return json({ error: 'Sign in to sync your garden.' }, 401)
      if (request.method === 'GET') return json(await runtime.gardens.read(userId))
      const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
      if (contentType !== 'application/json'
        || !['identity', null].includes(request.headers.get('content-encoding'))) {
        return json({ error: 'Send a JSON sync snapshot.' }, 415)
      }
      return json(await runtime.gardens.merge(userId, await readSnapshot(request)))
    } catch (error) {
      if (error instanceof InvalidBodyError || error instanceof InvalidSyncSnapshotError) {
        return json({ error: 'Invalid sync snapshot.' }, 400)
      }
      if (error instanceof SyncCollisionError) {
        return json({ error: 'Conflicting sync version. Keep local changes and retry with a new change ID.' }, 409)
      }
      if (error instanceof GardenStorageLimitError) {
        return json({ error: 'Garden sync exceeds the 1 MiB snapshot limit.' }, 413)
      }
      return json({ error: 'Garden sync is unavailable.' }, 503)
    }
  }
}
