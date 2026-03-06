import { Link } from '@tanstack/solid-router'
import { For, Show } from 'solid-js'
import type { ShaderEntry } from '../lib/server/shaders'
import Badge from './ui/Badge'

export default function ShaderCard(props: { shader: ShaderEntry }) {
  return (
    <Link
      to="/shaders/$name"
      params={{ name: props.shader.name }}
      class="block cursor-pointer rounded-xl border border-surface-card-border bg-surface-card p-4 transition hover:border-accent/30"
    >
      <div class="mb-1.5 flex items-start justify-between gap-2">
        <h3 class="text-sm font-semibold text-text-primary">{props.shader.displayName}</h3>
        <Badge label={props.shader.category} variant="accent" />
      </div>
      <p class="mb-3 text-xs leading-relaxed text-text-muted">{props.shader.summary}</p>
      <Show when={props.shader.tags.length > 0}>
        <div class="mb-2.5 flex flex-wrap gap-1">
          <For each={props.shader.tags}>
            {(tag) => <Badge label={tag} />}
          </For>
        </div>
      </Show>
      <div class="flex flex-wrap items-center gap-2 text-[0.65rem] text-text-muted">
        <span>{props.shader.pipeline} / {props.shader.stage}</span>
        <span>{props.shader.renderers.join(', ')}</span>
        <Show when={props.shader.reviewCount && props.shader.reviewCount > 0}>
          <span class="ml-auto flex items-center gap-0.5 text-accent">
            <span>&#9733;</span>
            <span>{props.shader.averageRating?.toFixed(1)}</span>
            <span class="text-text-muted">({props.shader.reviewCount})</span>
          </span>
        </Show>
      </div>
    </Link>
  )
}
