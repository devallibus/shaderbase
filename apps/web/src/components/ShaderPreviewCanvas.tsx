import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import type { ShaderDetailUniform } from '../lib/server/shader-detail'

type ShaderPreviewCanvasProps = {
  vertexSource: string
  fragmentSource: string
  uniforms: ShaderDetailUniform[]
  uniformOverrides: Record<string, number | number[] | boolean>
  pipeline: string
  fallbackSvg?: string | null
}

type THREE = typeof import('three')

async function loadThree(): Promise<THREE> {
  return import('three')
}

function buildUniformValue(THREE: THREE, u: ShaderDetailUniform) {
  switch (u.type) {
    case 'float':
    case 'int':
      return { value: u.defaultValue as number }
    case 'bool':
      return { value: u.defaultValue as boolean }
    case 'vec2':
      return { value: new THREE.Vector2(...(u.defaultValue as [number, number])) }
    case 'vec3':
      return { value: new THREE.Vector3(...(u.defaultValue as [number, number, number])) }
    case 'color':
      return { value: new THREE.Color(...(u.defaultValue as [number, number, number])) }
    case 'vec4':
      return { value: new THREE.Vector4(...(u.defaultValue as [number, number, number, number])) }
    case 'sampler2D': {
      const data = new Uint8Array(4 * 4 * 4)
      for (let i = 0; i < 16; i++) {
        const idx = i * 4
        const t = i / 15
        data[idx] = Math.round(t * 200 + 55)
        data[idx + 1] = Math.round((1 - t) * 150 + 100)
        data[idx + 2] = 180
        data[idx + 3] = 255
      }
      const tex = new THREE.DataTexture(data, 4, 4, THREE.RGBAFormat, THREE.UnsignedByteType)
      tex.needsUpdate = true
      return { value: tex }
    }
    default:
      return { value: u.defaultValue }
  }
}

function applyOverride(
  THREE: THREE,
  material: InstanceType<THREE['ShaderMaterial']>,
  name: string,
  value: number | number[] | boolean,
  type: string,
) {
  const uniform = material.uniforms[name]
  if (!uniform) return

  if (type === 'vec2' && Array.isArray(value)) {
    ;(uniform.value as InstanceType<THREE['Vector2']>).set(value[0], value[1])
  } else if ((type === 'vec3' || type === 'color') && Array.isArray(value)) {
    if (uniform.value instanceof THREE.Color) {
      ;(uniform.value as InstanceType<THREE['Color']>).setRGB(value[0], value[1], value[2])
    } else {
      ;(uniform.value as InstanceType<THREE['Vector3']>).set(value[0], value[1], value[2])
    }
  } else if (type === 'vec4' && Array.isArray(value)) {
    ;(uniform.value as InstanceType<THREE['Vector4']>).set(value[0], value[1], value[2], value[3])
  } else {
    uniform.value = value
  }
}

