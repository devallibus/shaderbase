import { Link, createFileRoute } from '@tanstack/solid-router'
import { useServerFn } from '@tanstack/solid-start'
import { For, Show, createSignal, onMount } from 'solid-js'
import { getShaderDetail, type ShaderDetail } from '../lib/server/shader-detail'
import { getReviews } from './api/-reviews'
import type { Review, ReviewStats } from '../lib/server/reviews-db'
import ShaderPreviewCanvas from '../components/ShaderPreviewCanvas'
import TslPreviewCanvas from '../components/TslPreviewCanvas'
import UniformControls from '../components/UniformControls'
import CodeBlock from '../components/CodeBlock'
import ReviewsSection from '../components/ReviewsSection'
import SurfaceCard from '../components/ui/SurfaceCard'
import Badge from '../components/ui/Badge'

export const Route = createFileRoute('/shaders/$name')({
  component: ShaderDetailPage,
})

function ShaderDetailPage() {
  const params = Route.useParams()
  const fetchDetail = useServerFn(getShaderDetail)
  const [shader, setShader] = createSignal<ShaderDetail | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal('')
  const [uniformOverrides, setUniformOverrides] = createSignal<
    Record<string, number | number[] | boolean>
  >({})
  const fetchReviews = useServerFn(getReviews)
  const [reviewData, setReviewData] = createSignal<{ reviews: Review[]; stats: ReviewStats }>({
    reviews: [],
    stats: { average: 0, count: 0 },
  })

  onMount(async () => {
    try {
      const [detail, reviews] = await Promise.all([
        fetchDetail({ data: { name: params().name } }),
        fetchReviews({ data: { shaderName: params().name } }),
      ])
      setShader(detail)
      setReviewData(reviews)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load shader')
    } finally {
      setLoading(false)
    }
  })

  const handleUniformChange = (name: string, value: number | number[] | boolean) => {
    setUniformOverrides((prev) => ({ ...prev, [name]: value }))
  }

  return (
    <main class="mx-auto w-full max-w-5xl px-4 pb-16 pt-8">
      <Link
        to="/shaders"
        class="mb-6 inline-flex items-center gap-1.5 text-sm text-text-muted transition hover:text-accent"
      >
        &larr; Back to shaders
      </Link>

      <Show when={loading()}>
        <p class="text-sm text-text-muted">Loading shader...</p>
      </Show>

      <Show when={error()}>
        <SurfaceCard>
          <p class="text-sm text-danger">{error()}</p>
        </SurfaceCard>
      </Show>

      <Show when={shader()}>
        {(s) => (
          <>
            {/* Hero */}
            <SurfaceCard class="mb-6 rounded-[2rem] px-6 py-8 sm:px-10 sm:py-10">
              <div class="mb-3 flex flex-wrap items-center gap-2">
                <Badge label={s().category} variant="accent" />
                <Badge label={`${s().pipeline} / ${s().stage}`} />
              </div>
              <h1 class="mb-2 text-3xl font-black tracking-tight text-text-primary sm:text-5xl">
                {s().displayName}
              </h1>
              <p class="mb-4 text-base leading-relaxed text-text-secondary">{s().summary}</p>
              <div class="flex flex-wrap gap-1.5">
                <For each={s().tags}>{(tag) => <Badge label={tag} />}</For>
              </div>
              <div class="mt-4 flex flex-wrap gap-3 text-xs text-text-muted">
                <span>v{s().version}</span>
                <span>{s().license}</span>
                <span>by {s().author.name}</span>
              </div>
            </SurfaceCard>

            {/* Preview + Controls */}
            <div class="mb-6 grid gap-4 lg:grid-cols-[1fr_320px]">
              {s().language === 'tsl' ? (
                <TslPreviewCanvas
                  previewModule={s().previewModule}
                  pipeline={s().pipeline}
                  fallbackSvg={s().previewSvg}
                />
              ) : (
                <ShaderPreviewCanvas
                  vertexSource={s().language === 'glsl' ? s().vertexSource : ''}
                  fragmentSource={s().language === 'glsl' ? s().fragmentSource : ''}
                  uniforms={s().uniforms}
                  uniformOverrides={uniformOverrides()}
                  pipeline={s().pipeline}
                  fallbackSvg={s().previewSvg}
                />
              )}
              <SurfaceCard class="max-h-[500px] overflow-y-auto p-5">
                <UniformControls
                  uniforms={s().uniforms}
                  onUniformChange={handleUniformChange}
                />
              </SurfaceCard>
            </div>

            {/* Description */}
            <SurfaceCard class="mb-6 p-6">
              <h2 class="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent">
                Description
              </h2>
              <p class="text-sm leading-7 text-text-secondary">{s().description}</p>
            </SurfaceCard>

            {/* Compatibility */}
            <SurfaceCard class="mb-6 p-6">
              <h2 class="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent">
                Compatibility
              </h2>
              <div class="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <span class="text-xs text-text-muted">Three.js</span>
                  <p class="font-mono text-text-secondary">{s().threeRange}</p>
                </div>
                <div>
                  <span class="text-xs text-text-muted">Material</span>
                  <p class="text-text-secondary">{s().material}</p>
                </div>
                <div>
                  <span class="text-xs text-text-muted">Renderers</span>
                  <div class="flex gap-1.5">
                    <For each={s().renderers}>{(r) => <Badge label={r} />}</For>
                  </div>
                </div>
                <div>
                  <span class="text-xs text-text-muted">Environments</span>
                  <div class="flex gap-1.5">
                    <For each={s().environments}>{(e) => <Badge label={e} />}</For>
                  </div>
                </div>
              </div>
              <Show when={s().requires.length > 0}>
                <div class="mt-3">
                  <span class="text-xs text-text-muted">Requires</span>
                  <div class="flex flex-wrap gap-1.5">
                    <For each={s().requires}>{(r) => <Badge label={r} />}</For>
                  </div>
                </div>
              </Show>
            </SurfaceCard>

            {/* Inputs & Outputs */}
            <Show when={s().inputs.length > 0 || s().outputs.length > 0}>
              <div class="mb-6 grid gap-4 sm:grid-cols-2">
                <Show when={s().inputs.length > 0}>
                  <SurfaceCard class="p-6">
                    <h2 class="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent">
                      Inputs
                    </h2>
                    <For each={s().inputs}>
                      {(input) => (
                        <div class="mb-2 last:mb-0">
                          <div class="flex items-center gap-2">
                            <span class="font-mono text-xs text-text-primary">{input.name}</span>
                            <Badge label={input.kind} />
                            <Show when={input.required}>
                              <span class="text-[0.6rem] text-accent">required</span>
                            </Show>
                          </div>
                          <p class="text-xs text-text-muted">{input.description}</p>
                        </div>
                      )}
                    </For>
                  </SurfaceCard>
                </Show>
                <Show when={s().outputs.length > 0}>
                  <SurfaceCard class="p-6">
                    <h2 class="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent">
                      Outputs
                    </h2>
                    <For each={s().outputs}>
                      {(output) => (
                        <div class="mb-2 last:mb-0">
                          <div class="flex items-center gap-2">
                            <span class="font-mono text-xs text-text-primary">{output.name}</span>
                            <Badge label={output.kind} />
                          </div>
                          <p class="text-xs text-text-muted">{output.description}</p>
                        </div>
                      )}
                    </For>
                  </SurfaceCard>
                </Show>
              </div>
            </Show>

            {/* Recipes */}
            <Show when={s().recipes.length > 0}>
              <div class="mb-6 space-y-4">
                <h2 class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent">
                  Integration Recipes
                </h2>
                <For each={s().recipes}>
                  {(recipe) => (
                    <SurfaceCard class="p-6">
                      <div class="mb-3 flex items-center gap-2">
                        <Badge
                          label={recipe.target === 'r3f' ? 'React Three Fiber' : 'Three.js'}
                          variant="accent"
                        />
                        <span class="font-mono text-xs text-text-muted">{recipe.exportName}</span>
                      </div>
                      <p class="mb-3 text-sm text-text-secondary">{recipe.summary}</p>
                      <Show when={recipe.requirements.length > 0}>
                        <div class="mb-3 flex flex-wrap gap-1.5">
                          <For each={recipe.requirements}>
                            {(req) => <Badge label={req} />}
                          </For>
                        </div>
                      </Show>
                      <CodeBlock
                        code={recipe.code}
                        language={recipe.target === 'r3f' ? 'TSX' : 'TypeScript'}
                      />
                    </SurfaceCard>
                  )}
                </For>
              </div>
            </Show>

            {/* Source Code */}
            <div class="mb-6 space-y-4">
              <h2 class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent">
                Shader Source
              </h2>
              {s().language === 'tsl' ? (
                <CodeBlock code={s().tslSource} language="TSL (source.ts)" />
              ) : (
                <>
                  <CodeBlock code={s().vertexSource} language="GLSL (vertex)" />
                  <CodeBlock code={s().fragmentSource} language="GLSL (fragment)" />
                </>
              )}
            </div>

            {/* Provenance */}
            <SurfaceCard class="mb-6 p-6">
              <h2 class="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent">
                Provenance
              </h2>
              <div class="space-y-2 text-sm">
                <div class="flex items-center gap-2">
                  <span class="text-xs text-text-muted">Source kind</span>
                  <Badge label={s().provenance.sourceKind} variant="accent" />
                </div>
                <p class="text-text-secondary">{s().provenance.attribution.summary}</p>
                <Show when={s().provenance.attribution.requiredNotice}>
                  <div class="rounded-xl border border-accent/20 bg-accent-glow/30 p-3 text-xs text-text-secondary">
                    {s().provenance.attribution.requiredNotice}
                  </div>
                </Show>
                <Show when={s().provenance.notes}>
                  <p class="text-xs text-text-muted">{s().provenance.notes}</p>
                </Show>
                <Show when={s().provenance.sources.length > 0}>
                  <div class="mt-3 space-y-3">
                    <For each={s().provenance.sources}>
                      {(source) => (
                        <div class="rounded-xl border border-surface-card-border p-3">
                          <div class="flex items-center gap-2">
                            <span class="font-medium text-text-primary">{source.name}</span>
                            <Badge label={source.kind} />
                          </div>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="mt-1 block text-xs text-accent hover:underline"
                          >
                            {source.url}
                          </a>
                          <div class="mt-1 flex flex-wrap gap-2 text-xs text-text-muted">
                            <span>{source.license}</span>
                            <span>{source.authors.join(', ')}</span>
                            <Show when={source.revision}>
                              <span class="font-mono">{source.revision}</span>
                            </Show>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </SurfaceCard>

            {/* Reviews */}
            <SurfaceCard class="p-6">
              <ReviewsSection
                shaderName={s().name}
                initialReviews={reviewData().reviews}
                initialStats={reviewData().stats}
              />
            </SurfaceCard>
          </>
        )}
      </Show>
    </main>
  )
}
