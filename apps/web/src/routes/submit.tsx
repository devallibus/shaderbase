import { createFileRoute } from '@tanstack/solid-router'
import { createServerFn, useServerFn } from '@tanstack/solid-start'
import { Show, createMemo, createSignal, onMount } from 'solid-js'
import { authClient } from '../lib/auth-client'
import SurfaceCard from '../components/ui/SurfaceCard'
import Kicker from '../components/ui/Kicker'
import LibraryList from '../components/LibraryList'
import AiSubmitWizard from '../components/AiSubmitWizard'

type LibraryEntry = {
  category: string
  displayName: string
  name: string
  sourceKind: string
  summary: string
}

type LibrarySnapshot = {
  githubAuthEnabled: boolean
  shaders: LibraryEntry[]
}

const listLibrarySnapshot = createServerFn({ method: 'GET' }).handler(
  async (): Promise<LibrarySnapshot> => {
    const { readdir, readFile } = await import('node:fs/promises')
    const { join, resolve } = await import('node:path')
    const { auth, ensureAuthReady, githubAuthEnabled } = await import('../lib/auth')
    const { getRequestHeaders } = await import('@tanstack/solid-start/server')

    const readEntries = async (rootPath: string) => {
      try {
        const entries = await readdir(rootPath, { withFileTypes: true })
        const manifests = await Promise.all(
          entries
            .filter((entry) => entry.isDirectory())
            .map(async (entry) => {
              try {
                const raw = await readFile(join(rootPath, entry.name, 'shader.json'), 'utf8')
                const manifest = JSON.parse(raw) as {
                  category?: string
                  displayName?: string
                  name?: string
                  provenance?: { sourceKind?: string }
                  summary?: string
                }

                return {
                  category: manifest.category ?? 'unknown',
                  displayName: manifest.displayName ?? entry.name,
                  name: manifest.name ?? entry.name,
                  sourceKind: manifest.provenance?.sourceKind ?? 'unknown',
                  summary: manifest.summary ?? 'No summary provided.',
                }
              } catch {
                return null
              }
            }),
        )

        return manifests.filter((entry): entry is LibraryEntry => entry !== null)
      } catch {
        return []
      }
    }

    const repoRoot = resolve(process.cwd(), '../..')

    await ensureAuthReady()
    await auth.api.getSession({ headers: getRequestHeaders() })

    return {
      githubAuthEnabled,
      shaders: await readEntries(join(repoRoot, 'shaders')),
    }
  },
)

export const Route = createFileRoute('/submit')({
  component: SubmitPage,
})

