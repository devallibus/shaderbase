const createId = () => Math.random().toString(36).slice(2, 10)

export const pipelineOptions = [
  'surface',
  'postprocessing',
  'geometry',
  'utility',
] as const

export const stageOptions = [
  'fragment',
  'vertex',
  'vertex-and-fragment',
  'fullscreen-pass',
] as const

export const capabilityRequirementOptions = [
  'uv',
  'time',
  'resolution',
  'mouse',
  'normals',
  'world-position',
  'input-texture',
  'camera',
  'screen-space',
] as const

export const outputKindOptions = [
  'color',
  'alpha',
  'emissive',
  'position-offset',
  'normal-perturbation',
] as const

export const rendererOptions = ['webgl1', 'webgl2', 'webgpu'] as const

export const environmentOptions = ['three', 'react-three-fiber'] as const

export const materialOptions = [
  'shader-material',
  'raw-shader-material',
  'post-processing-pass',
  'custom',
] as const

export const uniformTypeOptions = [
  'float',
  'int',
  'bool',
  'vec2',
  'vec3',
  'vec4',
  'mat3',
  'mat4',
  'color',
  'sampler2D',
  'samplerCube',
] as const

export const inputKindOptions = [
  'uv',
  'position',
  'normal',
  'time',
  'resolution',
  'texture',
  'mouse',
] as const

export const sourceReferenceKindOptions = [
  'file',
  'repository',
  'demo',
  'article',
  'algorithm',
] as const

export const sourceKindOptions = ['original', 'adapted', 'ported'] as const

export const recipeRequirementOptions = [
  'three-scene',
  'mesh',
  'animation-loop',
  'canvas',
  'texture-input',
  'effect-composer',
] as const

export type UniformFormRow = {
  id: string
  name: string
  type: (typeof uniformTypeOptions)[number]
  defaultValue: string
  description: string
  min: string
  max: string
}

export type InputFormRow = {
  id: string
  name: string
  kind: (typeof inputKindOptions)[number]
  description: string
  required: boolean
}

export type OutputFormRow = {
  id: string
  name: string
  kind: (typeof outputKindOptions)[number]
  description: string
}

export type SourceFormRow = {
  id: string
  name: string
  kind: (typeof sourceReferenceKindOptions)[number]
  url: string
  repositoryUrl: string
  revision: string
  retrievedAt: string
  license: string
  authorsText: string
  copyrightNotice: string
  notes: string
}

export type RecipeFormState = {
  enabled: boolean
  summary: string
  requirements: Array<(typeof recipeRequirementOptions)[number]>
  code: string
}

export type SubmissionFormData = {
  name: string
  displayName: string
  version: string
  summary: string
  description: string
  authorName: string
  authorGithub: string
  authorUrl: string
  license: string
  category: string
  tagsText: string
  pipeline: (typeof pipelineOptions)[number]
  stage: (typeof stageOptions)[number]
  capabilityRequires: Array<(typeof capabilityRequirementOptions)[number]>
  capabilityOutputs: Array<(typeof outputKindOptions)[number]>
  threeRange: string
  renderers: Array<(typeof rendererOptions)[number]>
  material: (typeof materialOptions)[number]
  environments: Array<(typeof environmentOptions)[number]>
  uniforms: UniformFormRow[]
  inputs: InputFormRow[]
  outputs: OutputFormRow[]
  sourceKind: (typeof sourceKindOptions)[number]
  attributionSummary: string
  requiredNotice: string
  provenanceNotes: string
  sources: SourceFormRow[]
  vertexShader: string
  fragmentShader: string
  previewSvg: string
  threeRecipe: RecipeFormState
  r3fRecipe: RecipeFormState
}

export type DraftArtifact = {
  manifest: Record<string, unknown>
  files: Record<string, string>
}

