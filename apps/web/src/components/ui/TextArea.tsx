export default function TextArea(props: { value: string; onInput: (value: string) => void; rows: number; monospace?: boolean }) {
  return (
    <textarea
      class={`w-full resize-y rounded-2xl border border-surface-input-border bg-surface-input px-4 py-3 text-sm text-text-primary shadow-sm outline-none transition placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/30 ${props.monospace ? 'font-mono text-xs' : ''}`}
      rows={props.rows}
      value={props.value}
      onInput={(event) => props.onInput(event.currentTarget.value)}
    />
  )
}
