import { createFileRoute, Link, useNavigate } from '@tanstack/solid-router'
import { createSignal, onMount } from 'solid-js'
import { useServerFn } from '@tanstack/solid-start'
import AsciiBackground from '../components/AsciiBackground'
import SearchBar from '../components/SearchBar'
import { listShaders } from '../lib/server/shaders'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
  const navigate = useNavigate()
  const fetchShaders = useServerFn(listShaders)
  const [query, setQuery] = createSignal('')
  const [shaderCount, setShaderCount] = createSignal(0)

  onMount(async () => {
    try {
      const shaders = await fetchShaders()
      setShaderCount(shaders.length)
    } catch {
      // non-critical
    }
  })

  const handleSearch = (q: string) => {
    void navigate({ to: '/shaders', search: q.trim() ? { q } : {} })
  }

  return (
    <div class="relative min-h-screen">
      <AsciiBackground />

      <main class="pointer-events-none relative z-10 flex min-h-[calc(100vh-64px)] flex-col items-center justify-center px-4">
        <h1 class="mb-3 text-center font-mono text-5xl font-bold tracking-tighter text-accent sm:text-6xl md:text-7xl lg:text-8xl">
          shaderbase
        </h1>

        <p class="mb-10 max-w-sm text-center text-[0.9rem] leading-relaxed text-text-secondary">
          The shader registry that lives in your repo.
          Search, inspect, integrate. No database required.
        </p>

        <div class="pointer-events-auto">
          <SearchBar
            value={query()}
            onInput={setQuery}
            onSubmit={handleSearch}
            placeholder="Search shaders..."
          />
        </div>

        <Link
          to="/shaders"
          class="pointer-events-auto mt-5 font-mono text-sm text-accent transition hover:text-accent/70"
        >
          Browse all shaders &rarr;
        </Link>

        <div class="mt-14 flex gap-5 text-xs text-text-muted">
          <span class="rounded-full border border-surface-card-border bg-surface-card px-3 py-1">
            {shaderCount()} shaders
          </span>
          <span class="rounded-full border border-surface-card-border bg-surface-card px-3 py-1">
            git-backed
          </span>
          <span class="rounded-full border border-surface-card-border bg-surface-card px-3 py-1">
            agent-first
          </span>
        </div>
      </main>
    </div>
  )
}
