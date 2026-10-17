import { describe, expect, it, vi } from 'vitest'
import { createGardenHandler, type GardenRuntime } from './gardenHandler.js'
import { InvalidSyncSnapshotError, SyncCollisionError } from './gardenSync.js'
import { GardenStorageLimitError, MAX_GARDEN_BYTES } from './gardenStore.js'

const baseURL = 'https://garden.example'
const snapshot = { version: 1 as const, friends: [], interactions: [] }
const ip = '192.0.2.1'
const request = (options: RequestInit = {}, path = '/api/garden') => new Request(baseURL + path, {
  ...options,
  headers: { origin: baseURL, 'content-type': 'application/json', cookie: 'session=valid', 'x-garden-account': 'owner-from-session', ...options.headers },
})
function setup(overrides: Partial<GardenRuntime> = {}) {
  const getUserId = vi.fn(async (_headers: Headers) => 'owner-from-session')
  const read = vi.fn(async () => snapshot)
  const merge = vi.fn(async () => snapshot)
  const runtime = { baseURL, getUserId, gardens: { read, merge }, ...overrides }
  const load = vi.fn(() => runtime)
  return { handler: createGardenHandler(load), load, getUserId, read, merge }
}

describe('account garden HTTP interface', () => {
  it('reads only the validated session owner and never forwards caller identity/auth headers', async () => {
    const f = setup()
    const response = await f.handler(request({ headers: {
      cookie: 'session=valid', authorization: 'Bearer owner-b', 'x-user-id': 'owner-b',
      'x-auth-client-ip': '203.0.113.1', 'x-forwarded-for': '203.0.113.1', 'x-real-ip': '203.0.113.1',
    } }), ip)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(snapshot)
    expect(f.read).toHaveBeenCalledExactlyOnceWith('owner-from-session')
    const headers = f.getUserId.mock.calls[0]?.[0] as Headers | undefined
    expect(headers?.get('cookie')).toBe('session=valid')
    expect(headers?.get('x-auth-client-ip')).toBe(ip)
    expect(headers?.has('authorization')).toBe(false)
    expect(headers?.has('x-user-id')).toBe(false)
    expect(headers?.has('x-forwarded-for')).toBe(false)
    expect(headers?.has('x-real-ip')).toBe(false)
    expect(headers?.has('x-garden-account')).toBe(false)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('vary')).toBe('Cookie')
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
  })

  it('posts a versioned snapshot only to the session owner', async () => {
    const f = setup()
    expect((await f.handler(request({ method: 'POST', body: JSON.stringify(snapshot) }), ip)).status).toBe(200)
    expect(f.merge).toHaveBeenCalledExactlyOnceWith('owner-from-session', snapshot)
  })

  it.each(['GET', 'POST'])('requires the account header for authenticated %s before storage', async (method) => {
    const f = setup()
    const response = await f.handler(request({
      method,
      headers: { 'x-garden-account': '' },
      ...(method === 'POST' ? { body: 'invalid JSON' } : {}),
    }), ip)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'A garden account is required.' })
    expect(f.read).not.toHaveBeenCalled()
    expect(f.merge).not.toHaveBeenCalled()
  })

  it.each(['GET', 'POST'])('rejects a changed account on authenticated %s before storage', async (method) => {
    const f = setup()
    const response = await f.handler(request({
      method,
      headers: { 'x-garden-account': 'owner-from-queued-client' },
      ...(method === 'POST' ? { body: JSON.stringify(snapshot) } : {}),
    }), ip)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Your account changed. Reconnect before syncing.', code: 'ACCOUNT_CHANGED',
    })
    expect(f.read).not.toHaveBeenCalled()
    expect(f.merge).not.toHaveBeenCalled()
  })

  it.each(['GET', 'POST'])('rejects anonymous %s without accessing garden storage', async (method) => {
    const f = setup({ getUserId: async () => null })
    const response = await f.handler(request({ method, ...(method === 'POST' ? { body: 'invalid JSON' } : {}) }), ip)
    expect(response.status).toBe(401)
    expect(f.read).not.toHaveBeenCalled()
    expect(f.merge).not.toHaveBeenCalled()
  })

  it('rejects unrelated paths, query-based owners, unsupported methods, and missing trusted IPs early', async () => {
    const f = setup()
    expect((await f.handler(request({}, '/api/garden/other'), ip)).status).toBe(404)
    expect((await f.handler(request({}, '/api/garden?userId=someone-else'), ip)).status).toBe(400)
    const method = await f.handler(request({ method: 'DELETE' }), ip)
    expect(method.status).toBe(405)
    expect(method.headers.get('allow')).toBe('GET, POST')
    expect((await f.handler(request(), '')).status).toBe(503)
    expect(f.load).not.toHaveBeenCalled()
  })

  it.each([
    { method: 'POST', headers: { origin: '' } },
    { method: 'POST', headers: { origin: 'null' } },
    { method: 'POST', headers: { origin: 'https://attacker.example' } },
    { method: 'GET', headers: { origin: 'https://attacker.example' } },
    { method: 'GET', headers: { 'sec-fetch-site': 'cross-site' } },
  ] as RequestInit[])('rejects foreign/opaque origins before session lookup: %j', async (options) => {
    const f = setup()
    expect((await f.handler(request(options), ip)).status).toBe(403)
    expect(f.getUserId).not.toHaveBeenCalled()
    expect(f.merge).not.toHaveBeenCalled()
  })

  it('rejects a missing POST origin and an unexpected host', async () => {
    const f = setup()
    const noOrigin = new Request(baseURL + '/api/garden', { method: 'POST' })
    expect((await f.handler(noOrigin, ip)).status).toBe(403)
    expect((await f.handler(new Request('https://attacker.example/api/garden'), ip)).status).toBe(403)
    expect(f.getUserId).not.toHaveBeenCalled()
  })

  it.each([
    { 'content-type': 'text/plain' },
    { 'content-type': 'application/x-www-form-urlencoded' },
    { 'content-encoding': 'gzip' },
  ] as Record<string, string>[])('rejects unsupported request encodings: %j', async (headers) => {
    const f = setup()
    expect((await f.handler(request({ method: 'POST', headers, body: '{}' }), ip)).status).toBe(415)
    expect(f.merge).not.toHaveBeenCalled()
  })

  it.each(['{', 'null', '[]', '{"userId":"other"}', JSON.stringify({ ...snapshot, userId: 'other' })])(
    'rejects invalid JSON/envelopes without choosing an owner from body: %s', async (body) => {
      const f = setup()
      expect((await f.handler(request({ method: 'POST', body }), ip)).status).toBe(400)
      expect(f.merge).not.toHaveBeenCalled()
    },
  )

  it('accepts a UTF-8 JSON content type and rejects malformed UTF-8', async () => {
    const f = setup()
    expect((await f.handler(request({ method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(snapshot) }), ip)).status).toBe(200)
    expect((await f.handler(request({ method: 'POST', body: new Uint8Array([0xff]) }), ip)).status).toBe(400)
  })

  it('limits actual UTF-8 bytes, not just declared length or character count', async () => {
    const f = setup()
    expect((await f.handler(request({ method: 'POST', headers: { 'content-length': String(MAX_GARDEN_BYTES + 1) }, body: '{}' }), ip)).status).toBe(413)
    expect((await f.handler(request({ method: 'POST', headers: { 'content-length': '2' }, body: 'é'.repeat(MAX_GARDEN_BYTES / 2 + 1) }), ip)).status).toBe(413)
    expect((await f.handler(request({ method: 'POST', headers: { 'content-length': 'NaN' }, body: '{}' }), ip)).status).toBe(400)
    expect(f.merge).not.toHaveBeenCalled()
  })

  it.each([
    [new InvalidSyncSnapshotError('friend name=private'), 400],
    [new SyncCollisionError('private conflicting payload'), 409],
    [new GardenStorageLimitError(), 413],
    [new Error('postgresql://private-password'), 503],
  ] as const)('redacts storage failures while returning actionable status %s', async (error, status) => {
    const f = setup({ gardens: { read: async () => snapshot, merge: async () => { throw error } } })
    const response = await f.handler(request({ method: 'POST', body: JSON.stringify(snapshot) }), ip)
    expect(response.status).toBe(status)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.text()
    if (error instanceof SyncCollisionError) expect(JSON.parse(body)).toMatchObject({ code: 'SYNC_COLLISION' })
    expect(body).not.toMatch(/private|postgresql|payload/)
  })

  it('fails closed when configuration or session verification fails', async () => {
    const unavailable = createGardenHandler(() => { throw new Error('secret config') })
    expect((await unavailable(request(), ip)).status).toBe(503)
    const f = setup({ getUserId: async () => { throw new Error('secret connection') } })
    const response = await f.handler(request(), ip)
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('secret')
    expect(f.read).not.toHaveBeenCalled()
  })
})
