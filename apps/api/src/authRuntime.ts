import { Pool } from 'pg'
import { createAuth } from './auth/auth.js'
import { type AuthConfig } from './auth/config.js'
import { createResendSignInMailer } from './auth/email.js'
import { authPoolConfig } from './authDatabase.js'
import { createGardenStore } from './gardenStore.js'

export { authPoolConfig } from './authDatabase.js'

export function createAuthRuntime(config: AuthConfig) {
  const pool = new Pool(authPoolConfig(config.databaseURL))
  pool.on('error', () => { console.error('Authentication database connection failed.') })
  try {
    const auth = createAuth(config, pool, createResendSignInMailer(config))
    return {
      baseURL: config.baseURL,
      handle: (request: Request) => auth.handler(request),
      getUserId: async (headers: Headers): Promise<string | null> => {
        const session = await auth.api.getSession({
          headers,
          query: { disableCookieCache: true, disableRefresh: true },
        })
        return session?.user.id ?? null
      },
      gardens: createGardenStore(pool),
      close: () => pool.end(),
    }
  } catch (error) {
    void pool.end()
    throw error
  }
}
