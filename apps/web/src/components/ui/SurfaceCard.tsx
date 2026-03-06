import type { JSX } from 'solid-js'

export default function SurfaceCard(props: { children: JSX.Element; class?: string }) {
  return (
    <section class={`rounded-2xl border border-surface-card-border bg-surface-card p-5 shadow-lg shadow-black/20 ${props.class ?? ''}`}>
      {props.children}
    </section>
  )
}
