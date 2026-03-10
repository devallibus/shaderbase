import { createEffect, createMemo, createSignal, on, onCleanup, onMount } from 'solid-js'
import { buildTslPreviewModule } from '../../../../../packages/schema/src/tsl-preview-module.ts'
import { collectShaderDiagnostics, diagnosticsToMessages } from '../../lib/webgl-shader-errors'
import TslPreviewCanvas from '../TslPreviewCanvas'

type THREE = typeof import('three')

type PlaygroundCanvasProps = {
  vertexSource: string
  fragmentSource: string
  tslSource?: string
  pipeline: string
  language: 'glsl' | 'tsl'
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
  const tslPreviewModule = createMemo(() => {
    if (props.language !== 'tsl' || !props.tslSource) return ''

    try {
      return buildTslPreviewModule(props.tslSource)
    } catch (error) {
      props.onError([error instanceof Error ? error.message : 'Failed to build TSL preview module'])
      return ''
    }
  })

  if (props.language === 'tsl') {
    return (
      <TslPreviewCanvas
        previewModule={tslPreviewModule()}
        pipeline={props.pipeline}
        onError={props.onError}
        onScreenshotReady={props.onScreenshotReady}
      />
    )
  }

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

    const shaderDiagnostics: ReturnType<typeof collectShaderDiagnostics> = []
    const previousShaderError = renderer.debug.onShaderError

    renderer.debug.onShaderError = (gl, program, glVertexShader, glFragmentShader) => {
      shaderDiagnostics.splice(
        0,
        shaderDiagnostics.length,
        ...collectShaderDiagnostics({
          gl,
          program,
          vertexShader: glVertexShader,
          fragmentShader: glFragmentShader,
        }),
      )
    }

    try {
      renderer.render(scene, camera)
    } catch (renderError) {
      const fallbackMessage = renderError instanceof Error
        ? renderError.message
        : 'Shader compilation failed'

      props.onError(
        shaderDiagnostics.length > 0 ? diagnosticsToMessages(shaderDiagnostics) : [fallbackMessage],
      )
      return
    } finally {
      renderer.debug.onShaderError = previousShaderError
    }

    if (shaderDiagnostics.length > 0) {
      props.onError(diagnosticsToMessages(shaderDiagnostics))
      return
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
        if (!threeModule || !renderer) return
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
    </div>
  )
}
