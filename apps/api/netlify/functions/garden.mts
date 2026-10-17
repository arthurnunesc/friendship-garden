import { createGardenHandler } from '../../src/gardenHandler.js'
import { createAuthRuntime } from '../../src/authRuntime.js'
import { readAuthConfig } from '../../src/auth/config.js'

let runtime: ReturnType<typeof createAuthRuntime> | undefined
const handler = createGardenHandler(() => {
  runtime ??= createAuthRuntime(readAuthConfig(process.env))
  return runtime
})

export default (request: Request, context: { ip: string }) => handler(request, context.ip)

export const config = { path: '/api/garden' }