const defaultPreviewSvg = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="preview" cx="50%" cy="48%" r="58%">
      <stop offset="0%" stop-color="#FDE4A7" />
      <stop offset="62%" stop-color="#56B9C4" />
      <stop offset="100%" stop-color="#132839" />
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#preview)" />
</svg>`

export function createUniformRow(): UniformFormRow {
  return {
    id: createId(),
    name: '',
    type: 'float',
    defaultValue: '',
    description: '',
    min: '',
    max: '',
  }
}

export function createInputRow(): InputFormRow {
  return {
    id: createId(),
    name: '',
    kind: 'uv',
    description: '',
    required: true,
  }
}

export function createOutputRow(): OutputFormRow {
  return {
    id: createId(),
    name: 'surfaceColor',
    kind: 'color',
    description: 'Primary color output for the shader.',
  }
}

export function createSourceRow(): SourceFormRow {
  return {
    id: createId(),
    name: '',
    kind: 'file',
    url: '',
    repositoryUrl: '',
    revision: '',
    retrievedAt: '',
    license: 'MIT',
    authorsText: '',
    copyrightNotice: '',
    notes: '',
  }
}

export function createDefaultFormData(): SubmissionFormData {
  return {
    name: '',
    displayName: '',
    version: '0.1.0',
    summary: '',
    description: '',
    authorName: '',
    authorGithub: '',
    authorUrl: '',
    license: 'MIT',
    category: 'surface',
    tagsText: 'surface, shaderbase',
    pipeline: 'surface',
    stage: 'vertex-and-fragment',
    capabilityRequires: ['uv'],
    capabilityOutputs: ['color'],
    threeRange: '>=0.160.0',
    renderers: ['webgl2'],
    material: 'shader-material',
    environments: ['three', 'react-three-fiber'],
    uniforms: [],
    inputs: [],
    outputs: [createOutputRow()],
    sourceKind: 'original',
    attributionSummary: 'Authored directly in the ShaderBase repository.',
    requiredNotice: '',
    provenanceNotes: '',
    sources: [],
    vertexShader: `varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
    fragmentShader: `precision highp float;

varying vec2 vUv;

void main() {
  gl_FragColor = vec4(vUv, 0.5, 1.0);
}
`,
    previewSvg: defaultPreviewSvg,
    threeRecipe: {
      enabled: true,
      summary: 'Create a ShaderMaterial for vanilla Three.js.',
      requirements: ['three-scene', 'mesh'],
      code: `import { ShaderMaterial } from "three";
import fragmentShader from "../fragment.glsl?raw";
import vertexShader from "../vertex.glsl?raw";

export function createShaderbaseMaterial() {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {},
  });
}
`,
    },
    r3fRecipe: {
      enabled: true,
      summary: 'Use the shader as a React Three Fiber material component.',
      requirements: ['canvas', 'mesh'],
      code: `import { ShaderMaterial } from "three";
import { useRef } from "react";
import fragmentShader from "../fragment.glsl?raw";
import vertexShader from "../vertex.glsl?raw";

export function ShaderbaseMaterial() {
  const materialRef = useRef<ShaderMaterial | null>(null);

  if (!materialRef.current) {
    materialRef.current = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {},
    });
  }

  return <primitive attach="material" object={materialRef.current} />;
}
`,
    },
  }
}

function requireText(label: string, value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    throw new Error(`${label} is required.`)
  }

  return trimmed
}

function optionalText(value: string) {
  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : undefined
}

function parseTags(text: string) {
  return text
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function parseNumericList(label: string, value: string, length: number) {
  const parsed = value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => !Number.isNaN(item))

  if (parsed.length !== length) {
    throw new Error(`${label} must contain ${length} comma-separated numbers.`)
  }

  return parsed
}

function parseUniformDefault(row: UniformFormRow) {
  switch (row.type) {
    case 'float':
      return Number(requireText(`Default value for ${row.name || 'uniform'}`, row.defaultValue))
    case 'int':
      return parseInt(requireText(`Default value for ${row.name || 'uniform'}`, row.defaultValue), 10)
    case 'bool': {
      const normalized = requireText(
        `Default value for ${row.name || 'uniform'}`,
        row.defaultValue,
      ).toLowerCase()

      if (normalized !== 'true' && normalized !== 'false') {
        throw new Error(`${row.name || 'Uniform'} bool default must be true or false.`)
      }

      return normalized === 'true'
    }
    case 'vec2':
      return parseNumericList(row.name || 'vec2 uniform', row.defaultValue, 2)
    case 'vec3':
    case 'color':
      return parseNumericList(row.name || 'vec3 uniform', row.defaultValue, 3)
    case 'vec4':
      return parseNumericList(row.name || 'vec4 uniform', row.defaultValue, 4)
    case 'mat3':
      return parseNumericList(row.name || 'mat3 uniform', row.defaultValue, 9)
    case 'mat4':
      return parseNumericList(row.name || 'mat4 uniform', row.defaultValue, 16)
    case 'sampler2D':
    case 'samplerCube': {
      const trimmed = row.defaultValue.trim()
      return trimmed.length > 0 ? trimmed : null
    }
  }
}

function sanitizeUniforms(rows: UniformFormRow[]) {
  return rows
    .filter((row) => row.name.trim() || row.description.trim() || row.defaultValue.trim())
    .map((row) => ({
      name: requireText('Uniform name', row.name),
      type: row.type,
      defaultValue: parseUniformDefault(row),
      description: requireText(`Description for ${row.name || 'uniform'}`, row.description),
      ...(optionalText(row.min) ? { min: Number(row.min) } : {}),
      ...(optionalText(row.max) ? { max: Number(row.max) } : {}),
    }))
}

function sanitizeInputs(rows: InputFormRow[]) {
  return rows
    .filter((row) => row.name.trim() || row.description.trim())
    .map((row) => ({
      name: requireText('Input name', row.name),
      kind: row.kind,
      description: requireText(`Description for ${row.name || 'input'}`, row.description),
      required: row.required,
    }))
}

