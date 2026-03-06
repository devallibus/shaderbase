import { For, Show } from 'solid-js'

type LibraryEntry = {
  category: string
  displayName: string
  name: string
  sourceKind: string
  summary: string
}

export default function LibraryList(props: { entries: LibraryEntry[]; emptyMessage: string; title: string; valueKey: 'category' | 'sourceKind' }) {
  return (
    <section>
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent">{props.title}</h3>
        <span class="inline-flex items-center rounded-full border border-surface-card-border bg-surface-tertiary px-3 py-1 text-xs font-semibold text-text-secondary">{props.entries.length}</span>
      </div>
      <Show when={props.entries.length > 0} fallback={<p class="rounded-2xl border border-dashed border-surface-card-border bg-surface-card/40 px-4 py-5 text-sm text-text-muted">{props.emptyMessage}</p>}>
        <div class="space-y-3">
          <For each={props.entries}>
            {(entry) => (
              <div class="rounded-2xl border border-surface-card-border bg-surface-card p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h4 class="m-0 text-base font-semibold text-text-primary">{entry.displayName}</h4>
                    <p class="mt-1 mb-0 text-sm text-text-secondary">{entry.summary}</p>
                  </div>
                  <span class="inline-flex items-center rounded-full border border-surface-card-border bg-surface-tertiary px-3 py-1 text-xs font-semibold text-text-secondary">{entry[props.valueKey]}</span>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </section>
  )
}
