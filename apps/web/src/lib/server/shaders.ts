import { createServerFn } from '@tanstack/solid-start'
import { listShadersFromDisk } from './list-shaders.ts'

export type { ShaderEntry } from './list-shaders.ts'

export const listShaders = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { join, resolve } = await import('node:path')

    const { getAllShaderRatings } = await import('./reviews-db')

    const repoRoot = resolve(process.cwd(), '../..')
    const shadersRoot = join(repoRoot, 'shaders')

    const shaders = await listShadersFromDisk(shadersRoot)
    const ratings = getAllShaderRatings()

    return shaders.map((shader) => {
      const rating = ratings[shader.name]
      return {
        ...shader,
        averageRating: rating?.average,
        reviewCount: rating?.count,
      }
    })
  },
)
