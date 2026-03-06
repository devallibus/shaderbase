export default function Badge(props: { label: string; variant?: 'default' | 'accent' }) {
  const variant = () => props.variant ?? 'default'
  return (
    <span
      class={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-mono ${
        variant() === 'accent'
          ? 'border border-accent/30 bg-accent-glow text-accent'
          : 'border border-surface-card-border bg-surface-tertiary text-text-secondary'
      }`}
    >
      {props.label}
    </span>
  )
}