export default function ShaderPreviewCanvas(props: ShaderPreviewCanvasProps) {
  let containerRef!: HTMLDivElement
  let renderer: InstanceType<THREE['WebGLRenderer']> | null = null
  let material: InstanceType<THREE['ShaderMaterial']> | null = null
  let geometry: InstanceType<THREE['BufferGeometry']> | null = null
  let animationId = 0
  let isVisible = true
  let threeModule: THREE | null = null

  const [error, setError] = createSignal('')
  const [loading, setLoading] = createSignal(true)

  onMount(async () => {
    // Dynamic import — Three.js only loads when this component mounts
    let THREE: THREE
    try {
      THREE = await loadThree()
      threeModule = THREE
    } catch {
      setError('Failed to load 3D engine')
      setLoading(false)
      return
    }

    const width = containerRef.clientWidth
    const height = containerRef.clientHeight || 400

    // Create renderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      })
    } catch {
      setError('WebGL not available')
      setLoading(false)
      return
    }

    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    containerRef.appendChild(renderer.domElement)
    renderer.domElement.style.borderRadius = '1rem'
    renderer.domElement.style.display = 'block'

    const scene = new THREE.Scene()
    const clock = new THREE.Clock()

    const isPostProcess = props.pipeline === 'postprocessing'
    const isGeometry = props.pipeline === 'geometry'

    const camera = isPostProcess
      ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
      : new THREE.PerspectiveCamera(45, width / height, 0.1, 100)

    camera.position.z = isPostProcess ? 1 : 3

    // Build uniforms
    const uniforms: Record<string, { value: unknown }> = {}
    for (const u of props.uniforms) {
      uniforms[u.name] = buildUniformValue(THREE, u)
    }

    // Compile shader
    try {
      material = new THREE.ShaderMaterial({
        vertexShader: props.vertexSource,
        fragmentShader: props.fragmentSource,
        uniforms,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Shader compilation failed')
      setLoading(false)
      return
    }

    // Geometry — use minimal segments for preview
    if (isPostProcess) {
      geometry = new THREE.PlaneGeometry(2, 2)
    } else if (isGeometry) {
      geometry = new THREE.SphereGeometry(1, 32, 32) // 32 is plenty for preview
    } else {
      geometry = new THREE.PlaneGeometry(2, 2, 1, 1)
    }

    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    // Test compile with first render
    renderer.render(scene, camera)
    const gl = renderer.getContext()
    const glProgram = gl.getParameter(gl.CURRENT_PROGRAM)
    if (glProgram && !gl.getProgramParameter(glProgram, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(glProgram)
      setError(log ?? 'Shader link failed')
      disposeAll(THREE, scene)
      setLoading(false)
      return
    }

    setLoading(false)

    // IntersectionObserver — pause RAF when off-screen
    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting
        if (isVisible && !animationId) {
          clock.start()
          animate()
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(containerRef)

    const animate = () => {
      if (!isVisible || !renderer) {
        animationId = 0
        return
      }

      animationId = requestAnimationFrame(animate)
      const elapsed = clock.getElapsedTime()

      if (material?.uniforms.uTime) {
        material.uniforms.uTime.value = elapsed
      }

      if (isGeometry) {
        mesh.rotation.y = elapsed * 0.3
        mesh.rotation.x = elapsed * 0.15
      }

      renderer.render(scene, camera)
    }

    animate()

    // Resize handler
    const handleResize = () => {
      if (!renderer) return
      const w = containerRef.clientWidth
      const h = containerRef.clientHeight || 400
      renderer.setSize(w, h)
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = w / h
        camera.updateProjectionMatrix()
      }
    }

    window.addEventListener('resize', handleResize)

    onCleanup(() => {
      observer.disconnect()
      window.removeEventListener('resize', handleResize)
      if (animationId) cancelAnimationFrame(animationId)
      animationId = 0
      disposeAll(THREE, scene)
    })
  })

  function disposeAll(THREE: THREE, scene: InstanceType<THREE['Scene']>) {
    // Dispose all scene children
    scene.traverse((obj: { isMesh?: boolean; geometry?: { dispose: () => void }; material?: { dispose: () => void; uniforms?: Record<string, { value?: { dispose?: () => void } }> } }) => {
      if (obj.isMesh) {
        obj.geometry?.dispose()
        if (obj.material) {
          // Dispose textures in uniforms
          if (obj.material.uniforms) {
            for (const u of Object.values(obj.material.uniforms)) {
              if (u.value && typeof u.value === 'object' && 'dispose' in u.value) {
                (u.value as { dispose: () => void }).dispose()
              }
            }
          }
          obj.material.dispose()
        }
      }
    })

    if (renderer) {
      renderer.domElement.remove()
      renderer.dispose()
      renderer = null
    }

    material = null
    geometry = null
  }

  // React to uniform overrides
  createEffect(() => {
    const overrides = props.uniformOverrides
    if (!material || !threeModule) return

    for (const [name, value] of Object.entries(overrides)) {
      const uniformDef = props.uniforms.find((u) => u.name === name)
      if (uniformDef) {
        applyOverride(threeModule, material, name, value, uniformDef.type)
      }
    }
  })

  return (
    <div
      ref={containerRef}
      class="relative aspect-square w-full overflow-hidden rounded-2xl border border-surface-card-border bg-surface-primary"
    >
      {loading() && (
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      )}
      {error() && (
        <div class="absolute inset-0 flex flex-col items-center justify-center p-4">
          {props.fallbackSvg ? (
            <div class="h-full w-full" innerHTML={props.fallbackSvg} />
          ) : (
            <div class="text-center">
              <p class="text-sm font-medium text-danger">Preview unavailable</p>
              <p class="mt-1 text-xs text-text-muted">{error()}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
