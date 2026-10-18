import { describe, expect, it, vi } from 'vitest'
import { createNativeAccountClient, type NativeAuth } from './accountClient'
import { AccountRequestError } from '../../../../packages/garden-sync/src/account'

const origin = 'https://garden.example'
const snapshot = { version: 1 as const, friends: [], interactions: [] }
const auth = (): NativeAuth => ({
  session: vi.fn(async () => ({ id: 'a', email: 'a@example.invalid' })),
  google: vi.fn(async () => {}), email: vi.fn(async () => {}), signOut: vi.fn(async () => {}),
  getCookie: vi.fn(() => '__Secure-better-auth.session_token=synthetic-session'),
})

describe('native garden transport', () => {
  it.each(['http://garden.example', 'https://garden.example/', 'https://a:b@garden.example', 'https://garden.example/path', 'https://garden.example?q=1'])('rejects an unsafe or ambiguous origin %s', (origin) => {
    expect(() => createNativeAccountClient({ origin, auth: auth() })).toThrow('HTTPS origin')
  })

  it('sends the current secure cookie and exact configured Origin with the expected account, never ambient cookies', async () => {
    const security = auth()
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json(snapshot))
    const client = createNativeAccountClient({ origin, auth: security, fetcher })
    await client.read('a')
    security.getCookie = () => '__Secure-better-auth.session_token=rotated-synthetic-session'
    await client.merge('a', snapshot)
    expect(fetcher.mock.calls[0]).toMatchObject([origin + '/api/garden', {
      method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store',
      headers: { origin, cookie: '__Secure-better-auth.session_token=synthetic-session', 'x-garden-account': 'a' },
    }])
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'POST', body: JSON.stringify(snapshot),
      headers: { cookie: '__Secure-better-auth.session_token=rotated-synthetic-session' } })
  })

  it('does not send garden data without a cookie or a nonblank expected account', async () => {
    const security = auth()
    security.getCookie = () => ''
    const fetcher = vi.fn()
    const client = createNativeAccountClient({ origin, auth: security, fetcher })
    await expect(client.merge('a', snapshot)).rejects.toMatchObject({ status: 401 })
    await expect(client.read(' ')).rejects.toMatchObject({ status: 401 })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('strips auth session fields and does not read/upload a garden during sign-in', async () => {
    const security = auth()
    security.session = async () => ({ id: 'a', email: 'a@example.invalid', token: 'do-not-expose' })
    const fetcher = vi.fn()
    const client = createNativeAccountClient({ origin, auth: security, fetcher })
    expect(await client.session()).toEqual({ id: 'a', email: 'a@example.invalid' })
    await client.google()
    await client.email('email@example.invalid')
    await client.signOut()
    expect(security.email).toHaveBeenCalledWith('email@example.invalid')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('keeps account mismatches distinct and rejects malformed successful snapshots', async () => {
    const client = createNativeAccountClient({ origin, auth: auth(), fetcher: async () => Response.json({ code: 'ACCOUNT_CHANGED', error: 'private' }, { status: 409 }) })
    await expect(client.merge('a', snapshot)).rejects.toMatchObject({ status: 409, code: 'ACCOUNT_CHANGED' })
    await expect(client.merge('a', snapshot)).rejects.not.toThrow('private')
    const malformed = createNativeAccountClient({ origin, auth: auth(), fetcher: async () => Response.json({ version: 99 }) })
    await expect(malformed.read('a')).rejects.toBeInstanceOf(AccountRequestError)
  })

  it('redacts secure-store, network, provider, and malformed identity failures', async () => {
    const security = auth()
    security.getCookie = () => { throw new Error('private keychain data') }
    security.google = async () => { throw new Error('private provider data') }
    security.session = async () => ({ id: '', email: 'not-an-identity' })
    const client = createNativeAccountClient({ origin, auth: security })
    await expect(client.read('a')).rejects.not.toThrow('private')
    await expect(client.google()).rejects.not.toThrow('private')
    await expect(client.session()).rejects.toBeInstanceOf(AccountRequestError)
  })
})
