import { createFileRoute } from '@tanstack/solid-router'
import { createServerFn, useServerFn } from '@tanstack/solid-start'
import { Show, createMemo, createSignal, onMount } from 'solid-js'
import {
  buildDraftArtifact,
  type SubmissionFormData,
} from '../lib/submission-draft'
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
  drafts: LibraryEntry[]
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
      drafts: await readEntries(join(repoRoot, 'submissions')),
      githubAuthEnabled,
      shaders: await readEntries(join(repoRoot, 'shaders')),
    }
  },
)

const saveDraftSubmission = createServerFn({ method: 'POST' })
  .inputValidator((input: SubmissionFormData) => input)
  .handler(async ({ data }) => {
    const { access, mkdir, rm, writeFile } = await import('node:fs/promises')
    const { join, resolve } = await import('node:path')
    const { getRequestHeaders } = await import('@tanstack/solid-start/server')
    const { auth, ensureAuthReady } = await import('../lib/auth')
    const { validateShaderManifestFile } = await import(
      '../../../../packages/schema/src/index.ts'
    )

    const artifact = buildDraftArtifact(data)
    const repoRoot = resolve(process.cwd(), '../..')
    const submissionsRoot = join(repoRoot, 'submissions')
    const draftRoot = join(submissionsRoot, artifact.manifest.name as string)
    const draftExists = await access(draftRoot)
      .then(() => true)
      .catch(() => false)

    if (draftExists) {
      throw new Error(`A draft named "${artifact.manifest.name}" already exists.`)
    }

    await ensureAuthReady()

    const session = await auth.api.getSession({
      headers: getRequestHeaders(),
    })

    if (!session?.user) {
      throw new Error('Sign in with GitHub before submitting a shader draft.')
    }

    await mkdir(submissionsRoot, { recursive: true })

    try {
      await mkdir(join(draftRoot, 'recipes'), { recursive: true })

      await Promise.all(
        Object.entries(artifact.files).map(([relativePath, content]) =>
          writeFile(join(draftRoot, relativePath), content, 'utf8'),
        ),
      )

      await writeFile(
        join(draftRoot, 'shader.json'),
        JSON.stringify(artifact.manifest, null, 2),
        'utf8',
      )

      validateShaderManifestFile(join(draftRoot, 'shader.json'))

      return { path: `submissions/${artifact.manifest.name}` }
    } catch (error) {
      await rm(draftRoot, { recursive: true, force: true })
      throw error
    }
  })

export const Route = createFileRoute('/submit')({
  component: SubmitPage,
})

function SubmitPage() {
  const fetchLibrarySnapshot = useServerFn(listLibrarySnapshot)
  const submitDraft = useServerFn(saveDraftSubmission)
  const sessionState = authClient.useSession()
  const [library, setLibrary] = createSignal<LibrarySnapshot>({
    drafts: [],
    githubAuthEnabled: false,
    shaders: [],
  })
  const [loadingLibrary, setLoadingLibrary] = createSignal(true)
  const [submitError, setSubmitError] = createSignal('')
  const [submitStatus, setSubmitStatus] = createSignal('')
  const [submitting, setSubmitting] = createSignal(false)

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
    setSubmitStatus('')
    setSubmitError('')
    await refreshLibrary()
  }

  const handleSubmit = async (formData: SubmissionFormData) => {
    setSubmitError('')
    setSubmitStatus('')
    setSubmitting(true)

    try {
      const result = await submitDraft({ data: formData })
      setSubmitStatus(`Draft saved to ${result.path}`)
      await refreshLibrary()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error))
    } finally {
      setSubmitting(false)
    }
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
              shader, extracts metadata, and generates the manifest. You review, tweak,
              and submit.
            </p>
          </div>
          <div class="rounded-2xl border border-surface-card-border bg-surface-secondary px-4 py-3 text-sm text-text-secondary">
            <div>Canonical shaders: {library().shaders.length}</div>
            <div>Draft queue: {library().drafts.length}</div>
          </div>
        </div>
      </SurfaceCard>

      <section class="mt-5">
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
                    Sign in with GitHub to save a shader draft.
                  </p>
                  <p class="mt-1 mb-0 text-sm text-text-secondary">
                    The server rejects draft writes without a live Better Auth session.
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
                  Your session can now create validated draft folders for review.
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
                Current corpus and pending drafts
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
            <div class="space-y-5">
              <LibraryList
                entries={library().shaders}
                emptyMessage="No canonical shaders found yet."
                title="Canonical shaders"
                valueKey="category"
              />
              <LibraryList
                entries={library().drafts}
                emptyMessage="No draft submissions yet."
                title="Draft submissions"
                valueKey="sourceKind"
              />
            </div>
          </Show>
        </SurfaceCard>

        <div>
          <AiSubmitWizard
            onSubmit={handleSubmit}
            submitting={submitting()}
            submitError={submitError()}
            submitStatus={submitStatus()}
          />
        </div>
      </section>
    </main>
  )
}
