import { createSignal, onCleanup, onMount, Show, lazy } from 'solid-js'
import type { PlaygroundSession } from '../../lib/playground-types'

const PlaygroundCanvas = lazy(() => import('./PlaygroundCanvas'))
const PlaygroundEditor = lazy(() => import('./PlaygroundEditor'))

type PlaygroundLayoutProps = {
  session: PlaygroundSession
}

export default function PlaygroundLayout(props: PlaygroundLayoutProps) {
  const [activeTab, setActiveTab] = createSignal<'fragment' | 'vertex'>('fragment')
  const [vertexSource, setVertexSource] = createSignal(
    props.session.language === 'glsl' ? props.session.vertexSource : '',
  )
  const [fragmentSource, setFragmentSource] = createSignal(
    props.session.language === 'glsl' ? props.session.fragmentSource : '',
  )
  const [tslSource, setTslSource] = createSignal(
    props.session.language === 'tsl' ? props.session.tslSource : '',
  )
  const [errors, setErrors] = createSignal<string[]>(props.session.compilationErrors)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let eventSource: EventSource | null = null

  // Connect to SSE for agent-driven updates
  onMount(() => {
    const url = `/api/playground/${props.session.id}/events`
    eventSource = new EventSource(url)

    eventSource.addEventListener('shader_update', (e) => {
      try {
        const data = JSON.parse(e.data) as {
          language: string
          vertexSource?: string
          fragmentSource?: string
          tslSource?: string
        }
        if (data.language === 'glsl') {
          if (data.vertexSource !== undefined) setVertexSource(data.vertexSource)
          if (data.fragmentSource !== undefined) setFragmentSource(data.fragmentSource)
        } else if (data.language === 'tsl') {
          if (data.tslSource !== undefined) setTslSource(data.tslSource)
        }
      } catch {
        // Ignore malformed events
      }
    })

    eventSource.addEventListener('uniform_update', () => {
      // Future: handle uniform value updates
    })

    eventSource.onerror = () => {
      // EventSource auto-reconnects — no action needed
    }
  })

  onCleanup(() => {
    eventSource?.close()
    if (debounceTimer) clearTimeout(debounceTimer)
  })

  function handleEditorChange(value: string) {
    if (props.session.language === 'tsl') {
      setTslSource(value)
    } else if (activeTab() === 'fragment') {
      setFragmentSource(value)
    } else {
      setVertexSource(value)
    }

    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      syncToServer()
    }, 500)
  }

  async function syncToServer() {
    try {
      const body = props.session.language === 'tsl'
        ? { tslSource: tslSource() }
        : { vertexSource: vertexSource(), fragmentSource: fragmentSource() }

      await fetch(`/api/playground/${props.session.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      // Network error — will retry on next edit
    }
  }

  function handleErrors(errs: string[]) {
    setErrors(errs)
    // Post errors to server so MCP can query them
    fetch(`/api/playground/${props.session.id}/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errors: errs }),
    }).catch(() => {})
  }

  function handleScreenshotReady(base64: string) {
    fetch(`/api/playground/${props.session.id}/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64 }),
    }).catch(() => {})
  }

  const currentEditorValue = () => {
    if (props.session.language === 'tsl') return tslSource()
    return activeTab() === 'fragment' ? fragmentSource() : vertexSource()
  }

  return (
    <div class="flex h-[calc(100vh-56px)] flex-col lg:flex-row">
      {/* Left panel: editor */}
      <div class="flex min-h-0 flex-1 flex-col border-r border-surface-card-border">
        {/* Tab bar */}
        <div class="flex border-b border-surface-card-border bg-surface-primary">
          {props.session.language === 'tsl' ? (
            <button
              class="border-b-2 border-accent px-4 py-2 text-xs font-medium text-text-primary"
            >
              source.ts
            </button>
          ) : (
            <>
              <button
                class={`px-4 py-2 text-xs font-medium transition ${
                  activeTab() === 'fragment'
                    ? 'border-b-2 border-accent text-text-primary'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
                onClick={() => setActiveTab('fragment')}
              >
                fragment.glsl
              </button>
              <button
                class={`px-4 py-2 text-xs font-medium transition ${
                  activeTab() === 'vertex'
                    ? 'border-b-2 border-accent text-text-primary'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
                onClick={() => setActiveTab('vertex')}
              >
                vertex.glsl
              </button>
            </>
          )}
          <div class="ml-auto flex items-center px-3">
            <span class="rounded bg-surface-card px-1.5 py-0.5 text-[10px] font-medium uppercase text-text-muted">
              {props.session.language === 'tsl' ? 'TSL' : 'GLSL'}
            </span>
          </div>
        </div>

        {/* Editor */}
        <div class="min-h-0 flex-1">
          <PlaygroundEditor value={currentEditorValue()} onChange={handleEditorChange} />
        </div>

        {/* Error bar */}
        <Show when={errors().length > 0}>
          <div class="max-h-32 overflow-auto border-t border-danger/30 bg-danger/5 px-4 py-2">
            <p class="mb-1 text-xs font-semibold text-danger">Compilation Errors</p>
            {errors().map((err) => (
              <pre class="whitespace-pre-wrap text-xs text-danger/80">{err}</pre>
            ))}
          </div>
        </Show>
      </div>

      {/* Right panel: canvas */}
      <div class="flex min-h-0 flex-1 flex-col bg-surface-primary">
        <div class="min-h-0 flex-1 p-4">
          <div class="h-full overflow-hidden rounded-xl border border-surface-card-border">
            <PlaygroundCanvas
              vertexSource={vertexSource()}
              fragmentSource={fragmentSource()}
              tslSource={tslSource()}
              pipeline={props.session.pipeline}
              language={props.session.language}
              onError={handleErrors}
              onScreenshotReady={handleScreenshotReady}
            />
          </div>
        </div>

        {/* Session info */}
        <div class="border-t border-surface-card-border px-4 py-2">
          <p class="text-xs text-text-muted">
            Session: <code class="text-text-secondary">{props.session.id.slice(0, 8)}...</code>
          </p>
        </div>
      </div>
    </div>
  )
}
