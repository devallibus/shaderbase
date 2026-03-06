import { onMount, onCleanup } from 'solid-js'

// 2.5D particle wave — isometric perspective grid
const COLS = 160
const ROWS = 50
const BG = '#f8f9fb'
const MOUSE_R = 4
const CLICK_R = 6
const MOUSE_FORCE = 0.25
const CLICK_FORCE = 2
const SPRING = 0.02
const DAMPING = 0.9

type GridPoint = { oy: number; vy: number }

export default function AsciiBackground() {
  let canvasRef: HTMLCanvasElement | undefined
  let frameId: number
  let grid: GridPoint[] = []
  let mouseGX = -9999
  let mouseGZ = -9999
  let time = 0

  const init = () => {
    grid = Array.from({ length: COLS * ROWS }, () => ({ oy: 0, vy: 0 }))
  }

  const render = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const dpr = devicePixelRatio
    const cw = w * dpr
    const ch = h * dpr
    time += 0.01

    ctx.fillStyle = BG
    ctx.fillRect(0, 0, cw, ch)

    // Wave sits in the center-lower area of the viewport
    const baseCX = cw / 2
    const baseCY = ch * 0.52

    // Spacing — wide enough to overflow past both edges
    const xSpacing = (w * 1.3) / COLS * dpr
    const zSpacing = (h * 0.28) / ROWS * dpr

    // Render back-to-front (far rows first)
    for (let iz = 0; iz < ROWS; iz++) {
      // Perspective: far rows are narrower and have smaller dots
      const zT = iz / ROWS // 0 = back, 1 = front
      const perspX = 0.65 + zT * 0.35
      const dotSize = (0.4 + zT * 1.2) * dpr

      const rowY = baseCY - (ROWS - iz) * zSpacing + ROWS * zSpacing * 0.5

      for (let ix = 0; ix < COLS; ix++) {
        const idx = iz * COLS + ix
        const pt = grid[idx]

        // Wave displacement — multi-frequency for organic motion
        const wave1 = Math.sin(ix * 0.06 + time * 1.6) * 35
        const wave2 = Math.sin(iz * 0.09 + time * 1.1) * 22
        const wave3 = Math.sin(ix * 0.03 + iz * 0.04 + time * 0.6) * 42
        const wave4 = Math.sin(ix * 0.12 + iz * 0.08 - time * 2.2) * 15
        const waveY = wave1 + wave2 + wave3 + wave4

        // Mouse perturbation
        const mdx = ix - mouseGX
        const mdz = iz - mouseGZ
        const mDist = Math.sqrt(mdx * mdx + mdz * mdz)
        if (mDist < MOUSE_R && mDist > 0.1) {
          const t = 1 - mDist / MOUSE_R
          pt.vy += t * t * MOUSE_FORCE
        }

        pt.vy -= pt.oy * SPRING
        pt.vy *= DAMPING
        pt.oy += pt.vy

        const totalY = (waveY + pt.oy * 12) * (0.2 + zT * 0.8)
        const disp = Math.abs(pt.oy)

        // Screen position
        const sx = baseCX + (ix - COLS / 2) * xSpacing * perspX
        const sy = rowY - totalY * dpr * 0.45

        if (sx < -20 || sx > cw + 20 || sy < -20 || sy > ch + 20) continue

        // Color
        const brightness = 0.3 + zT * 0.7
        let r: number, g: number, b: number, alpha: number

        if (disp > 0.2) {
          const intensity = Math.min(disp / 3, 1)
          r = 5; g = 150; b = 105
          alpha = (0.3 + intensity * 0.6) * brightness
        } else {
          r = 130 + Math.floor(brightness * 50)
          g = 145 + Math.floor(brightness * 45)
          b = 170 + Math.floor(brightness * 25)
          alpha = brightness * 0.55
        }

        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
        ctx.beginPath()
        ctx.arc(sx, sy, dotSize, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  onMount(() => {
    if (!canvasRef) return
    const ctx = canvasRef.getContext('2d')!
    if (!ctx) return
    init()

    let w = window.innerWidth
    let h = window.innerHeight

    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvasRef!.width = w * devicePixelRatio
      canvasRef!.height = h * devicePixelRatio
    }

    const handleMouse = (e: MouseEvent) => {
      // Map screen position to grid coords
      const baseCY = h * 0.52
      const zSpacing = (h * 0.28) / ROWS

      // Estimate grid Z from mouse Y
      const estGZ = ROWS - (baseCY - e.clientY + ROWS * zSpacing * 0.5) / zSpacing
      mouseGZ = estGZ

      // Use the estimated Z to get the correct perspective for X mapping
      const zT = Math.max(0, Math.min(1, estGZ / ROWS))
      const perspAtMouse = 0.65 + zT * 0.35
      const xSpacing = (w * 1.3) / COLS
      mouseGX = (e.clientX - w / 2) / (xSpacing * perspAtMouse) + COLS / 2
    }

    const handleClick = (e: MouseEvent) => {
      handleMouse(e)
      for (let iz = 0; iz < ROWS; iz++) {
        for (let ix = 0; ix < COLS; ix++) {
          const dx = ix - mouseGX
          const dz = iz - mouseGZ
          const dist = Math.sqrt(dx * dx + dz * dz)
          if (dist < CLICK_R && dist > 0.1) {
            const t = 1 - dist / CLICK_R
            grid[iz * COLS + ix].vy += t * t * CLICK_FORCE
          }
        }
      }
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', handleMouse)
    window.addEventListener('click', handleClick)

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      render(ctx, w, h)
      onCleanup(() => {
        window.removeEventListener('resize', resize)
        window.removeEventListener('mousemove', handleMouse)
        window.removeEventListener('click', handleClick)
      })
      return
    }

    const loop = () => {
      render(ctx, w, h)
      frameId = requestAnimationFrame(loop)
    }
    frameId = requestAnimationFrame(loop)

    onCleanup(() => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', handleMouse)
      window.removeEventListener('click', handleClick)
    })
  })

  return (
    <div class="fixed inset-0 z-0 overflow-hidden">
      <canvas ref={canvasRef} class="h-full w-full" />
    </div>
  )
}
