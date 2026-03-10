import { createEffect, createSignal, on, onCleanup, onMount } from 'solid-js'
import type {
  TslPreviewModuleResult,
  TslPreviewModuleRuntime,
} from '../../../../packages/schema/src/tsl-preview-module.ts'

type THREE = typeof import('three/webgpu')
type TSL = typeof import('three/tsl')

type TslPreviewCanvasProps = {
  previewModule: string
  pipeline: string
  fallbackSvg?: string | null
  onError?: (errors: string[]) => void
  onScreenshotReady?: (base64: string) => void
}

type LoadedRuntime = {
  THREE: THREE
  TSL: TSL
}

type PreviewInstance = TslPreviewModuleResult & {
  material: InstanceType<THREE['Material']>
}

type PreviewModuleNamespace = {
  createPreview: (runtime: TslPreviewModuleRuntime) => TslPreviewModuleResult
}

function defaultGeometry(THREE: THREE, pipeline: string) {
  if (pipeline === 'postprocessing') {
    return new THREE.PlaneGeometry(2, 2)
  }

  if (pipeline === 'geometry') {
    return new THREE.SphereGeometry(1, 32, 32)
  }

  return new THREE.PlaneGeometry(2, 2, 1, 1)
}

export default function TslPreviewCanvas(props: TslPreviewCanvasProps) {
  let containerRef!: HTMLDivElement
  let renderer: InstanceType<THREE['WebGPURenderer']> | null = null
  let scene: InstanceType<THREE['Scene']> | null = null
  let camera: InstanceType<THREE['Camera']> | null = null
  let mesh: InstanceType<THREE['Mesh']> | null = null
  let runtime: LoadedRuntime | null = null
  let previewInstance: PreviewInstance | null = null
  let animationId = 0
  let currentModuleUrl: string | null = null

  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal('')

  function setPreviewError(message: string) {
    setError(message)
    props.onError?.([message])
  }

  function clearPreviewError() {
    setError('')
    props.onError?.([])
  }

  function captureScreenshot() {
    if (!renderer || !props.onScreenshotReady) return

    try {
      const base64 = renderer.domElement.toDataURL('image/png')
      props.onScreenshotReady(base64)
    } catch {
      // Ignore screenshot failures. The preview can still be useful without one.
    }
  }

  function disposePreviewMesh() {
    if (previewInstance?.dispose) {
      previewInstance.dispose()
    }

    previewInstance = null

    if (mesh && scene) {
      scene.remove(mesh)
      mesh.geometry?.dispose()
      mesh.material?.dispose()
    }

    mesh = null

    if (currentModuleUrl) {
      URL.revokeObjectURL(currentModuleUrl)
      currentModuleUrl = null
    }
  }

  async function renderPreview(previewModule: string) {
    if (!runtime || !renderer || !scene || !camera) return

    disposePreviewMesh()

    try {
      const width = containerRef.clientWidth
      const height = containerRef.clientHeight || 400
      const blob = new Blob([previewModule], { type: 'text/javascript' })
      currentModuleUrl = URL.createObjectURL(blob)

      const module = (await import(/* @vite-ignore */ currentModuleUrl)) as PreviewModuleNamespace
      if (typeof module.createPreview !== 'function') {
        throw new Error('TSL preview modules must export createPreview(runtime).')
      }

      const nextPreview = module.createPreview({
        THREE: runtime.THREE,
        TSL: runtime.TSL,
        width,
        height,
        pipeline: props.pipeline,
      })

      if (!nextPreview?.material || typeof nextPreview.material !== 'object') {
        throw new Error('createPreview(runtime) must return an object with a material.')
      }

      previewInstance = nextPreview as PreviewInstance

      const geometry = (previewInstance.geometry as InstanceType<THREE['BufferGeometry']> | undefined)
        ?? defaultGeometry(runtime.THREE, props.pipeline)

      const nextCamera = previewInstance.camera as InstanceType<THREE['Camera']> | undefined
      if (nextCamera) {
        camera = nextCamera
      }

      mesh = new runtime.THREE.Mesh(geometry, previewInstance.material)
      scene.add(mesh)
      renderer.render(scene, camera)
      clearPreviewError()
      captureScreenshot()
    } catch (previewError) {
      disposePreviewMesh()
      setPreviewError(
        previewError instanceof Error
          ? previewError.message
          : 'Failed to build the TSL preview module.',
      )
    } finally {
      setLoading(false)
    }
  }

  onMount(async () => {
    if (!('gpu' in navigator)) {
      setPreviewError('WebGPU is not available in this browser.')
      setLoading(false)
      return
    }

    try {
      const [THREE, TSL] = await Promise.all([
        import('three/webgpu'),
        import('three/tsl'),
      ])

      const width = containerRef.clientWidth
      const height = containerRef.clientHeight || 400

      renderer = new THREE.WebGPURenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      })
      await renderer.init()

      renderer.setSize(width, height)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      containerRef.appendChild(renderer.domElement)
      renderer.domElement.style.display = 'block'
      renderer.domElement.style.width = '100%'
      renderer.domElement.style.height = '100%'
      renderer.domElement.style.borderRadius = '1rem'

      scene = new THREE.Scene()
      camera = props.pipeline === 'postprocessing'
        ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
        : new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
      camera.position.z = props.pipeline === 'postprocessing' ? 1 : 3

      runtime = { THREE, TSL }

      const animate = () => {
        if (!renderer || !scene || !camera) return
        animationId = requestAnimationFrame(animate)

        if (props.pipeline === 'geometry' && mesh) {
          const elapsed = performance.now() * 0.001
          mesh.rotation.y = elapsed * 0.3
          mesh.rotation.x = elapsed * 0.15
        }

        previewInstance?.update?.(performance.now() * 0.001)
        renderer.render(scene, camera)
      }

      const handleResize = () => {
        if (!renderer || !camera || !runtime) return
        const nextWidth = containerRef.clientWidth
        const nextHeight = containerRef.clientHeight || 400
        renderer.setSize(nextWidth, nextHeight)

        if (camera instanceof runtime.THREE.PerspectiveCamera) {
          camera.aspect = nextWidth / nextHeight
          camera.updateProjectionMatrix()
        }
      }

      window.addEventListener('resize', handleResize)
      onCleanup(() => {
        window.removeEventListener('resize', handleResize)
        if (animationId) cancelAnimationFrame(animationId)
        animationId = 0
        disposePreviewMesh()
        renderer?.domElement.remove()
        renderer?.dispose()
        renderer = null
        scene = null
        camera = null
        runtime = null
      })

      animate()
      await renderPreview(props.previewModule)
    } catch (previewError) {
      setPreviewError(
        previewError instanceof Error
          ? previewError.message
          : 'Failed to initialize the TSL preview runtime.',
      )
      setLoading(false)
    }
  })

  createEffect(
    on(
      () => props.previewModule,
      async (previewModule) => {
        if (!runtime || !renderer) return
        setLoading(true)
        await renderPreview(previewModule)
      },
      { defer: true },
    ),
  )

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
        <div class="absolute inset-0 flex items-center justify-center p-4">
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
