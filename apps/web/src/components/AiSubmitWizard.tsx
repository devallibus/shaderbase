import { Show, createMemo, createSignal } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { useServerFn } from '@tanstack/solid-start'
import {
  resolveShaderSource,
  aiParseShader,
} from '../lib/server/ai-parse'
import {
  buildDraftArtifact,
  createDefaultFormData,
  createOutputRow,
  createSourceRow,
  environmentOptions,
  materialOptions,
  pipelineOptions,
  recipeRequirementOptions,
  rendererOptions,
  sourceKindOptions,
  stageOptions,
  type SubmissionFormData,
} from '../lib/submission-draft'
import ShaderPreviewCanvas from './ShaderPreviewCanvas'
import SurfaceCard from './ui/SurfaceCard'
import Kicker from './ui/Kicker'
import SectionBlock from './ui/SectionBlock'
import Field from './ui/Field'
import TextInput from './ui/TextInput'
import TextArea from './ui/TextArea'
import SelectInput from './ui/SelectInput'
import PillGroup from './ui/PillGroup'
import SourceEditor from './form/SourceEditor'
import RecipeEditor from './form/RecipeEditor'

type AiSubmitWizardProps = {
  onSubmit: (form: SubmissionFormData) => Promise<void>
  submitting: boolean
  submitError: string
  submitStatus: string
}

type Step = 'input' | 'processing' | 'review'

