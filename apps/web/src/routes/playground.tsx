import { createFileRoute, useNavigate } from '@tanstack/solid-router'
import { createServerFn } from '@tanstack/solid-start'
import { useServerFn } from '@tanstack/solid-start'
import { createSignal, onMount, Show } from 'solid-js'
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
  const navigate = useNavigate()
  const fetchSession = useServerFn(getOrCreateSession)
  const [session, setSession] = createSignal<PlaygroundSession | null>(null)
  const [loading, setLoading] = createSignal(true)

  // Read session ID from URL directly — useSearch reactive value isn't
  // hydrated yet when onMount fires in TanStack Start + SolidJS.
  const initialSessionId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('session') || undefined
    : undefined

  onMount(async () => {
    try {
      const result = await fetchSession({ data: { sessionId: initialSessionId } })
      const s = result as PlaygroundSession
      setSession(s)

      // Update URL with session ID if it changed or was missing
      if (initialSessionId !== s.id) {
        navigate({ search: { session: s.id }, replace: true })
      }
    } finally {
      setLoading(false)
    }
  })

  return (
    <Show
      when={session()}
      keyed
      fallback={
        <div class="flex h-[calc(100vh-56px)] items-center justify-center">
          <div class="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      }
    >
      {(s) => <PlaygroundLayout session={s} />}
    </Show>
  )
}