function sanitizeOutputs(rows: OutputFormRow[]) {
  return rows
    .filter((row) => row.name.trim() || row.description.trim())
    .map((row) => ({
      name: requireText('Output name', row.name),
      kind: row.kind,
      description: requireText(`Description for ${row.name || 'output'}`, row.description),
    }))
}

function sanitizeSources(rows: SourceFormRow[]) {
  return rows
    .filter((row) => row.name.trim() || row.url.trim())
    .map((row) => ({
      name: requireText('Source name', row.name),
      kind: row.kind,
      url: requireText(`Source URL for ${row.name || 'source'}`, row.url),
      ...(optionalText(row.repositoryUrl)
        ? { repositoryUrl: optionalText(row.repositoryUrl) }
        : {}),
      ...(optionalText(row.revision) ? { revision: optionalText(row.revision) } : {}),
      retrievedAt: requireText(
        `Retrieval date for ${row.name || 'source'}`,
        row.retrievedAt,
      ),
      license: requireText(`License for ${row.name || 'source'}`, row.license),
      authors: parseTags(requireText(`Authors for ${row.name || 'source'}`, row.authorsText)),
      ...(optionalText(row.copyrightNotice)
        ? { copyrightNotice: optionalText(row.copyrightNotice) }
        : {}),
      ...(optionalText(row.notes) ? { notes: optionalText(row.notes) } : {}),
    }))
}

function sanitizeRecipe(
  target: 'three' | 'r3f',
  recipe: RecipeFormState,
): {
  filePath: string
  manifestEntry: Record<string, unknown>
  code: string
} | null {
  if (!recipe.enabled) {
    return null
  }

  const filePath = target === 'three' ? 'recipes/three.ts' : 'recipes/r3f.tsx'

  return {
    filePath,
    code: requireText(`${target} recipe code`, recipe.code),
    manifestEntry: {
      target,
      path: filePath,
      exportName: target === 'three' ? 'createShaderbaseMaterial' : 'ShaderbaseMaterial',
      summary: requireText(`${target} recipe summary`, recipe.summary),
      requirements: recipe.requirements,
    },
  }
}

export function buildDraftArtifact(form: SubmissionFormData): DraftArtifact {
  const recipes = [sanitizeRecipe('three', form.threeRecipe), sanitizeRecipe('r3f', form.r3fRecipe)].filter(
    (recipe): recipe is NonNullable<ReturnType<typeof sanitizeRecipe>> => recipe !== null,
  )

  if (recipes.length === 0) {
    throw new Error('Enable at least one recipe target.')
  }

  const files: Record<string, string> = {
    'vertex.glsl': requireText('Vertex shader', form.vertexShader),
    'fragment.glsl': requireText('Fragment shader', form.fragmentShader),
    'preview.svg': requireText('Preview SVG', form.previewSvg),
  }

  recipes.forEach((recipe) => {
    files[recipe.filePath] = recipe.code
  })

  return {
    manifest: {
      schemaVersion: '0.1.0',
      name: requireText('Shader name', form.name),
      displayName: requireText('Display name', form.displayName),
      version: requireText('Version', form.version),
      summary: requireText('Summary', form.summary),
      description: requireText('Description', form.description),
      author: {
        name: requireText('Author name', form.authorName),
        ...(optionalText(form.authorGithub)
          ? { github: optionalText(form.authorGithub) }
          : {}),
        ...(optionalText(form.authorUrl) ? { url: optionalText(form.authorUrl) } : {}),
      },
      license: requireText('License', form.license),
      tags: parseTags(form.tagsText),
      category: requireText('Category', form.category),
      capabilityProfile: {
        pipeline: form.pipeline,
        stage: form.stage,
        requires: form.capabilityRequires,
        outputs: form.capabilityOutputs,
      },
      compatibility: {
        three: requireText('Three.js range', form.threeRange),
        renderers: form.renderers,
        material: form.material,
        environments: form.environments,
      },
      uniforms: sanitizeUniforms(form.uniforms),
      inputs: sanitizeInputs(form.inputs),
      outputs: sanitizeOutputs(form.outputs),
      files: {
        vertex: 'vertex.glsl',
        fragment: 'fragment.glsl',
        includes: [],
      },
      recipes: recipes.map((recipe) => recipe.manifestEntry),
      preview: {
        path: 'preview.svg',
        format: 'svg',
        width: 512,
        height: 512,
        deterministic: true,
      },
      provenance: {
        sourceKind: form.sourceKind,
        sources: sanitizeSources(form.sources),
        attribution: {
          summary: requireText('Attribution summary', form.attributionSummary),
          ...(optionalText(form.requiredNotice)
            ? { requiredNotice: optionalText(form.requiredNotice) }
            : {}),
        },
        ...(optionalText(form.provenanceNotes)
          ? { notes: optionalText(form.provenanceNotes) }
          : {}),
      },
    },
    files,
  }
}
