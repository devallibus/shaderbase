import { createFileRoute } from '@tanstack/solid-router'
import { useServerFn } from '@tanstack/solid-start'
import { For, Show, createMemo, createSignal, onMount } from 'solid-js'
import { listShaders, type ShaderEntry } from '../lib/server/shaders'
import SearchBar from '../components/SearchBar'
import ShaderCard from '../components/ShaderCard'

export const Route = createFileRoute('/shaders')({
  validateSearch: (search: Record<string, unknown>) => ({
    q: (search.q as string) ?? '',
  }),
  component: ShadersPage,
})

function ShadersPage() {
  const routeSearch = Route.useSearch()
  const fetchShaders = useServerFn(listShaders)
  const [shaders, setShaders] = createSignal<ShaderEntry[]>([])
  const [loading, setLoading] = createSignal(true)
  const [query, setQuery] = createSignal(routeSearch().q)
  const [categoryFilter, setCategoryFilter] = createSignal('')
  const [pipelineFilter, setPipelineFilter] = createSignal('')

  onMount(async () => {
    try {
      setShaders(await fetchShaders())
    } finally {
      setLoading(false)
    }
  })

  const categories = createMemo(() => [...new Set(shaders().map((s) => s.category))].sort())
  const pipelines = createMemo(() => [...new Set(shaders().map((s) => s.pipeline))].sort())

  const filtered = createMemo(() => {
    let result = shaders()
    const q = query().toLowerCase().trim()
    const cat = categoryFilter()
    const pipe = pipelineFilter()

    if (q) {
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.displayName.toLowerCase().includes(q) ||
          s.summary.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }

    if (cat) result = result.filter((s) => s.category === cat)
    if (pipe) result = result.filter((s) => s.pipeline === pipe)

    return result
  })

  const toggleFilter = (
    current: () => string,
    setter: (v: string) => void,
    value: string,
  ) => {
    setter(current() === value ? '' : value)
  }

  return (
    <main class="mx-auto w-full max-w-5xl px-4 pb-16 pt-10">
      <div class="mb-8">
        <h1 class="mb-1 font-mono text-2xl font-bold tracking-tight text-text-primary">
          Shaders
        </h1>
        <p class="text-sm text-text-muted">
          Every shader here is validated, attributed, and ships with integration recipes.
        </p>
      </div>

      <div class="mb-5">
        <SearchBar
          value={query()}
          onInput={setQuery}
          onSubmit={setQuery}
          placeholder="Filter by name, tag, or keyword..."
        />
      </div>

      <Show when={!loading() && shaders().length > 0}>
        <div class="mb-6 flex flex-wrap gap-3">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-xs text-text-muted">category</span>
            <For each={categories()}>
              {(cat) => (
                <button
                  class={`rounded-full px-2.5 py-1 text-xs transition ${
                    categoryFilter() === cat
                      ? 'border border-accent/30 bg-accent-glow text-accent'
                      : 'border border-surface-card-border text-text-muted hover:text-text-secondary'
                  }`}
                  onClick={() => toggleFilter(categoryFilter, setCategoryFilter, cat)}
                >
                  {cat}
                </button>
              )}
            </For>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-xs text-text-muted">pipeline</span>
            <For each={pipelines()}>
              {(pipe) => (
                <button
                  class={`rounded-full px-2.5 py-1 text-xs transition ${
                    pipelineFilter() === pipe
                      ? 'border border-accent/30 bg-accent-glow text-accent'
                      : 'border border-surface-card-border text-text-muted hover:text-text-secondary'
                  }`}
                  onClick={() => toggleFilter(pipelineFilter, setPipelineFilter, pipe)}
                >
                  {pipe}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={!loading()} fallback={<p class="text-sm text-text-muted">Loading...</p>}>
        <p class="mb-4 text-xs text-text-muted">
          {filtered().length} result{filtered().length !== 1 ? 's' : ''}
        </p>

        <Show
          when={filtered().length > 0}
          fallback={
            <div class="rounded-xl border border-dashed border-surface-card-border p-10 text-center">
              <p class="text-sm text-text-muted">No shaders match your filters.</p>
            </div>
          }
        >
          <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <For each={filtered()}>
              {(shader) => <ShaderCard shader={shader} />}
            </For>
          </div>
        </Show>
      </Show>
    </main>
  )
}