function SubmitPage() {
  const fetchLibrarySnapshot = useServerFn(listLibrarySnapshot)
  const sessionState = authClient.useSession()
  const [library, setLibrary] = createSignal<LibrarySnapshot>({
    githubAuthEnabled: false,
    shaders: [],
  })
  const [loadingLibrary, setLoadingLibrary] = createSignal(true)
  const [submitError, setSubmitError] = createSignal('')

  const session = createMemo(() => sessionState().data)
  const authReady = createMemo(() => library().githubAuthEnabled)

  const refreshLibrary = async () => {
    setLoadingLibrary(true)
    try {
      setLibrary(await fetchLibrarySnapshot())
    } finally {
      setLoadingLibrary(false)
    }
  }

  onMount(() => {
    void refreshLibrary()
  })

  const handleGithubSignIn = async () => {
    if (!authReady()) {
      setSubmitError(
        'GitHub OAuth is not configured yet. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in apps/web/.env.',
      )
      return
    }

    setSubmitError('')

    await authClient.signIn.social({
      callbackURL: '/submit',
      provider: 'github',
    })
  }

  const handleSignOut = async () => {
    await authClient.signOut()
    setSubmitError('')
    await refreshLibrary()
  }

  return (
    <main class="mx-auto w-full max-w-7xl px-4 pb-10 pt-12">
      <SurfaceCard class="rounded-[2rem] px-6 py-8 sm:px-10 sm:py-10">
        <Kicker>Shader Submission</Kicker>
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-3xl">
            <h1 class="mb-3 text-4xl font-black tracking-tight text-text-primary sm:text-6xl">
              Paste code. AI does the rest.
            </h1>
            <p class="m-0 text-base leading-7 text-text-secondary sm:text-lg">
              Drop in raw GLSL, a Shadertoy link, or a GitHub gist. AI analyzes the
              shader, extracts metadata, and generates the manifest. You review and
              create a pull request.
            </p>
          </div>
          <div class="rounded-2xl border border-surface-card-border bg-surface-secondary px-4 py-3 text-sm text-text-secondary">
            <div>Canonical shaders: {library().shaders.length}</div>
          </div>
        </div>
      </SurfaceCard>

      <section class="mt-5">
        <Show when={submitError()}>
          <div class="mb-4 rounded-2xl border border-danger/30 bg-danger-dim/20 p-4 text-sm text-danger">
            {submitError()}
          </div>
        </Show>
        <Show
          when={authReady()}
          fallback={
            <div class="rounded-2xl border border-danger/30 bg-danger-dim/20 p-4 text-sm leading-7 text-text-secondary">
              GitHub OAuth is not configured yet. Add values for{' '}
              <code class="text-accent">GITHUB_CLIENT_ID</code>, <code class="text-accent">GITHUB_CLIENT_SECRET</code>,{' '}
              <code class="text-accent">BETTER_AUTH_SECRET</code>, and <code class="text-accent">BETTER_AUTH_URL</code>{' '}
              in <code class="text-accent">apps/web/.env</code>.
            </div>
          }
        >
          <Show
            when={session()?.user}
            fallback={
              <div class="flex flex-col gap-4 rounded-2xl border border-surface-card-border bg-surface-card p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p class="m-0 text-sm font-semibold text-text-primary">
                    Sign in with GitHub to submit a shader.
                  </p>
                  <p class="mt-1 mb-0 text-sm text-text-secondary">
                    Authentication is required to create pull requests.
                  </p>
                </div>
                <button
                  class="inline-flex items-center justify-center rounded-full bg-accent px-4 py-2 text-sm font-semibold text-surface-primary shadow-sm transition hover:bg-accent/80"
                  type="button"
                  onClick={() => void handleGithubSignIn()}
                >
                  Continue with GitHub
                </button>
              </div>
            }
          >
            <div class="flex flex-col gap-4 rounded-2xl border border-surface-card-border bg-surface-card p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p class="m-0 text-sm font-semibold text-text-primary">
                  Signed in as {session()?.user.name || session()?.user.email}
                </p>
                <p class="mt-1 mb-0 text-sm text-text-secondary">
                  You can now parse shaders and review AI results.
                </p>
              </div>
              <button
                class="inline-flex items-center justify-center rounded-full border border-surface-card-border bg-surface-secondary px-4 py-2 text-sm font-semibold text-text-secondary shadow-sm transition hover:text-text-primary"
                type="button"
                onClick={() => void handleSignOut()}
              >
                Sign out
              </button>
            </div>
          </Show>
        </Show>
      </section>

      <section class="mt-8 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <SurfaceCard>
          <div class="mb-4 flex items-center justify-between gap-3">
            <div>
              <Kicker>Library Snapshot</Kicker>
              <h2 class="m-0 text-xl font-semibold text-text-primary">
                Current corpus
              </h2>
            </div>
            <button
              class="inline-flex items-center justify-center rounded-full border border-surface-card-border bg-surface-secondary px-4 py-2 text-sm font-semibold text-text-secondary shadow-sm transition hover:text-text-primary"
              type="button"
              onClick={() => void refreshLibrary()}
            >
              Refresh
            </button>
          </div>

          <Show
            when={!loadingLibrary()}
            fallback={<p class="m-0 text-sm text-text-muted">Loading library snapshot...</p>}
          >
            <LibraryList
              entries={library().shaders}
              emptyMessage="No canonical shaders found yet."
              title="Canonical shaders"
              valueKey="category"
            />
          </Show>
        </SurfaceCard>

        <div>
          <AiSubmitWizard />
        </div>
      </section>
    </main>
  )
}
