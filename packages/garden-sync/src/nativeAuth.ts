export const NATIVE_AUTH_CALLBACK = 'friendship-garden://auth/callback'

/** Only this app callback and one correlated attempt are allowed, never a scheme wildcard. */
export function parseNativeAuthCallback(value: string, received = false): URL | null {
  try {
    if (!value.startsWith(NATIVE_AUTH_CALLBACK + '?')) return null
    const url = new URL(value)
    if (url.protocol !== 'friendship-garden:' || url.host !== 'auth' || url.pathname !== '/callback'
      || url.username || url.password || url.hash || value.includes('#')) return null
    const allowed = received ? ['state', 'cookie', 'error'] : ['state']
    for (const key of url.searchParams.keys()) {
      if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) return null
    }
    if (!/^[a-f0-9]{64}$/.test(url.searchParams.get('state') ?? '')) return null
    return url
  } catch { return null }
}

/** Read only a named Set-Cookie value; never persist arbitrary callback cookies or attributes. */
export function nativeCookieValue(header: string, name: 'session_token' | 'oauth_state'): string | null {
  const key = `__Secure-better-auth.${name}`
  const found = [...header.matchAll(/(?:^|,\s*)([^=;,\s]+)=([^;,\s]*)/g)]
    .filter((match) => match[1] === key)
  const value = found.length === 1 ? found[0]?.[2] : undefined
  return value && /^[A-Za-z0-9._~%+\/-]+={0,2}$/.test(value) ? value : null
}
