import type { JSX } from 'solid-js'

export default function Kicker(props: { children: JSX.Element }) {
  return <p class="mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent">{props.children}</p>
}
