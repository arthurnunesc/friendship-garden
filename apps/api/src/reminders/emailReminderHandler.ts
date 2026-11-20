import { isIP } from 'node:net'
import type { EmailReminderChange } from '../../../../packages/garden-sync/src/reminderSettings.ts'
import type { createEmailReminderStore } from './emailReminderStore.ts'

const emailRemindersPath = '/api/email-reminders'

interface Runtime {
  baseURL: string
  getUserId(headers: Headers): Promise<string | null>
  emailReminders: Pick<ReturnType<typeof createEmailReminderStore>, 'read' | 'enable' | 'disable'>
}

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', vary: 'Cookie', 'x-content-type-options': 'nosniff', ...headers },
  })
}

const maxBytes = 2048

async function readChange(request: Request): Promise<EmailReminderChange | null> {
  const length = request.headers.get('content-length')
  if (!request.body || (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes))) return null
  const reader = request.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let text = ''
  let bytes = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > maxBytes) { await reader.cancel(); return null }
      text += decoder.decode(chunk.value, { stream: true })
    }
    const value: unknown = JSON.parse(text + decoder.decode())
    if (!value || typeof value !== 'object' || Array.isArray(value) || !('enabled' in value)) return null
    const keys = Object.keys(value)
    if (value.enabled === false && keys.length === 1) return { enabled: false }
    if (value.enabled !== true || keys.length !== 3 || !('email' in value) || !('timeZone' in value)
      || typeof value.email !== 'string' || !value.email.trim() || value.email.includes('\0')
      || typeof value.timeZone !== 'string' || !value.timeZone || /^[+-]/.test(value.timeZone)) return null
    const timeZone = new Intl.DateTimeFormat('en-US', { timeZone: value.timeZone }).resolvedOptions().timeZone
    return { enabled: true, email: value.email, timeZone }
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
}

/** A settings request never reads or modifies a garden, or starts delivery. */
export function createEmailReminderHandler(loadRuntime: () => Runtime) {
  return async (request: Request, clientIP: string): Promise<Response> => {
    const url = new URL(request.url)
    if (url.pathname !== emailRemindersPath) return json({ error: 'Not found.' }, 404)
    if (!['GET', 'PUT'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, PUT' })
    if (url.search) return json({ error: 'Invalid settings request.' }, 400)
    if (!isIP(clientIP)) return json({ error: 'Email reminder settings are unavailable.' }, 503)
    try {
      const runtime = loadRuntime()
      const origin = request.headers.get('origin')
      if (url.origin !== runtime.baseURL || (origin !== null && origin !== runtime.baseURL)
        || (request.method === 'PUT' && origin !== runtime.baseURL)
        || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Invalid request origin.' }, 403)
      const sessionHeaders = new Headers({ 'x-auth-client-ip': clientIP })
      const cookie = request.headers.get('cookie')
      if (cookie) sessionHeaders.set('cookie', cookie)
      const userId = await runtime.getUserId(sessionHeaders)
      if (!userId) return json({ error: 'Sign in to manage email reminders.' }, 401)
      const account = request.headers.get('x-garden-account')
      if (!account?.trim()) return json({ error: 'An account is required.' }, 400)
      if (account !== userId) return json({ error: 'Your account changed.', code: 'ACCOUNT_CHANGED' }, 409)
      if (request.method === 'GET') {
        const saved = await runtime.emailReminders.read(userId)
        return json(saved ? { enabled: true, timeZone: saved.timeZone } : { enabled: false })
      }
      const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
      if (contentType !== 'application/json' || ![null, 'identity'].includes(request.headers.get('content-encoding'))) {
        return json({ error: 'Send JSON reminder settings.' }, 415)
      }
      const change = await readChange(request)
      if (!change) return json({ error: 'Invalid reminder settings.' }, 400)
      if (!change.enabled) {
        await runtime.emailReminders.disable(userId)
        return json({ enabled: false })
      }
      if (!await runtime.emailReminders.enable(userId, change.email, change.timeZone)) {
        return json({ error: 'Email reminders require your current verified account email.' }, 422)
      }
      return json({ enabled: true, timeZone: change.timeZone })
    } catch {
      return json({ error: 'Email reminder settings are unavailable.' }, 503)
    }
  }
}
