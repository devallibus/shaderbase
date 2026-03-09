import { createFileRoute, useNavigate } from '@tanstack/solid-router'
import { createSignal, onMount, Show } from 'solid-js'
import PlaygroundLayout from '../components/playground/PlaygroundLayout'
import type { PlaygroundSession } from '../lib/playground-types'

export const Route = createFileRoute('/playground')({
  validateSearch: (search: Record<string, unknown>) => ({
    session: (search.session as string) || undefined,
  }),
  component: PlaygroundPage,
})

function PlaygroundPage() {
  const navigate = useNavigate()
  const [session, setSession] = createSignal<PlaygroundSession | null>(null)

  onMount(async () => {
    const sessionId = new URLSearchParams(window.location.search).get('session') || undefined

    // If we have a session ID, try to load it; otherwise create a new one
    let s: PlaygroundSession
    if (sessionId) {
      const res = await fetch(`/api/playground/${sessionId}/state`)
      if (res.ok) {
        s = await res.json()
      } else {
        // Session not found — create a new one
        const createRes = await fetch('/api/playground/create', { method: 'POST' })
        const { sessionId: newId } = await createRes.json()
        const stateRes = await fetch(`/api/playground/${newId}/state`)
        s = await stateRes.json()
      }
    } else {
      const createRes = await fetch('/api/playground/create', { method: 'POST' })
      const { sessionId: newId } = await createRes.json()
      const stateRes = await fetch(`/api/playground/${newId}/state`)
      s = await stateRes.json()
    }

    setSession(s)

    // Update URL with session ID if it changed or was missing
    if (sessionId !== s.id) {
      navigate({ search: { session: s.id }, replace: true })
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
