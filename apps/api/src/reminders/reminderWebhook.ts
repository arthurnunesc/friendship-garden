import { reminderTag } from './previewDelivery.ts'

interface SignedPayload {
  payload: string
  headers: { id: string; timestamp: string; signature: string }
}

export function createReminderWebhook(deps: {
  verify(input: SignedPayload): unknown
  testAddress: string
  suppress(email: string): Promise<void>
}) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } })
    const id = request.headers.get('svix-id')
    const timestamp = request.headers.get('svix-timestamp')
    const signature = request.headers.get('svix-signature')
    if (!id || !timestamp || !signature) return new Response(null, { status: 401 })
    if (!request.body) return new Response(null, { status: 400 })
    const reader = request.body.getReader()
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let event: unknown
    try {
      let payload = ''
      let size = 0
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > 32_768) { await reader.cancel(); return new Response(null, { status: 413 }) }
        payload += decoder.decode(chunk.value, { stream: true })
      }
      event = deps.verify({ payload: payload + decoder.decode(), headers: { id, timestamp, signature } })
    } catch {
      return new Response(null, { status: 401 })
    } finally {
      reader.releaseLock()
    }
    if (!event || typeof event !== 'object' || !('type' in event) || !('data' in event)) return new Response(null, { status: 400 })
    const data = event.data
    if (data && typeof data === 'object' && 'tags' in data && data.tags && typeof data.tags === 'object'
      && 'category' in data.tags && data.tags.category === reminderTag
      && 'to' in data && Array.isArray(data.to) && data.to.length === 1 && data.to[0] === deps.testAddress
      && (event.type === 'email.complained' || event.type === 'email.suppressed'
        || (event.type === 'email.bounced' && 'bounce' in data && data.bounce && typeof data.bounce === 'object'
          && 'type' in data.bounce && data.bounce.type === 'Permanent'))) {
      try { await deps.suppress(deps.testAddress) }
      catch { return new Response(null, { status: 503 }) }
    }
    return new Response(null, { status: 204 })
  }
}
