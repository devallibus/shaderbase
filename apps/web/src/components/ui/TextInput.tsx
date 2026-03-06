export default function TextInput(props: { value: string; onInput: (value: string) => void; placeholder?: string }) {
  return (
    <input
      class="w-full rounded-2xl border border-surface-input-border bg-surface-input px-4 py-3 text-sm text-text-primary shadow-sm outline-none transition placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/30"
      value={props.value}
      placeholder={props.placeholder}
      onInput={(event) => props.onInput(event.currentTarget.value)}
    />
  )
}
