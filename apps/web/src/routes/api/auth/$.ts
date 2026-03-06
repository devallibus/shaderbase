import { createFileRoute } from '@tanstack/solid-router'
import { toSolidStartHandler } from 'better-auth/solid-start'
import { auth, ensureAuthReady } from '../../../lib/auth'

const handlers = toSolidStartHandler({
  handler: async (request) => {
    await ensureAuthReady()

    return auth.handler(request)
  },
})

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers,
  },
})
