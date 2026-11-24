import { createAuthHandler } from '../../src/authHandler.js'
import { createAuthRuntime } from '../../src/authRuntime.js'
import { readAuthConfig } from '../../src/auth/config.js'

let runtime: ReturnType<typeof createAuthRuntime> | undefined
const handler = createAuthHandler(() => {
  runtime ??= createAuthRuntime(readAuthConfig(process.env))
  return runtime
})

export default (request: Request, context: { ip: string }) => handler(request, context.ip)

export const config = { path: ['/api/auth', '/api/auth/*'] }
