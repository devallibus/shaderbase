import { For, Show } from 'solid-js'
import { createStore } from 'solid-js/store'
import type { ShaderDetailUniform } from '../lib/server/shader-detail'

type UniformControlsProps = {
  uniforms: ShaderDetailUniform[]
  onUniformChange: (name: string, value: number | number[] | boolean) => void
}

function isColorUniform(u: ShaderDetailUniform): boolean {
  return u.type === 'color' || (u.type === 'vec3' && /color/i.test(u.name + u.description))
}

function vec3ToHex(v: number[]): string {
  const r = Math.round(Math.max(0, Math.min(1, v[0])) * 255)
  const g = Math.round(Math.max(0, Math.min(1, v[1])) * 255)
  const b = Math.round(Math.max(0, Math.min(1, v[2])) * 255)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function hexToVec3(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return [r, g, b]
}

export default function UniformControls(props: UniformControlsProps) {
  const initValues: Record<string, number | number[] | boolean> = {}
  for (const u of props.uniforms) {
    if (u.type === 'sampler2D' || u.type === 'samplerCube') continue
    initValues[u.name] = u.defaultValue as number | number[] | boolean
  }
  const [values, setValues] = createStore(initValues)

  const update = (name: string, val: number | number[] | boolean) => {
    setValues(name, val)
    props.onUniformChange(name, val)
  }

  const interactive = () =>
    props.uniforms.filter((u) => u.type !== 'sampler2D' && u.type !== 'samplerCube')

  return (
    <div class="space-y-4">
      <h3 class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent">
        Uniforms
      </h3>
      <For each={interactive()}>
        {(u) => (
          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <label class="text-xs font-medium text-text-secondary">{u.name}</label>
              <span class="text-[0.6rem] text-text-muted">{u.type}</span>
            </div>
            <p class="text-[0.65rem] leading-relaxed text-text-muted">{u.description}</p>

            <Show when={isColorUniform(u)}>
              <input
                type="color"
                class="h-8 w-full cursor-pointer rounded-lg border border-surface-card-border bg-surface-primary"
                value={vec3ToHex(values[u.name] as number[])}
                onInput={(e) => update(u.name, hexToVec3(e.currentTarget.value))}
              />
            </Show>

            <Show when={!isColorUniform(u) && (u.type === 'float' || u.type === 'int')}>
              <div class="flex items-center gap-2">
                <input
                  type="range"
                  class="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-card accent-accent"
                  min={u.min ?? 0}
                  max={u.max ?? 1}
                  step={u.type === 'int' ? 1 : 0.01}
                  value={values[u.name] as number}
                  onInput={(e) => update(u.name, parseFloat(e.currentTarget.value))}
                />
                <span class="w-12 text-right font-mono text-xs text-text-muted">
                  {typeof values[u.name] === 'number' ? (values[u.name] as number).toFixed(2) : values[u.name]}
                </span>
              </div>
            </Show>

            <Show when={u.type === 'bool'}>
              <button
                type="button"
                class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  values[u.name]
                    ? 'border border-accent/30 bg-accent-glow text-accent'
                    : 'border border-surface-card-border text-text-muted'
                }`}
                onClick={() => update(u.name, !values[u.name])}
              >
                {values[u.name] ? 'true' : 'false'}
              </button>
            </Show>

            <Show when={!isColorUniform(u) && (u.type === 'vec2' || u.type === 'vec3' || u.type === 'vec4')}>
              <div class="grid gap-1.5" style={{ 'grid-template-columns': `repeat(${(values[u.name] as number[]).length}, 1fr)` }}>
                <For each={values[u.name] as number[]}>
                  {(component, i) => (
                    <div class="flex flex-col gap-0.5">
                      <span class="text-center text-[0.55rem] text-text-muted">
                        {['x', 'y', 'z', 'w'][i()]}
                      </span>
                      <input
                        type="range"
                        class="h-1.5 cursor-pointer appearance-none rounded-full bg-surface-card accent-accent"
                        min={u.min ?? 0}
                        max={u.max ?? 1}
                        step={0.01}
                        value={component}
                        onInput={(e) => {
                          const arr = [...(values[u.name] as number[])]
                          arr[i()] = parseFloat(e.currentTarget.value)
                          update(u.name, arr)
                        }}
                      />
                      <span class="text-center font-mono text-[0.55rem] text-text-muted">
                        {component.toFixed(2)}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        )}
      </For>

      <Show when={props.uniforms.some((u) => u.type === 'sampler2D' || u.type === 'samplerCube')}>
        <div class="border-t border-surface-card-border pt-3">
          <span class="text-[0.65rem] text-text-muted">Texture uniforms (not interactive):</span>
          <For each={props.uniforms.filter((u) => u.type === 'sampler2D' || u.type === 'samplerCube')}>
            {(u) => (
              <p class="text-xs text-text-muted">
                {u.name} <span class="text-[0.6rem]">({u.type})</span>
              </p>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
