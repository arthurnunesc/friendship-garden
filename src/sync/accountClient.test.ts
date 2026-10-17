import { describe, expect, it, vi } from 'vitest'
import { AccountRequestError, createAccountClient } from './accountClient'

const origin = 'https://garden.example'
const snapshot = { version: 1 as const, friends: [], interactions: [] }

describe('same-origin account transport', () => {
  it('binds every garden read/write to the expected session account without bearer tokens', async () => {
    const fetcher = vi.fn(async () => Response.json(snapshot))
    const client = createAccountClient(origin, fetcher)
    await client.read('a')
    await client.merge('a', snapshot)
    expect(fetcher.mock.calls).toHaveLength(2)
    for (const call of fetcher.mock.calls as unknown as [string, RequestInit][]) {
      expect(call[0]).toBe(origin + '/api/garden')
      expect(call[1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store', redirect: 'error' })
      expect(call[1].headers).toEqual({ 'content-type': 'application/json', 'x-garden-account': 'a' })
    }
  })

  it('returns only user identity, never session tokens or other auth data', async () => {
    const client = createAccountClient(origin, async () => Response.json({ user: { id: 'a', email: 'a@example.invalid' }, session: { token: 'private' } }))
    expect(await client.session()).toEqual({ id: 'a', email: 'a@example.invalid' })
    expect(await createAccountClient(origin, async () => Response.json(null)).session()).toBeNull()
  })

  it('starts Google only through the verified provider origin and uses the local callback', async () => {
    const navigate = vi.fn()
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => Response.json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic' }))
    await createAccountClient(origin, fetcher, navigate).google()
    expect(navigate).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?state=synthetic')
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ provider: 'google', callbackURL: origin + '/', disableRedirect: true })
    const bad = createAccountClient(origin, async () => Response.json({ url: 'https://attacker.example' }), navigate)
    await expect(bad.google()).rejects.toBeInstanceOf(AccountRequestError)
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('sends magic-link and sign-out requests without any garden data', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => Response.json({ success: true }))
    const client = createAccountClient(origin, fetcher)
    await client.email('person@example.invalid')
    await client.signOut()
    expect(fetcher.mock.calls[0][0]).toBe(origin + '/api/auth/sign-in/magic-link')
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ email: 'person@example.invalid', callbackURL: origin + '/' })
    expect(fetcher.mock.calls[1][0]).toBe(origin + '/api/auth/sign-out')
    expect(fetcher.mock.calls[1][1]?.body).toBeUndefined()
  })

  it('distinguishes account changes while redacting server/network payloads', async () => {
    const client = createAccountClient(origin, async () => Response.json({ code: 'ACCOUNT_CHANGED', error: 'private database details' }, { status: 409 }))
    await expect(client.merge('a', snapshot)).rejects.toMatchObject({ status: 409, code: 'ACCOUNT_CHANGED' })
    await expect(client.merge('a', snapshot)).rejects.not.toThrow('private')
    const unavailable = createAccountClient(origin, async () => { throw new Error('private password') })
    await expect(unavailable.session()).rejects.not.toThrow('private')
  })

  it('rejects malformed successful session and snapshot responses', async () => {
    await expect(createAccountClient(origin, async () => Response.json({ user: {} })).session()).rejects.toBeInstanceOf(AccountRequestError)
    await expect(createAccountClient(origin, async () => Response.json({ version: 99 })).read('a')).rejects.toBeInstanceOf(AccountRequestError)
  })
})
