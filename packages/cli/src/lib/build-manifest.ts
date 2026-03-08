import type { AiParsedShader } from './ai-parse.ts'

type ResolvedMeta = {
  sourceType: string
  url?: string
  title?: string
  author?: string
}

function parseDefault(u: AiParsedShader['uniforms'][number]): unknown {
  try {
    if (u.type === 'float' || u.type === 'int') return Number(u.defaultValue) || 0
    if (u.type === 'bool') return u.defaultValue === 'true'
    if (['vec2', 'vec3', 'vec4', 'color'].includes(u.type)) {
      return u.defaultValue.split(',').map((v) => Number(v.trim()) || 0)
    }
    return u.defaultValue || null
  } catch {
    return 0
  }
}

export function buildManifest(
  data: AiParsedShader,
  resolvedMeta?: ResolvedMeta,
): Record<string, unknown> {
  return {
    schemaVersion: '0.1.0',
    name: data.name,
    displayName: data.displayName,
    version: '0.1.0',
    summary: data.summary,
    description: data.description,
    author: { name: data.authorName },
    license: 'MIT',
    tags: data.tagsText.split(',').map((t) => t.trim()).filter(Boolean),
    category: data.category,
    capabilityProfile: {
      pipeline: data.pipeline,
      stage: data.stage,
      requires: data.capabilityRequires,
      outputs: data.capabilityOutputs,
    },
    compatibility: {
      three: '>=0.160.0',
      renderers: ['webgl2'],
      material: data.material,
      environments: ['three', 'react-three-fiber'],
    },
    uniforms: data.uniforms.map((u) => ({
      name: u.name,
      type: u.type,
      defaultValue: parseDefault(u),
      description: u.description,
      ...(u.min ? { min: Number(u.min) } : {}),
      ...(u.max ? { max: Number(u.max) } : {}),
    })),
    inputs: data.inputs.map((i) => ({
      name: i.name,
      kind: i.kind,
      description: i.description,
      required: i.required,
    })),
    outputs: data.outputs.map((o) => ({
      name: o.name,
      kind: o.kind,
      description: o.description,
    })),
    files: {
      vertex: 'vertex.glsl',
      fragment: 'fragment.glsl',
      includes: [],
    },
    recipes: [
      {
        target: 'three',
        path: 'recipes/three.ts',
        exportName: `create${data.displayName.replace(/\s+/g, '')}Material`,
        summary: `Create a ShaderMaterial for ${data.displayName} in vanilla Three.js.`,
        placeholders: [],
        requirements: ['three-scene', 'mesh'],
      },
    ],
    preview: {
      path: 'preview.svg',
      format: 'svg',
      width: 512,
      height: 512,
      deterministic: true,
    },
    provenance: {
      sourceKind: data.sourceKind,
      sources:
        data.sourceKind !== 'original' && resolvedMeta?.url
          ? [
              {
                name: resolvedMeta?.title ?? data.displayName,
                kind: resolvedMeta?.sourceType === 'shadertoy' ? 'demo'
                  : resolvedMeta?.sourceType === 'gist' ? 'file'
                  : resolvedMeta?.sourceType === 'github-file' ? 'file'
                  : 'file',
                url: resolvedMeta!.url!,
                ...(resolvedMeta?.sourceType === 'github-file' || resolvedMeta?.sourceType === 'gist'
                  ? { repositoryUrl: resolvedMeta!.url! }
                  : {}),
                revision: `submitted-${new Date().toISOString().slice(0, 10)}`,
                retrievedAt: new Date().toISOString().slice(0, 10),
                license: 'MIT',
                authors: [resolvedMeta?.author ?? 'Unknown'],
              },
            ]
          : [],
      attribution: {
        summary: data.attributionSummary,
        ...(data.sourceKind !== 'original'
          ? { requiredNotice: data.attributionSummary }
          : {}),
      },
    },
  }
}
