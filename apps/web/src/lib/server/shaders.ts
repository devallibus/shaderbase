import { createServerFn } from '@tanstack/solid-start'
import { listShadersFromSource } from './shader-source.ts'

export type { ShaderEntry } from './list-shaders.ts'

export const listShaders = createServerFn({ method: 'GET' }).handler(
  async () => {
    const shaders = await listShadersFromSource()

    // Reviews use node:sqlite which is unavailable on Cloudflare.
    // Only attempt to load ratings when running locally (no REGISTRY_URL).
    if (!process.env.REGISTRY_URL) {
      try {
        const { getAllShaderRatings } = await import('./reviews-db')
        const ratings = getAllShaderRatings()
        return shaders.map((shader) => {
          const rating = ratings[shader.name]
          return {
            ...shader,
            averageRating: rating?.average,
            reviewCount: rating?.count,
          }
        })
      } catch {
        /* reviews unavailable */
      }
    }

    return shaders
  },
)
