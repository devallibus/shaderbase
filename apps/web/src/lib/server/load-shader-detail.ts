import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export type ShaderDetailUniform = {
  name: string
  type: string
  defaultValue: number | boolean | string | null | number[]
  description: string
  min?: number
  max?: number
}

export type ShaderDetailRecipe = {
  target: string
  code: string
  exportName: string
  summary: string
  placeholders: Array<{
    name: string
    kind: string
    description: string
    required: boolean
    example?: string
  }>
  requirements: string[]
}

export type ShaderDetail = {
  name: string
  displayName: string
  version: string
  summary: string
  description: string
  author: { name: string; github?: string; url?: string }
  license: string
  tags: string[]
  category: string
  pipeline: string
  stage: string
  requires: string[]
  capabilityOutputs: string[]
  threeRange: string
  renderers: string[]
  material: string
  environments: string[]
  uniforms: ShaderDetailUniform[]
  inputs: Array<{ name: string; kind: string; description: string; required: boolean }>
  outputs: Array<{ name: string; kind: string; description: string }>
  vertexSource: string
  fragmentSource: string
  recipes: ShaderDetailRecipe[]
  previewSvg: string | null
  provenance: {
    sourceKind: string
    sources: Array<{
      name: string
      kind: string
      url: string
      repositoryUrl?: string
      revision?: string
      retrievedAt: string
      license: string
      authors: string[]
      copyrightNotice?: string
      notes?: string
    }>
    attribution: { summary: string; requiredNotice?: string }
    notes?: string
  }
}

/**
 * Load a single shader's full detail from its directory on disk.
 * This is the pure filesystem logic extracted from the getShaderDetail server function.
 */
export async function loadShaderDetail(shaderDir: string): Promise<ShaderDetail> {
  const manifestRaw = await readFile(join(shaderDir, 'shader.json'), 'utf8')
  const manifest = JSON.parse(manifestRaw) as Record<string, unknown>

  const files = manifest.files as { vertex: string; fragment: string }
  const capabilityProfile = manifest.capabilityProfile as Record<string, unknown>
  const compatibility = manifest.compatibility as Record<string, unknown>
  const provenance = manifest.provenance as Record<string, unknown>
  const attribution = provenance.attribution as Record<string, unknown>
  const preview = manifest.preview as { path: string; format: string }
  const recipeMeta = manifest.recipes as Array<Record<string, unknown>>

  const [vertexSource, fragmentSource] = await Promise.all([
    readFile(join(shaderDir, files.vertex), 'utf8'),
    readFile(join(shaderDir, files.fragment), 'utf8'),
  ])

  const recipes: ShaderDetailRecipe[] = await Promise.all(
    recipeMeta.map(async (r) => {
      const code = await readFile(join(shaderDir, r.path as string), 'utf8')
      return {
        target: r.target as string,
        code,
        exportName: r.exportName as string,
        summary: r.summary as string,
        placeholders: (r.placeholders as ShaderDetailRecipe['placeholders']) ?? [],
        requirements: (r.requirements as string[]) ?? [],
      }
    }),
  )

  let previewSvg: string | null = null
  if (preview.format === 'svg') {
    previewSvg = await readFile(join(shaderDir, preview.path), 'utf8')
  }

  return {
    name: manifest.name as string,
    displayName: manifest.displayName as string,
    version: manifest.version as string,
    summary: manifest.summary as string,
    description: manifest.description as string,
    author: manifest.author as ShaderDetail['author'],
    license: manifest.license as string,
    tags: manifest.tags as string[],
    category: manifest.category as string,
    pipeline: capabilityProfile.pipeline as string,
    stage: capabilityProfile.stage as string,
    requires: (capabilityProfile.requires as string[]) ?? [],
    capabilityOutputs: (capabilityProfile.outputs as string[]) ?? [],
    threeRange: compatibility.three as string,
    renderers: compatibility.renderers as string[],
    material: compatibility.material as string,
    environments: compatibility.environments as string[],
    uniforms: manifest.uniforms as ShaderDetailUniform[],
    inputs: manifest.inputs as ShaderDetail['inputs'],
    outputs: manifest.outputs as ShaderDetail['outputs'],
    vertexSource,
    fragmentSource,
    recipes,
    previewSvg,
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