export default function AiSubmitWizard(props: AiSubmitWizardProps) {
  const resolve = useServerFn(resolveShaderSource)
  const aiParse = useServerFn(aiParseShader)

  const [step, setStep] = createSignal<Step>('input')
  const [rawInput, setRawInput] = createSignal('')
  const [parseError, setParseError] = createSignal('')
  const [processingStatus, setProcessingStatus] = createSignal('')
  const [form, setForm] = createStore(createDefaultFormData())

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

  const toggleArrayValue = <T extends string>(current: readonly T[], value: T) => {
    return current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]
  }

  const handleParse = async () => {
    if (!rawInput().trim()) return
    setParseError('')
    setStep('processing')

    try {
      setProcessingStatus('Resolving source...')
      const resolved = await resolve({ data: { rawInput: rawInput() } })

      setProcessingStatus('Analyzing shader with AI...')
      const parsed = await aiParse({
        data: {
          code: resolved.code,
          sourceType: resolved.sourceType,
          metadata: resolved.metadata,
        },
      })

      // Map AI output to form data
      const newForm = createDefaultFormData()
      newForm.name = parsed.name
      newForm.displayName = parsed.displayName
      newForm.summary = parsed.summary
      newForm.description = parsed.description
      newForm.authorName = parsed.authorName
      newForm.category = parsed.category
      newForm.tagsText = parsed.tagsText
      newForm.pipeline = parsed.pipeline
      newForm.stage = parsed.stage
      newForm.capabilityRequires = parsed.capabilityRequires
      newForm.capabilityOutputs = parsed.capabilityOutputs
      newForm.material = parsed.material
      newForm.sourceKind = parsed.sourceKind
      newForm.attributionSummary = parsed.attributionSummary
      newForm.vertexShader = parsed.vertexShader
      newForm.fragmentShader = parsed.fragmentShader

      // Map uniforms
      newForm.uniforms = parsed.uniforms.map((u) => ({
        id: Math.random().toString(36).slice(2, 10),
        ...u,
      }))

      // Map inputs
      newForm.inputs = parsed.inputs.map((i) => ({
        id: Math.random().toString(36).slice(2, 10),
        ...i,
      }))

      // Map outputs
      newForm.outputs = parsed.outputs.length > 0
        ? parsed.outputs.map((o) => ({
            id: Math.random().toString(36).slice(2, 10),
            ...o,
          }))
        : [createOutputRow()]

      // Set provenance from resolved source metadata
      if (resolved.sourceType !== 'glsl' && resolved.metadata?.url) {
        newForm.sourceKind = parsed.sourceKind !== 'original' ? parsed.sourceKind : 'adapted'
        if (newForm.sources.length === 0) {
          const src = createSourceRow()
          src.name = resolved.metadata.title ?? 'Source'
          src.url = resolved.metadata.url
          src.authorsText = resolved.metadata.author ?? ''
          src.retrievedAt = new Date().toISOString().slice(0, 10)
          newForm.sources = [src]
        }
      }

      setForm(reconcile(newForm))
      setStep('review')
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Failed to parse shader')
      setStep('input')
    }
  }

  const handleFormSubmit = async (event: SubmitEvent) => {
    event.preventDefault()
    await props.onSubmit(JSON.parse(JSON.stringify(form)) as SubmissionFormData)
  }

  return (
    <>
      {/* Step 1: Input */}
      <Show when={step() === 'input'}>
        <SurfaceCard class="p-6">
          <Kicker>AI-Powered Submission</Kicker>
          <h2 class="mb-4 text-xl font-semibold text-text-primary">
            Paste your shader code or a link
          </h2>
          <p class="mb-4 text-sm text-text-secondary">
            Drop in raw GLSL, a Shadertoy URL, a GitHub gist, or a GitHub file link.
            AI will analyze the code and extract all metadata automatically.
          </p>
          <textarea
            class="mb-4 w-full rounded-2xl border border-surface-card-border bg-surface-primary px-4 py-3 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
            rows={12}
            placeholder={`Paste GLSL code here, or a URL like:
  https://www.shadertoy.com/view/XsXXDn
  https://gist.github.com/user/abc123
  https://github.com/user/repo/blob/main/shader.glsl`}
            value={rawInput()}
            onInput={(e) => setRawInput(e.currentTarget.value)}
          />
          <Show when={parseError()}>
            <p class="mb-3 rounded-xl border border-danger/30 bg-danger-dim/20 px-3 py-2 text-sm text-danger">
              {parseError()}
            </p>
          </Show>
          <button
            type="button"
            class="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-surface-primary transition hover:bg-accent/80 disabled:opacity-50"
            disabled={!rawInput().trim()}
            onClick={() => void handleParse()}
          >
            Parse with AI
          </button>
        </SurfaceCard>
      </Show>

      {/* Step 2: Processing */}
      <Show when={step() === 'processing'}>
        <SurfaceCard class="flex flex-col items-center justify-center p-10">
          <div class="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p class="text-sm font-medium text-text-primary">{processingStatus()}</p>
          <p class="mt-1 text-xs text-text-muted">This may take a few seconds.</p>
        </SurfaceCard>
      </Show>

      {/* Step 3: Review & Edit */}
      <Show when={step() === 'review'}>
        <SurfaceCard class="mb-4 p-4">
          <div class="flex items-center justify-between">
            <div>
              <Kicker>Review & Edit</Kicker>
              <p class="text-sm text-text-secondary">
                AI has populated the fields below. Review, adjust as needed, then submit.
              </p>
            </div>
            <button
              type="button"
              class="rounded-full border border-surface-card-border bg-surface-secondary px-4 py-2 text-sm font-semibold text-text-secondary transition hover:text-text-primary"
              onClick={() => {
                setStep('input')
                setForm(reconcile(createDefaultFormData()))
              }}
            >
              Start over
            </button>
          </div>
        </SurfaceCard>

        <div class="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <form onSubmit={handleFormSubmit}>
            <SectionBlock>
              <div class="grid gap-4 md:grid-cols-2">
                <Field class="md:col-span-2" label="Shader name">
                  <TextInput value={form.name} onInput={(v) => setForm('name', v)} />
                </Field>
                <Field label="Display name">
                  <TextInput value={form.displayName} onInput={(v) => setForm('displayName', v)} />
                </Field>
                <Field label="Version">
                  <TextInput value={form.version} onInput={(v) => setForm('version', v)} />
                </Field>
                <Field class="md:col-span-2" label="Summary">
                  <TextInput value={form.summary} onInput={(v) => setForm('summary', v)} />
                </Field>
                <Field class="md:col-span-2" label="Description">
                  <TextArea value={form.description} onInput={(v) => setForm('description', v)} rows={4} />
                </Field>
                <Field label="Author name">
                  <TextInput value={form.authorName} onInput={(v) => setForm('authorName', v)} />
                </Field>
                <Field label="Author GitHub">
                  <TextInput value={form.authorGithub} onInput={(v) => setForm('authorGithub', v)} />
                </Field>
                <Field label="License">
                  <TextInput value={form.license} onInput={(v) => setForm('license', v)} />
                </Field>
                <Field label="Category">
                  <TextInput value={form.category} onInput={(v) => setForm('category', v)} />
                </Field>
                <Field class="md:col-span-2" label="Tags">
                  <TextInput value={form.tagsText} onInput={(v) => setForm('tagsText', v)} />
                </Field>
              </div>
            </SectionBlock>

            <SectionBlock title="Capability and compatibility">
              <div class="grid gap-4 md:grid-cols-2">
                <Field label="Pipeline">
                  <SelectInput value={form.pipeline} onInput={(v) => setForm('pipeline', v as SubmissionFormData['pipeline'])} options={pipelineOptions} />
                </Field>
                <Field label="Stage">
                  <SelectInput value={form.stage} onInput={(v) => setForm('stage', v as SubmissionFormData['stage'])} options={stageOptions} />
                </Field>
                <PillGroup class="md:col-span-2" label="Renderers" options={rendererOptions} selected={form.renderers} onToggle={(v) => setForm('renderers', toggleArrayValue(form.renderers, v as SubmissionFormData['renderers'][number]) as SubmissionFormData['renderers'])} />
                <PillGroup class="md:col-span-2" label="Environments" options={environmentOptions} selected={form.environments} onToggle={(v) => setForm('environments', toggleArrayValue(form.environments, v as SubmissionFormData['environments'][number]) as SubmissionFormData['environments'])} />
                <Field label="Three.js range">
                  <TextInput value={form.threeRange} onInput={(v) => setForm('threeRange', v)} />
                </Field>
                <Field label="Material kind">
                  <SelectInput value={form.material} onInput={(v) => setForm('material', v as SubmissionFormData['material'])} options={materialOptions} />
                </Field>
              </div>
            </SectionBlock>

            <SectionBlock title="Provenance" action={<button class="inline-flex items-center justify-center rounded-full border border-surface-card-border bg-surface-secondary px-4 py-2 text-sm font-semibold text-text-secondary shadow-sm transition hover:text-text-primary" type="button" onClick={() => setForm('sources', (rows) => [...rows, createSourceRow()])}>Add source</button>}>
              <div class="grid gap-4 md:grid-cols-2">
                <Field label="Source kind">
                  <SelectInput value={form.sourceKind} onInput={(v) => setForm('sourceKind', v as SubmissionFormData['sourceKind'])} options={sourceKindOptions} />
                </Field>
                <Field class="md:col-span-2" label="Attribution summary">
                  <TextInput value={form.attributionSummary} onInput={(v) => setForm('attributionSummary', v)} />
                </Field>
                <Field class="md:col-span-2" label="Required downstream notice">
                  <TextInput value={form.requiredNotice} onInput={(v) => setForm('requiredNotice', v)} />
                </Field>
              </div>
              <Show when={form.sources.length > 0}>
                <div class="mt-4 grid gap-4">
                  {form.sources.map((row, index) => (
                    <SourceEditor row={row} onChange={(key, value) => setForm('sources', index, key, value as never)} onRemove={() => setForm('sources', form.sources.filter((c) => c.id !== row.id))} />
                  ))}
                </div>
              </Show>
            </SectionBlock>

            <SectionBlock title="Shader files">
              <div class="grid gap-4">
                <Field label="Vertex shader">
                  <TextArea value={form.vertexShader} onInput={(v) => setForm('vertexShader', v)} rows={8} monospace />
                </Field>
                <Field label="Fragment shader">
                  <TextArea value={form.fragmentShader} onInput={(v) => setForm('fragmentShader', v)} rows={10} monospace />
                </Field>
                <Field label="Preview SVG">
                  <TextArea value={form.previewSvg} onInput={(v) => setForm('previewSvg', v)} rows={6} monospace />
                </Field>
              </div>
            </SectionBlock>

            <SectionBlock title="Recipes">
              <div class="grid gap-4">
                <RecipeEditor label="Three.js recipe" recipe={form.threeRecipe} onToggle={(v) => setForm('threeRecipe', 'enabled', v)} onSummary={(v) => setForm('threeRecipe', 'summary', v)} onRequirementsToggle={(v) => setForm('threeRecipe', 'requirements', toggleArrayValue(form.threeRecipe.requirements, v as SubmissionFormData['threeRecipe']['requirements'][number]) as SubmissionFormData['threeRecipe']['requirements'])} onCode={(v) => setForm('threeRecipe', 'code', v)} />
                <RecipeEditor label="React Three Fiber recipe" recipe={form.r3fRecipe} onToggle={(v) => setForm('r3fRecipe', 'enabled', v)} onSummary={(v) => setForm('r3fRecipe', 'summary', v)} onRequirementsToggle={(v) => setForm('r3fRecipe', 'requirements', toggleArrayValue(form.r3fRecipe.requirements, v as SubmissionFormData['r3fRecipe']['requirements'][number]) as SubmissionFormData['r3fRecipe']['requirements'])} onCode={(v) => setForm('r3fRecipe', 'code', v)} />
              </div>
            </SectionBlock>

            <div class="mt-6">
              <Show when={props.submitStatus}>
                <p class="mb-3 rounded-xl border border-accent/30 bg-accent-dim/20 px-3 py-2 text-sm text-accent">
                  {props.submitStatus}
                </p>
              </Show>
              <Show when={props.submitError}>
                <p class="mb-3 rounded-xl border border-danger/30 bg-danger-dim/20 px-3 py-2 text-sm text-danger">
                  {props.submitError}
                </p>
              </Show>
              <button
                class="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-surface-primary transition hover:bg-accent/80 disabled:opacity-50"
                disabled={props.submitting || !!previewState().error}
                type="submit"
              >
                {props.submitting ? 'Saving draft...' : 'Save draft to submissions/'}
              </button>
            </div>
          </form>

          <div class="space-y-4">
            {/* Live shader preview */}
            <SurfaceCard class="p-4">
              <h3 class="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent">
                Live Preview
              </h3>
              <ShaderPreviewCanvas
                vertexSource={form.vertexShader}
                fragmentSource={form.fragmentShader}
                uniforms={form.uniforms.map((u) => ({
                  ...u,
                  defaultValue: (() => {
                    try {
                      if (u.type === 'float' || u.type === 'int') return Number(u.defaultValue) || 0
                      if (u.type === 'bool') return u.defaultValue === 'true'
                      if (['vec2', 'vec3', 'vec4', 'color'].includes(u.type)) {
                        return u.defaultValue.split(',').map((v) => Number(v.trim()) || 0)
                      }
                      return u.defaultValue || null
                    } catch {
                      return 0
                    }
                  })(),
                  min: u.min ? Number(u.min) : undefined,
                  max: u.max ? Number(u.max) : undefined,
                }))}
                uniformOverrides={{}}
                pipeline={form.pipeline}
              />
            </SurfaceCard>

            {/* Manifest preview */}
            <SurfaceCard class="p-4">
              <div class="mb-3 flex items-center justify-between">
                <h3 class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent">
                  Manifest Preview
                </h3>
                <span class="inline-flex items-center rounded-full border border-surface-card-border bg-surface-tertiary px-3 py-1 text-xs font-semibold text-text-secondary">
                  shader.json
                </span>
              </div>
              <Show
                when={!previewState().error}
                fallback={
                  <p class="rounded-xl border border-danger/30 bg-danger-dim/20 px-3 py-2 text-sm text-danger">
                    {previewState().error}
                  </p>
                }
              >
                <pre class="max-h-[32rem] overflow-auto rounded-2xl bg-surface-primary p-4 font-mono text-xs leading-6 text-accent/90">
                  {previewState().manifest}
                </pre>
              </Show>
            </SurfaceCard>
          </div>
        </div>
      </Show>
    </>
  )
}
