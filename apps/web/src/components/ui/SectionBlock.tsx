import { Show, type JSX } from 'solid-js'

export default function SectionBlock(props: { children: JSX.Element; title?: string; action?: JSX.Element }) {
  return (
    <section class="mt-5">
      <Show when={props.title}>
        <div class="mb-3 flex items-center justify-between gap-3">
          <p class="m-0 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent">{props.title}</p>
          {props.action}
        </div>
      </Show>
      {props.children}
    </section>
  )
}
