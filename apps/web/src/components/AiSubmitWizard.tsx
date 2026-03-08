import { For, Show, createSignal } from 'solid-js'
import { useServerFn } from '@tanstack/solid-start'
import {
  resolveShaderSource,
  aiParseShader,
} from '../lib/server/ai-parse'
import { createShaderPR } from '../lib/server/github-pr'
import type { ShaderDetailUniform } from '../lib/server/shader-detail'
import ShaderPreviewCanvas from './ShaderPreviewCanvas'
import SurfaceCard from './ui/SurfaceCard'
import Kicker from './ui/Kicker'

/** The shape returned by the AI parse server function. */
type AiParsedShader = {
  name: string
  displayName: string
  summary: string
  description: string
  authorName: string
  category: string
  tagsText: string
  pipeline: string
  stage: string
  capabilityRequires: string[]
  capabilityOutputs: string[]
  material: string
  sourceKind: string
  attributionSummary: string
  uniforms: Array<{
    name: string
    type: string
    defaultValue: string
    description: string
    min: string
    max: string
  }>
  inputs: Array<{
    name: string
    kind: string
    description: string
    required: boolean
  }>
  outputs: Array<{
    name: string
    kind: string
    description: string
  }>
  vertexShader: string
  fragmentShader: string
}

type Step = 'input' | 'processing' | 'review'

