import { For } from 'solid-js'

export default function SelectInput(props: { value: string; onInput: (value: string) => void; options: readonly string[] }) {
  return (
    <select
      class="w-full rounded-2xl border border-surface-input-border bg-surface-input px-4 py-3 text-sm text-text-primary shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
      value={props.value}
      onInput={(event) => props.onInput(event.currentTarget.value)}
    >
      <For each={props.options}>{(option) => <option value={option}>{option}</option>}</For>
    </select>
  )
}
