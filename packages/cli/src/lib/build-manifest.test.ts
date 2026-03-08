import assert from 'node:assert/strict'
import { buildManifest } from './build-manifest.ts'
import type { AiParsedShader } from './ai-parse.ts'

function runTest(name: string, callback: () => void | Promise<void>) {
  const result = callback()
  if (result instanceof Promise) {
    result.then(
      () => console.log(`ok ${name}`),
      (error) => {
        console.error(`not ok ${name}`)
        throw error
      },
    )
    return result
  }
  console.log(`ok ${name}`)
}

// ---------------------------------------------------------------------------
// Mock AI-parsed data
// ---------------------------------------------------------------------------

const mockParsed: AiParsedShader = {
  name: 'test-shader',
  displayName: 'Test Shader',
  summary: 'A test shader for unit testing',
  description: 'This is a test shader used in unit tests.',
  authorName: 'Test Author',
  category: 'utility',
  tagsText: 'test, utility, unit-test',
  pipeline: 'surface',
  stage: 'fragment',
  capabilityRequires: ['uv'],
  capabilityOutputs: ['color'],
  material: 'shader-material',
  sourceKind: 'original',
  attributionSummary: 'Original work by Test Author.',
  uniforms: [
    {
      name: 'uColor',
      type: 'vec3',
      defaultValue: '1.0, 0.5, 0.0',
      description: 'The main color',
      min: '0',
      max: '1',
    },
    {
      name: 'uIntensity',
      type: 'float',
      defaultValue: '0.8',
      description: 'Effect intensity',
      min: '0',
      max: '2',
    },
    {
      name: 'uEnabled',
      type: 'bool',
      defaultValue: 'true',
      description: 'Enable effect',
      min: '',
      max: '',
    },
  ],
  inputs: [
    {
      name: 'vUv',
      kind: 'uv',
      description: 'UV coordinates',
      required: true,
    },
  ],
  outputs: [
    {
      name: 'gl_FragColor',
      kind: 'color',
      description: 'Final fragment color',
    },
  ],
  vertexShader: 'void main() { gl_Position = vec4(position, 1.0); }',
  fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {
  runTest('builds manifest with correct top-level fields', () => {
    const manifest = buildManifest(mockParsed)
    assert.equal(manifest.schemaVersion, '0.1.0')
    assert.equal(manifest.name, 'test-shader')
    assert.equal(manifest.displayName, 'Test Shader')
    assert.equal(manifest.version, '0.1.0')
    assert.equal(manifest.summary, 'A test shader for unit testing')
    assert.equal(manifest.license, 'MIT')
    assert.equal(manifest.category, 'utility')
  })

  runTest('parses tags from comma-separated string', () => {
    const manifest = buildManifest(mockParsed)
    assert.deepEqual(manifest.tags, ['test', 'utility', 'unit-test'])
  })

  runTest('builds capability profile', () => {
    const manifest = buildManifest(mockParsed)
    const profile = manifest.capabilityProfile as Record<string, unknown>
    assert.equal(profile.pipeline, 'surface')
    assert.equal(profile.stage, 'fragment')
    assert.deepEqual(profile.requires, ['uv'])
    assert.deepEqual(profile.outputs, ['color'])
  })

  runTest('parses uniform defaults correctly', () => {
    const manifest = buildManifest(mockParsed)
    const uniforms = manifest.uniforms as Array<Record<string, unknown>>
    assert.equal(uniforms.length, 3)

    // vec3 default → array
    assert.deepEqual(uniforms[0]!.defaultValue, [1.0, 0.5, 0.0])
    assert.equal(uniforms[0]!.min, 0)
    assert.equal(uniforms[0]!.max, 1)

    // float default → number
    assert.equal(uniforms[1]!.defaultValue, 0.8)

    // bool default → boolean
    assert.equal(uniforms[2]!.defaultValue, true)
    // No min/max for bool
    assert.equal(uniforms[2]!.min, undefined)
    assert.equal(uniforms[2]!.max, undefined)
  })

  runTest('builds provenance for original source', () => {
    const manifest = buildManifest(mockParsed)
    const provenance = manifest.provenance as Record<string, unknown>
    assert.equal(provenance.sourceKind, 'original')
    assert.deepEqual(provenance.sources, [])
  })

  runTest('builds provenance for adapted source with metadata', () => {
    const adaptedParsed = { ...mockParsed, sourceKind: 'adapted' as const }
    const manifest = buildManifest(adaptedParsed, {
      sourceType: 'shadertoy',
      url: 'https://www.shadertoy.com/view/XsXXDn',
      title: 'Creation',
      author: 'iq',
    })
    const provenance = manifest.provenance as Record<string, unknown>
    assert.equal(provenance.sourceKind, 'adapted')
    const sources = provenance.sources as Array<Record<string, unknown>>
    assert.equal(sources.length, 1)
    assert.equal(sources[0]!.kind, 'demo')
    assert.equal(sources[0]!.url, 'https://www.shadertoy.com/view/XsXXDn')
  })

  runTest('includes recipe with correct export name', () => {
    const manifest = buildManifest(mockParsed)
    const recipes = manifest.recipes as Array<Record<string, unknown>>
    assert.equal(recipes.length, 1)
    assert.equal(recipes[0]!.exportName, 'createTestShaderMaterial')
    assert.equal(recipes[0]!.target, 'three')
  })

  runTest('builds files section', () => {
    const manifest = buildManifest(mockParsed)
    const files = manifest.files as Record<string, unknown>
    assert.equal(files.vertex, 'vertex.glsl')
    assert.equal(files.fragment, 'fragment.glsl')
  })

  console.log('build-manifest tests passed')
}

main()
