import { createFileRoute, useNavigate, useSearch } from '@tanstack/solid-router'
import { createServerFn } from '@tanstack/solid-start'
import { createEffect, createResource, on, Show, Suspense } from 'solid-js'
import { isServer } from 'solid-js/web'
import PlaygroundLayout from '../components/playground/PlaygroundLayout'
import type { PlaygroundSession } from '../lib/playground-types'

const getOrCreateSession = createServerFn({ method: 'GET' })
  .inputValidator((data: { sessionId?: string }) => data)
  .handler(async ({ data }) => {
    const { createSession, getSession } = await import('../lib/server/playground-db')

    if (data.sessionId) {
      const session = getSession(data.sessionId)
      if (session) return session
    }

    // No session ID or session not found — create a new one
    const { session } = createSession()
    return session
  })

export const Route = createFileRoute('/playground')({
  validateSearch: (search: Record<string, unknown>) => ({
    session: (search.session as string) || undefined,
  }),
  component: PlaygroundPage,
})

function PlaygroundPage() {
  const search = useSearch({ from: '/playground' })
  const navigate = useNavigate()

  const [session] = createResource(
    () => search.session,
    async (sessionId) => {
      const result = await getOrCreateSession({ data: { sessionId } })
      return result as PlaygroundSession
    },
  )

  // Update URL with session ID after hydration (client-only)
  createEffect(
    on(
      () => session(),
      (s) => {
        if (isServer || !s) return
        if (search.session !== s.id) {
          navigate({ search: { session: s.id }, replace: true })
        }
      },
      { defer: true },
    ),
  )

  return (
    <Suspense
      fallback={
        <div class="flex h-[calc(100vh-56px)] items-center justify-center">
          <div class="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      }
    >
      <Show when={session()} keyed>
        {(s) => <PlaygroundLayout session={s} />}
      </Show>
    </Suspense>
  )
}
