import type { ShaderEntry } from './list-shaders.ts'
import type { ShaderDetail, ShaderDetailRecipe } from './load-shader-detail.ts'

/**
 * Environment-aware shader data source.
 *
 * When REGISTRY_URL is set (Cloudflare Pages production), fetches from the
 * registry CDN. Otherwise falls back to the local filesystem (local dev).
 */
const REGISTRY_URL = process.env.REGISTRY_URL || ''

export async function listShadersFromSource(): Promise<ShaderEntry[]> {
  if (REGISTRY_URL) {
    const res = await fetch(`${REGISTRY_URL}/index.json`)
    if (!res.ok) throw new Error(`Failed to fetch registry index: ${res.status}`)
    const index = (await res.json()) as {
      shaders: Array<Record<string, unknown>>
    }
    return index.shaders.map((s) => ({
      name: s.name as string,
      displayName: s.displayName as string,
      summary: s.summary as string,
      category: s.category as string,
      sourceKind: s.sourceKind as string,
      tags: s.tags as string[],
      pipeline: s.pipeline as string,
      stage: s.stage as string,
      renderers: s.renderers as string[],
      environments: s.environments as string[],
    }))
  }

  // Fallback: filesystem (local dev)
  const { join, resolve } = await import('node:path')
  const { listShadersFromDisk } = await import('./list-shaders.ts')
  const repoRoot = resolve(process.cwd(), '../..')
  return listShadersFromDisk(join(repoRoot, 'shaders'))
}

export async function getShaderDetailFromSource(name: string): Promise<ShaderDetail> {
  if (REGISTRY_URL) {
    const res = await fetch(`${REGISTRY_URL}/shaders/${name}.json`)
    if (!res.ok) throw new Error(`Shader "${name}" not found`)
    const bundle = (await res.json()) as Record<string, unknown>

    const compatibility = bundle.compatibility as Record<string, unknown>
    const capabilityProfile = bundle.capabilityProfile as Record<string, unknown>
    const provenance = bundle.provenance as Record<string, unknown>
    const attribution = (provenance.attribution as Record<string, unknown>) ?? {}
    const uniformsFull = bundle.uniformsFull as ShaderDetail['uniforms']
    const recipesRecord = (bundle.recipes as Record<string, Record<string, unknown>>) ?? {}

    // Convert recipes from Record<target, bundle> to ShaderDetailRecipe[]
    const recipes: ShaderDetailRecipe[] = Object.entries(recipesRecord).map(
      ([target, r]) => ({
        target,
        code: r.code as string,
        exportName: r.exportName as string,
        summary: r.summary as string,
        placeholders: (r.placeholders as ShaderDetailRecipe['placeholders']) ?? [],
        requirements: (r.requirements as string[]) ?? [],
      }),
    )

    return {
      name: bundle.name as string,
      displayName: bundle.displayName as string,
      version: bundle.version as string,
      summary: bundle.summary as string,
      description: bundle.description as string,
      author: bundle.author as ShaderDetail['author'],
      license: bundle.license as string,
      tags: bundle.tags as string[],
      category: bundle.category as string,
      pipeline: capabilityProfile.pipeline as string,
      stage: capabilityProfile.stage as string,
      requires: (capabilityProfile.requires as string[]) ?? [],
      capabilityOutputs: (capabilityProfile.outputs as string[]) ?? [],
      threeRange: compatibility.three as string,
      renderers: compatibility.renderers as string[],
      material: compatibility.material as string,
      environments: compatibility.environments as string[],
      uniforms: uniformsFull,
      inputs: bundle.inputs as ShaderDetail['inputs'],
      outputs: bundle.outputs as ShaderDetail['outputs'],
      vertexSource: bundle.vertexSource as string,
      fragmentSource: bundle.fragmentSource as string,
      recipes,
      // previewSvg is not available in the registry bundle
      previewSvg: null,
      provenance: {
        sourceKind: provenance.sourceKind as string,
        sources: (provenance.sources as ShaderDetail['provenance']['sources']) ?? [],
        attribution: {
          summary: attribution.summary as string,
          requiredNotice: attribution.requiredNotice as string | undefined,
        },
        notes: provenance.notes as string | undefined,
      },
    }
  }

  // Fallback: filesystem (local dev)
  const { join, resolve } = await import('node:path')
  const { loadShaderDetail } = await import('./load-shader-detail.ts')
  const repoRoot = resolve(process.cwd(), '../..')
  return loadShaderDetail(join(repoRoot, 'shaders', name))
}
