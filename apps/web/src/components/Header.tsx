import { Link } from '@tanstack/solid-router'

export default function Header() {
  return (
    <header class="sticky top-0 z-50 border-b border-surface-card-border/60 bg-surface-primary/85 px-4 backdrop-blur-xl">
      <nav class="mx-auto flex w-full max-w-7xl items-center py-3.5">
        <Link
          to="/"
          class="flex items-center gap-2 font-mono text-sm font-semibold tracking-tight text-accent no-underline transition hover:text-accent/70"
        >
          <img src="/favicon.svg" alt="" width="20" height="20" class="rounded" />
          shaderbase
        </Link>

        <div class="ml-auto flex items-center gap-6 text-[0.8rem]">
          <Link
            to="/shaders"
            class="text-text-muted no-underline transition hover:text-text-primary"
            activeProps={{ class: 'text-text-primary' }}
          >
            shaders
          </Link>
          <Link
            to="/playground"
            class="text-text-muted no-underline transition hover:text-text-primary"
            activeProps={{ class: 'text-text-primary' }}
          >
            playground
          </Link>
          <Link
            to="/about"
            class="text-text-muted no-underline transition hover:text-text-primary"
            activeProps={{ class: 'text-text-primary' }}
          >
            about
          </Link>
        </div>
      </nav>
    </header>
  )
}
