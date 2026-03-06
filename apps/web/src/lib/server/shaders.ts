import { createServerFn } from '@tanstack/solid-start'

export type ShaderEntry = {
  name: string
  displayName: string
  summary: string
  category: string
  sourceKind: string
  tags: string[]
  pipeline: string
  stage: string
  renderers: string[]
  environments: string[]
  averageRating?: number
  reviewCount?: number
}

export const listShaders = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ShaderEntry[]> => {
    const { readdir, readFile } = await import('node:fs/promises')
    const { join, resolve } = await import('node:path')

    const { getAllShaderRatings } = await import('./reviews-db')

    const repoRoot = resolve(process.cwd(), '../..')
    const shadersRoot = join(repoRoot, 'shaders')

    try {
      const ratings = getAllShaderRatings()
      const entries = await readdir(shadersRoot, { withFileTypes: true })
      const shaders = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            try {
              const raw = await readFile(join(shadersRoot, entry.name, 'shader.json'), 'utf8')
              const manifest = JSON.parse(raw) as Record<string, unknown>

              const capabilityProfile = manifest.capabilityProfile as Record<string, unknown> | undefined
              const compatibility = manifest.compatibility as Record<string, unknown> | undefined
              const provenance = manifest.provenance as Record<string, unknown> | undefined

              const shaderName = (manifest.name as string) ?? entry.name
              const rating = ratings[shaderName]

              return {
                name: shaderName,
                displayName: (manifest.displayName as string) ?? entry.name,
                summary: (manifest.summary as string) ?? 'No summary provided.',
                category: (manifest.category as string) ?? 'unknown',
                sourceKind: (provenance?.sourceKind as string) ?? 'unknown',
                tags: (manifest.tags as string[]) ?? [],
                pipeline: (capabilityProfile?.pipeline as string) ?? 'unknown',
                stage: (capabilityProfile?.stage as string) ?? 'unknown',
                renderers: (compatibility?.renderers as string[]) ?? [],
                environments: (compatibility?.environments as string[]) ?? [],
                averageRating: rating?.average,
                reviewCount: rating?.count,
              }
            } catch {
              return null
            }
          }),
      )

      return shaders.filter((entry): entry is ShaderEntry => entry !== null)
    } catch {
      return []
    }
  },
)
