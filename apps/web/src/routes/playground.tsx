import { createFileRoute, useNavigate } from '@tanstack/solid-router'
import { createServerFn } from '@tanstack/solid-start'
import { useServerFn } from '@tanstack/solid-start'
import { createSignal, Match, onMount, Switch } from 'solid-js'
import PlaygroundLanding from '../components/playground/PlaygroundLanding'
import PlaygroundLayout from '../components/playground/PlaygroundLayout'
import SurfaceCard from '../components/ui/SurfaceCard'
import type { PlaygroundSession } from '../lib/playground-types'

const getSessionById = createServerFn({ method: 'GET' })
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    const { getSession } = await import('../lib/server/playground-db')
    return getSession(data.sessionId) ?? null
  })

const createManualSession = createServerFn({ method: 'POST' })
  .inputValidator((data: Record<string, never>) => data)
  .handler(async () => {
    const { createSession } = await import('../lib/server/playground-db')
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
  const search = Route.useSearch()
  const fetchSession = useServerFn(getSessionById)
  const startManualSession = useServerFn(createManualSession)
  const [session, setSession] = createSignal<PlaygroundSession | null>(null)
  const [loading, setLoading] = createSignal(Boolean(search().session))
  const [creatingManualSession, setCreatingManualSession] = createSignal(false)
  const [error, setError] = createSignal('')

  onMount(async () => {
    const initialSessionId = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('session') || undefined
      : undefined

    if (!initialSessionId) {
      setLoading(false)
      return
    }

    try {
      const result = await fetchSession({ data: { sessionId: initialSessionId } })
      const loadedSession = result as PlaygroundSession | null

      if (!loadedSession) {
        setError('Session not found. Create a new session from your agent or start one manually.')
        return
      }

      setSession(loadedSession)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load playground session.')
    } finally {
      setLoading(false)
    }
  })

  async function handleStartManualSession() {
    setCreatingManualSession(true)
    setError('')

    try {
      const result = await startManualSession({ data: {} })
      const nextSession = result as PlaygroundSession
      setSession(nextSession)
      navigate({ search: { session: nextSession.id }, replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create playground session.')
    } finally {
      setCreatingManualSession(false)
    }
  }

  const currentState = () => {
    if (session()) return 'session'
    if (loading()) return 'loading'
    if (!search().session) return 'landing'
    return 'unavailable'
  }

  return (
    <Switch>
      <Match when={currentState() === 'landing'}>
        <PlaygroundLanding
          creatingSession={creatingManualSession()}
          error={error()}
          onStartManualSession={handleStartManualSession}
        />
      </Match>

      <Match when={currentState() === 'loading'}>
        <div class="flex min-h-[calc(100dvh-56px)] items-center justify-center">
          <div class="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      </Match>

      <Match when={currentState() === 'session'}>
        <PlaygroundLayout session={session() as PlaygroundSession} />
      </Match>

      <Match when={currentState() === 'unavailable'}>
        <main class="mx-auto flex min-h-[calc(100dvh-56px)] w-full max-w-3xl items-center px-4 py-10">
          <SurfaceCard class="w-full rounded-[2rem] p-8">
            <p class="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-text-muted">
              Playground session
            </p>
            <h1 class="mt-3 text-3xl font-semibold tracking-tight text-text-primary">
              Session unavailable
            </h1>
            <p
              role="alert"
              aria-live="assertive"
              class="mt-3 text-sm leading-7 text-text-secondary"
            >
              {error() || 'This playground session could not be loaded.'}
            </p>
            <div class="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setError('')
                  navigate({ search: {}, replace: true })
                }}
                class="inline-flex items-center justify-center rounded-xl border border-surface-card-border bg-surface-card px-4 py-3 text-sm font-semibold text-text-primary transition hover:-translate-y-[1px] hover:border-accent/30 hover:text-accent active:translate-y-0 active:scale-[0.98]"
              >
                Back to MCP instructions
              </button>
              <button
                type="button"
                onClick={() => void handleStartManualSession()}
                disabled={creatingManualSession()}
                class="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-[1px] hover:bg-accent/90 disabled:cursor-wait disabled:opacity-70 active:translate-y-0 active:scale-[0.98]"
              >
                {creatingManualSession() ? 'Starting manual session...' : 'Start manual session'}
              </button>
            </div>
          </SurfaceCard>
        </main>
      </Match>
    </Switch>
  )
}
