import { describe, expect, it, vi } from 'vitest'
import { createEmailReminderHandler } from './emailReminderHandler.js'

const baseURL = 'https://garden.example.invalid'
const email = 'synthetic@example.invalid'
const enabled = { enabled: true, email, timeZone: 'Europe/Lisbon' }

function fixture() {
  const runtime = {
    baseURL,
    getUserId: vi.fn<(headers: Headers) => Promise<string | null>>().mockResolvedValue('a'),
    emailReminders: {
      read: vi.fn<() => Promise<{ email: string; revision: string; timeZone: string } | null>>().mockResolvedValue(null),
      enable: vi.fn().mockResolvedValue(true),
      disable: vi.fn().mockResolvedValue(undefined),
    },
  }
  const handler = createEmailReminderHandler(() => runtime)
  function request(method = 'GET', body?: unknown, override?: Record<string, string>, path = '/api/email-reminders') {
    const headers = { origin: baseURL, 'x-garden-account': 'a', cookie: 'session=fixture',
      'content-type': 'application/json', ...override }
    return handler(new Request(baseURL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), '192.0.2.1')
  }
  return { runtime, request }
}

describe('email reminder settings', () => {
  it('reads only the session-bound preference without exposing private metadata', async () => {
    const { runtime, request } = fixture()
    const off = await request()
    expect(await off.json()).toEqual({ enabled: false })
    expect(off.headers.get('cache-control')).toBe('no-store')
    runtime.emailReminders.read.mockResolvedValueOnce({ email, revision: 'private', timeZone: 'UTC' })
    const on = await request('GET', undefined, { authorization: 'Bearer fixture' })
    expect(await on.json()).toEqual({ enabled: true, timeZone: 'UTC' })
    expect(runtime.emailReminders.read).toHaveBeenLastCalledWith('a')
    expect([...(runtime.getUserId.mock.lastCall?.[0] ?? [])]).toEqual([
      ['cookie', 'session=fixture'], ['x-auth-client-ip', '192.0.2.1'],
    ])
  })

  it('writes only explicit consent and disables without an email or time zone', async () => {
    const { runtime, request } = fixture()
    expect(await (await request('PUT', enabled)).json()).toEqual({ enabled: true, timeZone: 'Europe/Lisbon' })
    expect(runtime.emailReminders.enable).toHaveBeenCalledWith('a', email, 'Europe/Lisbon')
    expect(await (await request('PUT', { enabled: false })).json()).toEqual({ enabled: false })
    expect(runtime.emailReminders.disable).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('fails closed if the address cannot be verified or does not match', async () => {
    const { runtime, request } = fixture()
    runtime.emailReminders.enable.mockResolvedValueOnce(false)
    expect((await request('PUT', enabled)).status).toBe(422)
  })

  it('does not change settings without valid origin, session and account binding', async () => {
    const { runtime, request } = fixture()
    expect((await request('PUT', enabled, { origin: 'https://elsewhere.example.invalid' })).status).toBe(403)
    expect((await request('PUT', enabled, { 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await request('PUT', enabled, { 'x-garden-account': 'b' })).status).toBe(409)
    runtime.getUserId.mockResolvedValueOnce(null)
    expect((await request('PUT', enabled)).status).toBe(401)
    expect(runtime.emailReminders.enable).not.toHaveBeenCalled()
  })

  it('rejects invalid input, extra fields and oversized bodies', async () => {
    const { runtime, request } = fixture()
    for (const value of [{ ...enabled, userId: 'b' }, { ...enabled, timeZone: 'invalid' },
      { ...enabled, timeZone: '+01:00' }, { ...enabled, email: 'a'.repeat(2048) }, { enabled: false, email }]) {
      expect((await request('PUT', value)).status).toBe(400)
    }
    expect((await request('PUT', enabled, { 'content-type': 'text/plain' })).status).toBe(415)
    expect((await request('GET', undefined, undefined, '/api/email-reminders?account=b')).status).toBe(400)
    expect(runtime.emailReminders.enable).not.toHaveBeenCalled()
    expect(runtime.emailReminders.disable).not.toHaveBeenCalled()
  })
})
