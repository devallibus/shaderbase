import { createSignal } from 'solid-js'

type CodeBlockProps = {
  code: string
  language?: string
  class?: string
}

export default function CodeBlock(props: CodeBlockProps) {
  const [copied, setCopied] = createSignal(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(props.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div class={`relative rounded-2xl border border-surface-card-border bg-surface-primary ${props.class ?? ''}`}>
      <div class="flex items-center justify-between border-b border-surface-card-border px-4 py-2">
        {props.language && (
          <span class="text-[0.65rem] font-semibold uppercase tracking-widest text-text-muted">
            {props.language}
          </span>
        )}
        <button
          type="button"
          class="ml-auto rounded-lg px-2.5 py-1 text-xs font-medium text-text-muted transition hover:bg-surface-card hover:text-text-secondary"
          onClick={() => void handleCopy()}
        >
          {copied() ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre class="overflow-auto p-4 font-mono text-xs leading-6 text-accent/90">{props.code}</pre>
    </div>
  )
}