export default function AiSubmitWizard() {
  const resolve = useServerFn(resolveShaderSource)
  const aiParse = useServerFn(aiParseShader)
  const submitPR = useServerFn(createShaderPR)

  const [step, setStep] = createSignal<Step>('input')
  const [rawInput, setRawInput] = createSignal('')
  const [parseError, setParseError] = createSignal('')
  const [processingStatus, setProcessingStatus] = createSignal('')
  const [parsed, setParsed] = createSignal<AiParsedShader | null>(null)
  const [prLoading, setPrLoading] = createSignal(false)
  const [prError, setPrError] = createSignal('')
  const [prUrl, setPrUrl] = createSignal('')

  const previewUniforms = (): ShaderDetailUniform[] => {
    const data = parsed()
    if (!data) return []
    return data.uniforms.map((u) => ({
      name: u.name,
      type: u.type,
      description: u.description,
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
    }))
  }

  const handleParse = async () => {
    if (!rawInput().trim()) return
    setParseError('')
    setStep('processing')

    try {
      setProcessingStatus('Resolving source...')
      const resolved = await resolve({ data: { rawInput: rawInput() } })

      setProcessingStatus('Analyzing shader with AI...')
      const result = await aiParse({
        data: {
          code: resolved.code,
          sourceType: resolved.sourceType,
          metadata: resolved.metadata,
        },
      })

      setParsed(result as AiParsedShader)
      setStep('review')
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Failed to parse shader')
      setStep('input')
    }
  }

  const buildManifest = (data: AiParsedShader): Record<string, unknown> => {
    const parseDefault = (u: AiParsedShader['uniforms'][number]) => {
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
    }

    return {
      schemaVersion: '0.1.0',
      name: data.name,
      displayName: data.displayName,
      version: '0.1.0',
      summary: data.summary,
      description: data.description,
      author: { name: data.authorName },
      license: 'MIT',
      tags: data.tagsText.split(',').map((t) => t.trim()).filter(Boolean),
      category: data.category,
      capabilityProfile: {
        pipeline: data.pipeline,
        stage: data.stage,
        requires: data.capabilityRequires,
        outputs: data.capabilityOutputs,
      },
      compatibility: {
        three: '>=0.160.0',
        renderers: ['webgl2'],
        material: data.material,
        environments: ['three', 'react-three-fiber'],
      },
      uniforms: data.uniforms.map((u) => ({
        name: u.name,
        type: u.type,
        defaultValue: parseDefault(u),
        description: u.description,
        ...(u.min ? { min: Number(u.min) } : {}),
        ...(u.max ? { max: Number(u.max) } : {}),
      })),
      inputs: data.inputs.map((i) => ({
        name: i.name,
        kind: i.kind,
        description: i.description,
        required: i.required,
      })),
      outputs: data.outputs.map((o) => ({
        name: o.name,
        kind: o.kind,
        description: o.description,
      })),
      files: {
        vertex: 'vertex.glsl',
        fragment: 'fragment.glsl',
        includes: [],
      },
      recipes: [
        {
          target: 'three',
          path: 'recipes/three.ts',
          exportName: `create${data.displayName.replace(/\s+/g, '')}Material`,
          summary: `Create a ShaderMaterial for ${data.displayName} in vanilla Three.js.`,
          placeholders: [],
          requirements: ['three-scene', 'mesh'],
        },
      ],
      preview: {
        path: 'preview.svg',
        format: 'svg',
        width: 512,
        height: 512,
        deterministic: true,
      },
      provenance: {
        sourceKind: data.sourceKind,
        sources: [],
        attribution: {
          summary: data.attributionSummary,
          ...(data.sourceKind !== 'original'
            ? { requiredNotice: data.attributionSummary }
            : {}),
        },
      },
    }
  }

  const handleCreatePR = async () => {
    const data = parsed()
    if (!data) return

    setPrLoading(true)
    setPrError('')
    setPrUrl('')

    try {
      const manifest = buildManifest(data)
      const exportName = `create${data.displayName.replace(/\s+/g, '')}Material`
      const recipes: Record<string, { code: string; fileName: string }> = {
        three: {
          fileName: 'recipes/three.ts',
          code: [
            `import { ShaderMaterial } from "three";`,
            ``,
            `// TODO: Configure uniforms and customize for your project`,
            `export function ${exportName}() {`,
            `  return new ShaderMaterial({`,
            `    vertexShader: "", // Load from vertex.glsl`,
            `    fragmentShader: "", // Load from fragment.glsl`,
            `    uniforms: {},`,
            `  });`,
            `}`,
          ].join('\n'),
        },
      }

      const previewSvg = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">',
        '  <rect width="512" height="512" fill="#1a1a2e"/>',
        `  <text x="256" y="256" text-anchor="middle" fill="#e0e0e0" font-size="24">${data.displayName}</text>`,
        '</svg>',
      ].join('\n')

      const result = await submitPR({
        data: {
          name: data.name,
          manifest,
          vertexSource: data.vertexShader,
          fragmentSource: data.fragmentShader,
          recipes,
          previewSvg,
        },
      })

      setPrUrl(result.prUrl)
    } catch (e) {
      setPrError(e instanceof Error ? e.message : 'Failed to create pull request')
    } finally {
      setPrLoading(false)
    }
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

      {/* Step 3: Review (read-only) */}
      <Show when={step() === 'review'}>
        <SurfaceCard class="mb-4 p-4">
          <div class="flex items-center justify-between">
            <div>
              <Kicker>Review AI Result</Kicker>
              <p class="text-sm text-text-secondary">
                AI has analyzed the shader. Review the extracted metadata below.
              </p>
            </div>
            <button
              type="button"
              class="rounded-full border border-surface-card-border bg-surface-secondary px-4 py-2 text-sm font-semibold text-text-secondary transition hover:text-text-primary"
              onClick={() => {
                setStep('input')
                setParsed(null)
                setPrUrl('')
                setPrError('')
              }}
            >
              Start over
            </button>
          </div>
        </SurfaceCard>

        <div class="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          {/* Left column: read-only metadata */}
          <div class="space-y-4">
            <SurfaceCard class="p-5">
              <Kicker>Identity</Kicker>
              <dl class="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div>
                  <dt class="font-medium text-text-muted">Name</dt>
                  <dd class="text-text-primary">{parsed()?.name}</dd>
                </div>
                <div>
                  <dt class="font-medium text-text-muted">Display name</dt>
                  <dd class="text-text-primary">{parsed()?.displayName}</dd>
                </div>
                <div class="sm:col-span-2">
                  <dt class="font-medium text-text-muted">Summary</dt>
                  <dd class="text-text-primary">{parsed()?.summary}</dd>
                </div>
                <div class="sm:col-span-2">
                  <dt class="font-medium text-text-muted">Description</dt>
                  <dd class="text-text-primary">{parsed()?.description}</dd>
                </div>
                <div>
                  <dt class="font-medium text-text-muted">Author</dt>
                  <dd class="text-text-primary">{parsed()?.authorName}</dd>
                </div>
                <div>
                  <dt class="font-medium text-text-muted">Category</dt>
                  <dd class="text-text-primary">{parsed()?.category}</dd>
                </div>
                <div class="sm:col-span-2">
                  <dt class="font-medium text-text-muted">Tags</dt>
                  <dd class="text-text-primary">{parsed()?.tagsText}</dd>
                </div>
              </dl>
            </SurfaceCard>

            <SurfaceCard class="p-5">
              <Kicker>Capability and compatibility</Kicker>
              <dl class="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div>
                  <dt class="font-medium text-text-muted">Pipeline</dt>
                  <dd class="text-text-primary">{parsed()?.pipeline}</dd>
                </div>
                <div>
                  <dt class="font-medium text-text-muted">Stage</dt>
                  <dd class="text-text-primary">{parsed()?.stage}</dd>
                </div>
                <div>
                  <dt class="font-medium text-text-muted">Material</dt>
                  <dd class="text-text-primary">{parsed()?.material}</dd>
                </div>
                <div>
                  <dt class="font-medium text-text-muted">Source kind</dt>
                  <dd class="text-text-primary">{parsed()?.sourceKind}</dd>
                </div>
                <div class="sm:col-span-2">
                  <dt class="font-medium text-text-muted">Requires</dt>
                  <dd class="flex flex-wrap gap-1.5">
                    <For each={parsed()?.capabilityRequires}>
                      {(cap) => (
                        <span class="inline-flex rounded-full border border-surface-card-border bg-surface-tertiary px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                          {cap}
                        </span>
                      )}
                    </For>
                  </dd>
                </div>
                <div class="sm:col-span-2">
                  <dt class="font-medium text-text-muted">Outputs</dt>
                  <dd class="flex flex-wrap gap-1.5">
                    <For each={parsed()?.capabilityOutputs}>
                      {(cap) => (
                        <span class="inline-flex rounded-full border border-surface-card-border bg-surface-tertiary px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                          {cap}
                        </span>
                      )}
                    </For>
                  </dd>
                </div>
              </dl>
            </SurfaceCard>

            <Show when={parsed()?.uniforms && parsed()!.uniforms.length > 0}>
              <SurfaceCard class="p-5">
                <Kicker>Uniforms</Kicker>
                <div class="mt-3 space-y-2">
                  <For each={parsed()?.uniforms}>
                    {(u) => (
                      <div class="rounded-xl border border-surface-card-border bg-surface-secondary px-3 py-2 text-sm">
                        <span class="font-mono font-medium text-accent">{u.name}</span>
                        <span class="ml-2 text-text-muted">({u.type})</span>
                        <span class="ml-2 text-text-secondary">{u.description}</span>
                        <Show when={u.defaultValue}>
                          <span class="ml-2 text-text-muted">default: {u.defaultValue}</span>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </SurfaceCard>
            </Show>

            <Show when={parsed()?.inputs && parsed()!.inputs.length > 0}>
              <SurfaceCard class="p-5">
                <Kicker>Inputs</Kicker>
                <div class="mt-3 space-y-2">
                  <For each={parsed()?.inputs}>
                    {(i) => (
                      <div class="rounded-xl border border-surface-card-border bg-surface-secondary px-3 py-2 text-sm">
                        <span class="font-mono font-medium text-accent">{i.name}</span>
                        <span class="ml-2 text-text-muted">({i.kind})</span>
                        <span class="ml-2 text-text-secondary">{i.description}</span>
                        <Show when={i.required}>
                          <span class="ml-2 text-xs font-semibold text-accent">required</span>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </SurfaceCard>
            </Show>

            <Show when={parsed()?.outputs && parsed()!.outputs.length > 0}>
              <SurfaceCard class="p-5">
                <Kicker>Outputs</Kicker>
                <div class="mt-3 space-y-2">
                  <For each={parsed()?.outputs}>
                    {(o) => (
                      <div class="rounded-xl border border-surface-card-border bg-surface-secondary px-3 py-2 text-sm">
                        <span class="font-mono font-medium text-accent">{o.name}</span>
                        <span class="ml-2 text-text-muted">({o.kind})</span>
                        <span class="ml-2 text-text-secondary">{o.description}</span>
                      </div>
                    )}
                  </For>
                </div>
              </SurfaceCard>
            </Show>

            <SurfaceCard class="p-5">
              <Kicker>Provenance</Kicker>
              <dl class="mt-3 grid gap-y-3 text-sm">
                <div>
                  <dt class="font-medium text-text-muted">Source kind</dt>
                  <dd class="text-text-primary">{parsed()?.sourceKind}</dd>
                </div>
                <div>
                  <dt class="font-medium text-text-muted">Attribution</dt>
                  <dd class="text-text-primary">{parsed()?.attributionSummary}</dd>
                </div>
              </dl>
            </SurfaceCard>

            <SurfaceCard class="p-5">
              <Kicker>Shader code</Kicker>
              <div class="mt-3 space-y-4">
                <div>
                  <h4 class="mb-1 text-xs font-semibold text-text-muted">Vertex shader</h4>
                  <pre class="max-h-48 overflow-auto rounded-xl bg-surface-primary p-3 font-mono text-xs leading-5 text-text-secondary">
                    {parsed()?.vertexShader}
                  </pre>
                </div>
                <div>
                  <h4 class="mb-1 text-xs font-semibold text-text-muted">Fragment shader</h4>
                  <pre class="max-h-64 overflow-auto rounded-xl bg-surface-primary p-3 font-mono text-xs leading-5 text-text-secondary">
                    {parsed()?.fragmentShader}
                  </pre>
                </div>
              </div>
            </SurfaceCard>

            {/* Create PR */}
            <div class="pt-2">
              <Show when={prUrl()}>
                <div class="mb-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
                  <p class="font-semibold text-text-primary">
                    Pull request created successfully!
                  </p>
                  <a
                    href={prUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="mt-1 inline-block text-accent underline hover:text-accent/80"
                  >
                    {prUrl()}
                  </a>
                </div>
              </Show>
              <Show when={prError()}>
                <p class="mb-3 rounded-xl border border-danger/30 bg-danger-dim/20 px-3 py-2 text-sm text-danger">
                  {prError()}
                </p>
              </Show>
              <Show when={!prUrl()}>
                <button
                  type="button"
                  class="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-surface-primary transition hover:bg-accent/80 disabled:opacity-50"
                  disabled={prLoading()}
                  onClick={() => void handleCreatePR()}
                >
                  {prLoading() ? 'Creating Pull Request...' : 'Create Pull Request'}
                </button>
              </Show>
              <Show when={prLoading()}>
                <div class="mt-2 flex items-center gap-2">
                  <div class="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  <p class="text-xs text-text-muted">
                    Creating branch and pull request on GitHub...
                  </p>
                </div>
              </Show>
            </div>
          </div>

          {/* Right column: live preview */}
          <div class="space-y-4">
            <SurfaceCard class="p-4">
              <h3 class="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent">
                Live Preview
              </h3>
              <ShaderPreviewCanvas
                vertexSource={parsed()?.vertexShader ?? ''}
                fragmentSource={parsed()?.fragmentShader ?? ''}
                uniforms={previewUniforms()}
                uniformOverrides={{}}
                pipeline={parsed()?.pipeline ?? 'surface'}
              />
            </SurfaceCard>
          </div>
        </div>
      </Show>
    </>
  )
}
