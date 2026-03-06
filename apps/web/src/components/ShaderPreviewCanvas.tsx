import { createEffect, onCleanup, onMount } from 'solid-js'
import {
  Clock,
  Color,
  DataTexture,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
} from 'three'
import type { ShaderDetailUniform } from '../lib/server/shader-detail'

type ShaderPreviewCanvasProps = {
  vertexSource: string
  fragmentSource: string
  uniforms: ShaderDetailUniform[]
  uniformOverrides: Record<string, number | number[] | boolean>
  pipeline: string
  fallbackSvg?: string | null
}

function buildUniformValue(u: ShaderDetailUniform) {
  switch (u.type) {
    case 'float':
    case 'int':
      return { value: u.defaultValue as number }
    case 'bool':
      return { value: u.defaultValue as boolean }
    case 'vec2':
      return { value: new Vector2(...(u.defaultValue as [number, number])) }
    case 'vec3':
      return { value: new Vector3(...(u.defaultValue as [number, number, number])) }
    case 'color':
      return { value: new Color(...(u.defaultValue as [number, number, number])) }
    case 'vec4':
      return { value: new Vector4(...(u.defaultValue as [number, number, number, number])) }
    case 'sampler2D': {
      const data = new Uint8Array(4 * 4 * 4)
      for (let i = 0; i < 16; i++) {
        const idx = i * 4
        const t = i / 15
        data[idx] = Math.round(t * 200 + 55)
        data[idx + 1] = Math.round((1 - t) * 150 + 100)
        data[idx + 2] = Math.round(180)
        data[idx + 3] = 255
      }
      return { value: new DataTexture(data, 4, 4, RGBAFormat, UnsignedByteType) }
    }
    default:
      return { value: u.defaultValue }
  }
}

function applyOverride(
  material: ShaderMaterial,
  name: string,
  value: number | number[] | boolean,
  type: string,
) {
  const uniform = material.uniforms[name]
  if (!uniform) return

  if (type === 'vec2' && Array.isArray(value)) {
    ;(uniform.value as Vector2).set(value[0], value[1])
  } else if ((type === 'vec3' || type === 'color') && Array.isArray(value)) {
    if (uniform.value instanceof Color) {
      ;(uniform.value as Color).setRGB(value[0], value[1], value[2])
    } else {
      ;(uniform.value as Vector3).set(value[0], value[1], value[2])
    }
  } else if (type === 'vec4' && Array.isArray(value)) {
    ;(uniform.value as Vector4).set(value[0], value[1], value[2], value[3])
  } else {
    uniform.value = value
  }
}

export default function ShaderPreviewCanvas(props: ShaderPreviewCanvasProps) {
  let containerRef!: HTMLDivElement
  let renderer: WebGLRenderer | null = null
  let animationId = 0
  let material: ShaderMaterial | null = null
  let compileError = ''

  onMount(() => {
    const width = containerRef.clientWidth
    const height = containerRef.clientHeight || 400

    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      compileError = 'WebGL not available'
      return
    }

    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    containerRef.appendChild(renderer.domElement)
    renderer.domElement.style.borderRadius = '1rem'

    const scene = new Scene()
    const clock = new Clock()

    const isPostProcess = props.pipeline === 'postprocessing'
    const isGeometry = props.pipeline === 'geometry'

    const camera = isPostProcess
      ? new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
      : new PerspectiveCamera(45, width / height, 0.1, 100)

    if (isPostProcess) {
      camera.position.z = 1
    } else {
      camera.position.z = 3
    }

    const uniforms: Record<string, { value: unknown }> = {}
    for (const u of props.uniforms) {
      uniforms[u.name] = buildUniformValue(u)
    }

    try {
      material = new ShaderMaterial({
        vertexShader: props.vertexSource,
        fragmentShader: props.fragmentSource,
        uniforms,
      })
    } catch (e) {
      compileError = e instanceof Error ? e.message : 'Shader compilation failed'
      return
    }

    let geometry
    if (isPostProcess) {
      geometry = new PlaneGeometry(2, 2)
    } else if (isGeometry) {
      geometry = new SphereGeometry(1, 64, 64)
    } else {
      geometry = new PlaneGeometry(2, 2, 1, 1)
    }

    const mesh = new Mesh(geometry, material)
    scene.add(mesh)

    const animate = () => {
      animationId = requestAnimationFrame(animate)
      const elapsed = clock.getElapsedTime()

      if (material?.uniforms.uTime) {
        material.uniforms.uTime.value = elapsed
      }

      if (!isPostProcess && !isGeometry) {
        // gentle float for surface shaders
      } else if (isGeometry) {
        mesh.rotation.y = elapsed * 0.3
        mesh.rotation.x = elapsed * 0.15
      }

      renderer!.render(scene, camera)
    }

    // Check for compile errors after first render
    renderer.render(scene, camera)
    const gl = renderer.getContext()
    const program = renderer.info.programs?.[0]
    if (program) {
      const glProgram = gl.getParameter(gl.CURRENT_PROGRAM)
      if (glProgram && !gl.getProgramParameter(glProgram, gl.LINK_STATUS)) {
        compileError = gl.getProgramInfoLog(glProgram) ?? 'Shader link failed'
        showFallback()
        return
      }
    }

    animate()

    const handleResize = () => {
      const w = containerRef.clientWidth
      const h = containerRef.clientHeight || 400
      renderer!.setSize(w, h)
      if (camera instanceof PerspectiveCamera) {
        camera.aspect = w / h
        camera.updateProjectionMatrix()
      }
    }

    window.addEventListener('resize', handleResize)
    onCleanup(() => {
      window.removeEventListener('resize', handleResize)
    })
  })

  const showFallback = () => {
    if (renderer) {
      renderer.domElement.remove()
      renderer.dispose()
      renderer = null
    }
  }

  createEffect(() => {
    const overrides = props.uniformOverrides
    if (!material) return

    for (const [name, value] of Object.entries(overrides)) {
      const uniformDef = props.uniforms.find((u) => u.name === name)
      if (uniformDef) {
        applyOverride(material, name, value, uniformDef.type)
      }
    }
  })

  onCleanup(() => {
    if (animationId) cancelAnimationFrame(animationId)
    if (renderer) {
      renderer.dispose()
      renderer = null
    }
  })

  return (
    <div
      ref={containerRef}
      class="relative aspect-square w-full overflow-hidden rounded-2xl border border-surface-card-border bg-surface-primary"
    >
      {compileError && (
        <div class="absolute inset-0 flex flex-col items-center justify-center p-4">
          {props.fallbackSvg ? (
            <div class="h-full w-full" innerHTML={props.fallbackSvg} />
          ) : (
            <div class="text-center">
              <p class="text-sm font-medium text-danger">Preview unavailable</p>
              <p class="mt-1 text-xs text-text-muted">{compileError}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
