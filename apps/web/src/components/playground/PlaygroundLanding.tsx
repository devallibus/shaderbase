import CodeBlock from '../CodeBlock'
import Badge from '../ui/Badge'
import SurfaceCard from '../ui/SurfaceCard'

type PlaygroundLandingProps = {
  creatingSession: boolean
  error?: string
  onStartManualSession: () => void | Promise<void>
}

const MCP_CONFIG_SNIPPET = `{
  "mcpServers": {
    "shaderbase": {
      "url": "https://mcp.shaderbase.com/mcp"
    }
  }
}`

const CREATE_PLAYGROUND_SNIPPET = `create_playground({
  language: "tsl",
  pipeline: "surface"
})`

export default function PlaygroundLanding(props: PlaygroundLandingProps) {
  return (
    <main class="relative overflow-hidden">
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(5,150,105,0.14),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(15,23,41,0.08),transparent_34%)]" />

      <div class="mx-auto flex min-h-[calc(100dvh-56px)] w-full max-w-6xl items-center px-4 py-10 sm:py-14">
        <SurfaceCard class="relative w-full overflow-hidden rounded-[2rem] border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-40px_rgba(15,23,41,0.35)] backdrop-blur-xl sm:p-8 lg:p-10">
          <div class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />

          <div class="grid gap-10 lg:grid-cols-[1.15fr_0.9fr] lg:gap-12">
            <div>
              <div class="mb-5 flex flex-wrap gap-2">
                <Badge label="agent-first" variant="accent" />
                <Badge label="mcp session" />
                <Badge label="manual fallback" />
              </div>

              <h1 class="max-w-xl text-4xl font-semibold tracking-tight text-text-primary sm:text-5xl">
                The playground is built for agents to drive live shader iteration.
              </h1>

              <p class="mt-4 max-w-2xl text-base leading-7 text-text-secondary">
                Connect an AI client to ShaderBase&apos;s MCP server, call
                {' '}
                <code class="rounded bg-surface-secondary px-1.5 py-0.5 font-mono text-[0.9em] text-text-primary">
                  create_playground
                </code>
                , then keep iterating with live previews, screenshots, and structured error feedback.
              </p>

              <div class="mt-8 space-y-3">
                <div class="flex gap-4 rounded-2xl border border-surface-card-border/80 bg-surface-primary/70 px-4 py-4">
                  <span class="font-mono text-xs font-semibold tracking-[0.18em] text-accent">01</span>
                  <p class="text-sm leading-6 text-text-secondary">
                    Point your MCP client at
                    {' '}
                    <code class="font-mono text-text-primary">https://mcp.shaderbase.com/mcp</code>
                    {' '}
                    so it can access the remote ShaderBase tools.
                  </p>
                </div>

                <div class="flex gap-4 rounded-2xl border border-surface-card-border/80 bg-surface-primary/70 px-4 py-4">
                  <span class="font-mono text-xs font-semibold tracking-[0.18em] text-accent">02</span>
                  <p class="text-sm leading-6 text-text-secondary">
                    Start a session with
                    {' '}
                    <code class="font-mono text-text-primary">create_playground</code>
                    {' '}
                    and open the returned
                    {' '}
                    <code class="font-mono text-text-primary">/playground?session=...</code>
                    {' '}
                    URL in a browser tab.
                  </p>
                </div>

                <div class="flex gap-4 rounded-2xl border border-surface-card-border/80 bg-surface-primary/70 px-4 py-4">
                  <span class="font-mono text-xs font-semibold tracking-[0.18em] text-accent">03</span>
                  <p class="text-sm leading-6 text-text-secondary">
                    Iterate from your agent with
                    {' '}
                    <code class="font-mono text-text-primary">update_shader</code>
                    ,
                    {' '}
                    <code class="font-mono text-text-primary">get_preview</code>
                    , and
                    {' '}
                    <code class="font-mono text-text-primary">get_errors</code>
                    .
                  </p>
                </div>
              </div>

              <div class="mt-8 grid gap-4 sm:grid-cols-2">
                <div class="rounded-2xl border border-surface-card-border/80 bg-surface-primary/70 p-4">
                  <p class="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-text-muted">
                    MCP endpoint
                  </p>
                  <a
                    href="https://mcp.shaderbase.com/mcp"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="mt-2 block break-all font-mono text-sm text-accent transition hover:text-accent/75"
                  >
                    https://mcp.shaderbase.com/mcp
                  </a>
                </div>

                <div class="rounded-2xl border border-surface-card-border/80 bg-surface-primary/70 p-4">
                  <p class="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-text-muted">
                    Playground tools
                  </p>
                  <p class="mt-2 text-sm leading-6 text-text-secondary">
                    <code class="font-mono text-text-primary">create_playground</code>
                    ,{' '}
                    <code class="font-mono text-text-primary">update_shader</code>
                    ,{' '}
                    <code class="font-mono text-text-primary">get_preview</code>
                    ,{' '}
                    <code class="font-mono text-text-primary">get_errors</code>
                  </p>
                </div>
              </div>

              <div class="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="https://mcp.shaderbase.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-[1px] hover:bg-accent/90 active:translate-y-0 active:scale-[0.98]"
                >
                  Open MCP server
                </a>

                <button
                  type="button"
                  onClick={() => void props.onStartManualSession()}
                  disabled={props.creatingSession}
                  class="inline-flex items-center justify-center rounded-xl border border-surface-card-border bg-surface-card px-4 py-3 text-sm font-semibold text-text-primary transition hover:-translate-y-[1px] hover:border-accent/30 hover:text-accent disabled:cursor-wait disabled:opacity-70 active:translate-y-0 active:scale-[0.98]"
                >
                  {props.creatingSession ? 'Starting manual session...' : 'Start manual session'}
                </button>
              </div>

              <p class="mt-3 text-sm text-text-muted">
                Manual sessions are useful for quick experiments, but they are not the primary MCP workflow.
              </p>

              {props.error ? (
                <div class="mt-4 rounded-2xl border border-danger/20 bg-danger-dim/35 px-4 py-3 text-sm text-danger">
                  {props.error}
                </div>
              ) : null}
            </div>

            <div class="space-y-4">
              <div class="rounded-[1.5rem] border border-surface-card-border/80 bg-surface-primary/80 p-4">
                <p class="mb-3 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-text-muted">
                  Connect your client
                </p>
                <CodeBlock code={MCP_CONFIG_SNIPPET} language="Claude config" />
              </div>

              <div class="rounded-[1.5rem] border border-surface-card-border/80 bg-surface-primary/80 p-4">
                <p class="mb-3 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-text-muted">
                  Start a playground
                </p>
                <CodeBlock code={CREATE_PLAYGROUND_SNIPPET} language="Tool call" />
              </div>
            </div>
          </div>
        </SurfaceCard>
      </div>
    </main>
  )
}
