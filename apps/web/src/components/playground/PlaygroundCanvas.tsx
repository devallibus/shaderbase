import { createEffect, createSignal, on, onCleanup, onMount } from 'solid-js'

type THREE = typeof import('three')

type PlaygroundCanvasProps = {
  vertexSource: string
  fragmentSource: string
  pipeline: string
  language: string
  onError: (errors: string[]) => void
  onScreenshotReady: (base64: string) => void
}

function buildDefaultUniforms(THREE: THREE) {
  return {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  } as Record<string, { value: unknown }>
}

export default function PlaygroundCanvas(props: PlaygroundCanvasProps) {
  let containerRef!: HTMLDivElement
  let renderer: InstanceType<THREE['WebGLRenderer']> | null = null
  let material: InstanceType<THREE['ShaderMaterial']> | null = null
  let scene: InstanceType<THREE['Scene']> | null = null
  let camera: InstanceType<THREE['Camera']> | null = null
  let mesh: InstanceType<THREE['Mesh']> | null = null
  let clock: InstanceType<THREE['Clock']> | null = null
  let animationId = 0
  let threeModule: THREE | null = null

  const [loading, setLoading] = createSignal(true)
  const [initError, setInitError] = createSignal('')

  onMount(async () => {
    let THREE: THREE
    try {
      THREE = await import('three')
      threeModule = THREE
    } catch {
      setInitError('Failed to load 3D engine')
      setLoading(false)
      return
    }

    // TSL preview not yet implemented — show placeholder
    if (props.language === 'tsl') {
      setLoading(false)
      return
    }

    const width = containerRef.clientWidth
    const height = containerRef.clientHeight || 400

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true, // Required for toDataURL
      })
    } catch {
      setInitError('WebGL not available')
      setLoading(false)
      return
    }

    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    containerRef.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'

    scene = new THREE.Scene()
    clock = new THREE.Clock()

    const isPostProcess = props.pipeline === 'postprocessing'
    camera = isPostProcess
      ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
      : new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    camera.position.z = isPostProcess ? 1 : 3

    const uniforms = buildDefaultUniforms(THREE)
    uniforms.uResolution.value = new THREE.Vector2(width, height)

    compileShader(THREE, props.vertexSource, props.fragmentSource, uniforms)
    setLoading(false)

    const animate = () => {
      if (!renderer || !scene || !camera) return
      animationId = requestAnimationFrame(animate)
      const elapsed = clock!.getElapsedTime()

      if (material?.uniforms.uTime) {
        material.uniforms.uTime.value = elapsed
      }

      if (props.pipeline === 'geometry' && mesh) {
        mesh.rotation.y = elapsed * 0.3
        mesh.rotation.x = elapsed * 0.15
      }

      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      if (!renderer) return
      const w = containerRef.clientWidth
      const h = containerRef.clientHeight || 400
      renderer.setSize(w, h)
      if (material?.uniforms.uResolution) {
        ;(material.uniforms.uResolution.value as InstanceType<THREE['Vector2']>).set(w, h)
      }
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = w / h
        camera.updateProjectionMatrix()
      }
    }
    window.addEventListener('resize', handleResize)

    onCleanup(() => {
      window.removeEventListener('resize', handleResize)
      if (animationId) cancelAnimationFrame(animationId)
      animationId = 0
      disposeAll()
    })
  })

  function compileShader(
    THREE: THREE,
    vertexSource: string,
    fragmentSource: string,
    uniforms?: Record<string, { value: unknown }>,
  ) {
    if (!renderer || !scene || !camera) return

    // Remove old mesh
    if (mesh) {
      scene.remove(mesh)
      mesh.geometry?.dispose()
      ;(mesh.material as InstanceType<THREE['ShaderMaterial']>)?.dispose()
    }

    const shaderUniforms = uniforms ?? material?.uniforms ?? buildDefaultUniforms(THREE)

    try {
      material = new THREE.ShaderMaterial({
        vertexShader: vertexSource,
        fragmentShader: fragmentSource,
        uniforms: shaderUniforms,
      })
    } catch (e) {
      props.onError([e instanceof Error ? e.message : 'Shader compilation failed'])
      return
    }

    const isPostProcess = props.pipeline === 'postprocessing'
    const isGeometry = props.pipeline === 'geometry'
    const geometry = isPostProcess
      ? new THREE.PlaneGeometry(2, 2)
      : isGeometry
        ? new THREE.SphereGeometry(1, 32, 32)
        : new THREE.PlaneGeometry(2, 2, 1, 1)

    mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    // Test compile
    renderer.render(scene, camera)
    const gl = renderer.getContext()
    const glProgram = gl.getParameter(gl.CURRENT_PROGRAM)

    if (glProgram) {
      // Check vertex shader
      const vertShader = gl.getAttachedShaders(glProgram)
      const errors: string[] = []
      if (vertShader) {
        for (const s of vertShader) {
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(s)
            if (log) errors.push(log)
          }
        }
      }
      if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(glProgram)
        if (log) errors.push(log)
      }

      if (errors.length > 0) {
        props.onError(errors)
        return
      }
    }

    // No errors — clear any previous errors and capture screenshot
    props.onError([])
    captureScreenshot()
  }

  function captureScreenshot() {
    if (!renderer) return
    try {
      const base64 = renderer.domElement.toDataURL('image/png')
      props.onScreenshotReady(base64)
    } catch {
      // toDataURL can fail in some contexts — ignore silently
    }
  }

  function disposeAll() {
    if (scene) {
      scene.traverse(
        (obj: {
          isMesh?: boolean
          geometry?: { dispose: () => void }
          material?: {
            dispose: () => void
            uniforms?: Record<string, { value?: { dispose?: () => void } }>
          }
        }) => {
          if (obj.isMesh) {
            obj.geometry?.dispose()
            if (obj.material) {
              if (obj.material.uniforms) {
                for (const u of Object.values(obj.material.uniforms)) {
                  if (u.value && typeof u.value === 'object' && 'dispose' in u.value) {
                    ;(u.value as { dispose: () => void }).dispose()
                  }
                }
              }
              obj.material.dispose()
            }
          }
        },
      )
    }

    if (renderer) {
      renderer.domElement.remove()
      renderer.dispose()
      renderer = null
    }
    material = null
    mesh = null
    scene = null
    camera = null
  }

  // Recompile when source changes
  createEffect(
    on(
      () => [props.vertexSource, props.fragmentSource] as const,
      ([vertex, fragment]) => {
        if (!threeModule || !renderer || props.language === 'tsl') return
        compileShader(threeModule, vertex, fragment)
      },
      { defer: true },
    ),
  )

  return (
    <div
      ref={containerRef}
      class="relative h-full w-full overflow-hidden bg-black"
    >
      {loading() && (
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      )}
      {initError() && (
        <div class="absolute inset-0 flex items-center justify-center p-4">
          <p class="text-sm text-danger">{initError()}</p>
        </div>
      )}
      {!loading() && props.language === 'tsl' && (
        <div class="absolute inset-0 flex items-center justify-center p-4">
          <div class="text-center">
            <p class="text-sm font-medium text-text-secondary">TSL Preview</p>
            <p class="mt-1 text-xs text-text-muted">
              WebGPU-based TSL preview coming soon.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
