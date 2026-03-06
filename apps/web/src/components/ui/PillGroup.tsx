import { For } from 'solid-js'

export default function PillGroup(props: { class?: string; label: string; options: readonly string[]; selected: readonly string[]; onToggle: (value: string) => void }) {
  return (
    <div class={props.class}>
      <span class="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-text-secondary">{props.label}</span>
      <div class="flex flex-wrap gap-2">
        <For each={props.options}>
          {(option) => (
            <label class={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${props.selected.includes(option) ? 'border-accent/40 bg-accent-glow text-accent' : 'border-surface-card-border bg-surface-card text-text-secondary'}`}>
              <input checked={props.selected.includes(option)} type="checkbox" class="sr-only" onChange={() => props.onToggle(option)} />
              <span>{option}</span>
            </label>
          )}
        </For>
      </div>
    </div>
  )
}
