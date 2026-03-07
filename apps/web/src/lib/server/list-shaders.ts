import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

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

/**
 * Read all shader manifests from disk and return an array of ShaderEntry objects.
 * This is the pure filesystem logic extracted from the listShaders server function.
 * Ratings are NOT included — they are a separate concern handled by the caller.
 */
export async function listShadersFromDisk(shadersRoot: string): Promise<ShaderEntry[]> {
  try {
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

            return {
              name: (manifest.name as string) ?? entry.name,
              displayName: (manifest.displayName as string) ?? entry.name,
              summary: (manifest.summary as string) ?? 'No summary provided.',
              category: (manifest.category as string) ?? 'unknown',
              sourceKind: (provenance?.sourceKind as string) ?? 'unknown',
              tags: (manifest.tags as string[]) ?? [],
              pipeline: (capabilityProfile?.pipeline as string) ?? 'unknown',
              stage: (capabilityProfile?.stage as string) ?? 'unknown',
              renderers: (compatibility?.renderers as string[]) ?? [],
              environments: (compatibility?.environments as string[]) ?? [],
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
}
