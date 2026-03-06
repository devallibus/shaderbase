import type { JSX } from 'solid-js'

export default function Field(props: { children: JSX.Element; class?: string; label: string }) {
  return (
    <label class={props.class}>
      <span class="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-text-secondary">{props.label}</span>
      {props.children}
    </label>
  )
}
