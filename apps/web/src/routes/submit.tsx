import { createFileRoute } from '@tanstack/solid-router'
import { createServerFn, useServerFn } from '@tanstack/solid-start'
import { For, Show, createMemo, createSignal, onMount } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import {
  buildDraftArtifact,
  createDefaultFormData,
  createSourceRow,
  environmentOptions,
  materialOptions,
  pipelineOptions,
  recipeRequirementOptions,
  rendererOptions,
  sourceKindOptions,
  stageOptions,
  type SourceFormRow,
  type SubmissionFormData,
} from '../lib/submission-draft'
import { authClient } from '../lib/auth-client'
import SurfaceCard from '../components/ui/SurfaceCard'
import Kicker from '../components/ui/Kicker'
import SectionBlock from '../components/ui/SectionBlock'
import Field from '../components/ui/Field'
import TextInput from '../components/ui/TextInput'
import TextArea from '../components/ui/TextArea'
import SelectInput from '../components/ui/SelectInput'
import PillGroup from '../components/ui/PillGroup'
import LibraryList from '../components/LibraryList'
import SourceEditor from '../components/form/SourceEditor'
import RecipeEditor from '../components/form/RecipeEditor'

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
  const [form, setForm] = createStore(createDefaultFormData())
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
  const previewState = createMemo(() => {
    try {
      const artifact = buildDraftArtifact(form)
      return { error: '', manifest: JSON.stringify(artifact.manifest, null, 2) }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        manifest: '',
      }
    }
  })

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

  const resetForm = () => {
    setForm(reconcile(createDefaultFormData()))
    setSubmitError('')
    setSubmitStatus('')
  }

  const toggleArrayValue = <T extends string>(current: readonly T[], value: T) => {
    return current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]
  }

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

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault()
    setSubmitError('')
    setSubmitStatus('')

    if (previewState().error) {
      setSubmitError(previewState().error)
      return
    }

    setSubmitting(true)

    try {
      const result = await submitDraft({
        data: JSON.parse(JSON.stringify(form)) as SubmissionFormData,
      })

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
              Add a shader without reverse-engineering the schema.
            </h1>
            <p class="m-0 text-base leading-7 text-text-secondary sm:text-lg">
              The form encodes the important rules up front. The server still
              validates the final artifact against the canonical ShaderBase
              schema before it writes a draft into <code class="text-accent">submissions/</code>.
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

      <section class="mt-8 grid gap-4 lg:grid-cols-[0.95fr_1.25fr]">
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

        <SurfaceCard class="p-5">
          <form onSubmit={handleSubmit}>
            <div class="mb-5 flex items-center justify-between gap-3">
              <div>
                <Kicker>Submission Builder</Kicker>
                <h2 class="m-0 text-xl font-semibold text-text-primary">
                  Guided draft intake
                </h2>
              </div>
              <button
                class="inline-flex items-center justify-center rounded-full border border-surface-card-border bg-surface-secondary px-4 py-2 text-sm font-semibold text-text-secondary shadow-sm transition hover:text-text-primary"
                type="button"
                onClick={resetForm}
              >
                Reset
              </button>
            </div>

            <SectionBlock>
              <div class="grid gap-4 md:grid-cols-2">
                <Field class="md:col-span-2" label="Shader name">
                  <TextInput value={form.name} onInput={(value) => setForm('name', value)} placeholder="simplex-displacement" />
                </Field>
                <Field label="Display name">
                  <TextInput value={form.displayName} onInput={(value) => setForm('displayName', value)} />
                </Field>
                <Field label="Version">
                  <TextInput value={form.version} onInput={(value) => setForm('version', value)} />
                </Field>
                <Field class="md:col-span-2" label="Summary">
                  <TextInput value={form.summary} onInput={(value) => setForm('summary', value)} />
                </Field>
                <Field class="md:col-span-2" label="Description">
                  <TextArea value={form.description} onInput={(value) => setForm('description', value)} rows={5} />
                </Field>
                <Field label="Author name">
                  <TextInput value={form.authorName} onInput={(value) => setForm('authorName', value)} />
                </Field>
                <Field label="Author GitHub">
                  <TextInput value={form.authorGithub} onInput={(value) => setForm('authorGithub', value)} />
                </Field>
                <Field class="md:col-span-2" label="Author URL">
                  <TextInput value={form.authorUrl} onInput={(value) => setForm('authorUrl', value)} placeholder="https://example.com" />
                </Field>
                <Field label="License">
                  <TextInput value={form.license} onInput={(value) => setForm('license', value)} />
                </Field>
                <Field label="Category">
                  <TextInput value={form.category} onInput={(value) => setForm('category', value)} />
                </Field>
                <Field class="md:col-span-2" label="Tags">
                  <TextInput value={form.tagsText} onInput={(value) => setForm('tagsText', value)} placeholder="noise, surface, water" />
                </Field>
              </div>
            </SectionBlock>

            <SectionBlock title="Capability and compatibility">
              <div class="grid gap-4 md:grid-cols-2">
                <Field label="Pipeline">
                  <SelectInput value={form.pipeline} onInput={(value) => setForm('pipeline', value as SubmissionFormData['pipeline'])} options={pipelineOptions} />
                </Field>
                <Field label="Stage">
                  <SelectInput value={form.stage} onInput={(value) => setForm('stage', value as SubmissionFormData['stage'])} options={stageOptions} />
                </Field>
                <PillGroup class="md:col-span-2" label="Renderers" options={rendererOptions} selected={form.renderers} onToggle={(value) => setForm('renderers', toggleArrayValue(form.renderers, value as SubmissionFormData['renderers'][number]) as SubmissionFormData['renderers'])} />
                <PillGroup class="md:col-span-2" label="Environments" options={environmentOptions} selected={form.environments} onToggle={(value) => setForm('environments', toggleArrayValue(form.environments, value as SubmissionFormData['environments'][number]) as SubmissionFormData['environments'])} />
                <Field label="Three.js range">
                  <TextInput value={form.threeRange} onInput={(value) => setForm('threeRange', value)} />
                </Field>
                <Field label="Material kind">
                  <SelectInput value={form.material} onInput={(value) => setForm('material', value as SubmissionFormData['material'])} options={materialOptions} />
                </Field>
              </div>
            </SectionBlock>

            <SectionBlock title="Provenance" action={<button class="inline-flex items-center justify-center rounded-full border border-surface-card-border bg-surface-secondary px-4 py-2 text-sm font-semibold text-text-secondary shadow-sm transition hover:text-text-primary" type="button" onClick={() => setForm('sources', (rows) => [...rows, createSourceRow()])}>Add source</button>}>
              <div class="grid gap-4 md:grid-cols-2">
                <Field label="Source kind">
                  <SelectInput value={form.sourceKind} onInput={(value) => setForm('sourceKind', value as SubmissionFormData['sourceKind'])} options={sourceKindOptions} />
                </Field>
                <Field class="md:col-span-2" label="Attribution summary">
                  <TextInput value={form.attributionSummary} onInput={(value) => setForm('attributionSummary', value)} />
                </Field>
                <Field class="md:col-span-2" label="Required downstream notice">
                  <TextInput value={form.requiredNotice} onInput={(value) => setForm('requiredNotice', value)} placeholder="Required for adapted or ported shaders." />
                </Field>
                <Field class="md:col-span-2" label="Notes">
                  <TextArea value={form.provenanceNotes} onInput={(value) => setForm('provenanceNotes', value)} rows={4} />
                </Field>
              </div>
              <Show when={form.sources.length > 0} fallback={<p class="mt-4 text-sm leading-7 text-text-secondary">Original shaders can stay source-free. Adapted and ported entries should add exact upstream references here.</p>}>
                <div class="mt-4 grid gap-4">
                  <For each={form.sources}>
                    {(row, index) => (
                      <SourceEditor row={row} onChange={(key, value) => setForm('sources', index(), key, value as never)} onRemove={() => setForm('sources', form.sources.filter((candidate) => candidate.id !== row.id))} />
                    )}
                  </For>
                </div>
              </Show>
            </SectionBlock>

            <SectionBlock title="Shader files">
              <div class="grid gap-4 md:grid-cols-2">
                <Field class="md:col-span-2" label="Vertex shader">
                  <TextArea value={form.vertexShader} onInput={(value) => setForm('vertexShader', value)} rows={10} monospace />
                </Field>
                <Field class="md:col-span-2" label="Fragment shader">
                  <TextArea value={form.fragmentShader} onInput={(value) => setForm('fragmentShader', value)} rows={10} monospace />
                </Field>
                <Field class="md:col-span-2" label="Preview SVG">
                  <TextArea value={form.previewSvg} onInput={(value) => setForm('previewSvg', value)} rows={10} monospace />
                </Field>
              </div>
            </SectionBlock>

            <SectionBlock title="Recipes">
              <div class="grid gap-4">
                <RecipeEditor label="Three.js recipe" recipe={form.threeRecipe} onToggle={(value) => setForm('threeRecipe', 'enabled', value)} onSummary={(value) => setForm('threeRecipe', 'summary', value)} onRequirementsToggle={(value) => setForm('threeRecipe', 'requirements', toggleArrayValue(form.threeRecipe.requirements, value as SubmissionFormData['threeRecipe']['requirements'][number]) as SubmissionFormData['threeRecipe']['requirements'])} onCode={(value) => setForm('threeRecipe', 'code', value)} />
                <RecipeEditor label="React Three Fiber recipe" recipe={form.r3fRecipe} onToggle={(value) => setForm('r3fRecipe', 'enabled', value)} onSummary={(value) => setForm('r3fRecipe', 'summary', value)} onRequirementsToggle={(value) => setForm('r3fRecipe', 'requirements', toggleArrayValue(form.r3fRecipe.requirements, value as SubmissionFormData['r3fRecipe']['requirements'][number]) as SubmissionFormData['r3fRecipe']['requirements'])} onCode={(value) => setForm('r3fRecipe', 'code', value)} />
              </div>
            </SectionBlock>

            <div class="mt-6 grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
              <div class="rounded-2xl border border-surface-card-border bg-surface-card p-4">
                <div class="mb-3 flex items-center justify-between">
                  <h3 class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent">
                    Manifest preview
                  </h3>
                  <span class="inline-flex items-center rounded-full border border-surface-card-border bg-surface-tertiary px-3 py-1 text-xs font-semibold text-text-secondary">
                    shader.json
                  </span>
                </div>
                <Show when={!previewState().error} fallback={<p class="rounded-xl border border-danger/30 bg-danger-dim/20 px-3 py-2 text-sm text-danger">{previewState().error}</p>}>
                  <pre class="max-h-[32rem] overflow-auto rounded-2xl bg-surface-primary p-4 font-mono text-xs leading-6 text-accent/90">{previewState().manifest}</pre>
                </Show>
              </div>

              <div class="rounded-2xl border border-surface-card-border bg-surface-card p-4">
                <h3 class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent">
                  Save draft
                </h3>
                <p class="mt-3 mb-4 text-sm leading-7 text-text-secondary">
                  The server writes canonical filenames into <code class="text-accent">submissions/&lt;name&gt;</code>{' '}
                  and removes the folder if validation fails.
                </p>
                <Show when={submitStatus()}>
                  <p class="mb-3 rounded-xl border border-accent/30 bg-accent-dim/20 px-3 py-2 text-sm text-accent">{submitStatus()}</p>
                </Show>
                <Show when={submitError()}>
                  <p class="mb-3 rounded-xl border border-danger/30 bg-danger-dim/20 px-3 py-2 text-sm text-danger">{submitError()}</p>
                </Show>
                <button class="inline-flex items-center justify-center rounded-full bg-accent px-4 py-2 text-sm font-semibold text-surface-primary shadow-sm transition hover:bg-accent/80 disabled:cursor-progress disabled:opacity-70" disabled={submitting() || !authReady() || !session()?.user} type="submit">
                  {submitting() ? 'Saving draft...' : 'Save draft to submissions/'}
                </button>
              </div>
            </div>
          </form>
        </SurfaceCard>
      </section>
    </main>
  )
}
