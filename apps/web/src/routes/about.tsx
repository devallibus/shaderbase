import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main class="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 class="mb-2 font-mono text-2xl font-bold tracking-tight text-text-primary">
        About
      </h1>
      <p class="mb-10 text-sm text-text-muted">
        Everything you need to know.
      </p>

      <div class="space-y-5 text-[0.9rem] leading-relaxed text-text-secondary">
        <p>
          ShaderBase is a shader registry where git is the database.
          Every shader ships with a validated manifest, provenance metadata,
          and copy-paste integration recipes for Three.js and React Three Fiber.
        </p>

        <p>
          Agents can search, inspect compatibility, and retrieve recipes
          directly from the repo. No hosted API, no runtime dependency.
          If it's not in the manifest, it doesn't exist.
        </p>

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-xl border border-surface-card-border bg-surface-card p-4">
            <h2 class="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Submission workflow</h2>
            <p class="text-sm text-text-secondary">
              Drafts land in <code class="rounded bg-surface-tertiary px-1 py-0.5 text-xs text-accent">submissions/</code> first.
              The canonical library only changes through reviewed PRs.
            </p>
          </div>

          <div class="rounded-xl border border-surface-card-border bg-surface-card p-4">
            <h2 class="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Provenance built in</h2>
            <p class="text-sm text-text-secondary">
              Adapted shaders carry upstream links, revision markers, author
              names, and license notices. Attribution ships with the shader.
            </p>
          </div>

          <div class="rounded-xl border border-surface-card-border bg-surface-card p-4">
            <h2 class="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Recipes included</h2>
            <p class="text-sm text-text-secondary">
              Every shader includes ready-to-use code for vanilla Three.js
              and React Three Fiber. Copy, paste, render.
            </p>
          </div>

          <div class="rounded-xl border border-surface-card-border bg-surface-card p-4">
            <h2 class="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Schema-validated</h2>
            <p class="text-sm text-text-secondary">
              Manifests are validated with Zod on every commit.
              CI rejects shaders with missing files or broken metadata.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
