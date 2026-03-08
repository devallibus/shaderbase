import { createServerFn } from '@tanstack/solid-start'
import { listShadersFromSource } from './shader-source.ts'

export type { ShaderEntry } from './list-shaders.ts'

export const listShaders = createServerFn({ method: 'GET' }).handler(
  async () => {
    const shaders = await listShadersFromSource()

    // Reviews use node:sqlite — works on Node.js 22+ (Railway).
    // Falls back gracefully if node:sqlite is unavailable (e.g. Cloudflare).
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
      /* reviews unavailable — node:sqlite not present */
    }

    return shaders
  },
)
