import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { listShadersFromDisk } from './list-shaders.ts'
import { loadShaderDetail } from './load-shader-detail.ts'

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

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '../../../../..')
const shadersRoot = resolve(repoRoot, 'shaders')
const shaderSourceModuleUrl = new URL('./shader-source.ts', import.meta.url)

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function importShaderSourceModule(
  cacheBust: string,
  registryUrl = 'https://registry.example',
) {
  const previousRegistryUrl = process.env.REGISTRY_URL
  process.env.REGISTRY_URL = registryUrl

  try {
    return await import(`${shaderSourceModuleUrl.href}?${cacheBust}`)
  } finally {
    if (previousRegistryUrl === undefined) {
      delete process.env.REGISTRY_URL
    } else {
      process.env.REGISTRY_URL = previousRegistryUrl
    }
  }
}

// ---------------------------------------------------------------------------
// listShadersFromDisk tests
// ---------------------------------------------------------------------------

async function main() {
  await runTest('listShadersFromDisk — returns all shaders from corpus', async () => {
    const shaders = await listShadersFromDisk(shadersRoot)
    assert.ok(shaders.length >= 3, `Expected at least 3 shaders, got ${shaders.length}`)
  })

  await runTest('listShadersFromDisk — each entry has required fields', async () => {
    const shaders = await listShadersFromDisk(shadersRoot)
    for (const shader of shaders) {
      assert.ok(shader.name, `Missing name on entry`)
      assert.ok(shader.displayName, `Missing displayName on ${shader.name}`)
      assert.ok(shader.summary, `Missing summary on ${shader.name}`)
      assert.ok(shader.category, `Missing category on ${shader.name}`)
      assert.ok(Array.isArray(shader.tags), `tags should be an array on ${shader.name}`)
      assert.ok(shader.tags.length > 0, `tags should be non-empty on ${shader.name}`)
      assert.ok(shader.pipeline, `Missing pipeline on ${shader.name}`)
    }
  })

  await runTest('listShadersFromDisk — gradient-radial entry has correct metadata', async () => {
    const shaders = await listShadersFromDisk(shadersRoot)
    const gr = shaders.find((s) => s.name === 'gradient-radial')
    assert.ok(gr, 'gradient-radial not found in shader list')
    assert.equal(gr.displayName, 'Radial Gradient')
    assert.equal(gr.category, 'color')
    assert.equal(gr.pipeline, 'surface')
    assert.equal(gr.stage, 'vertex-and-fragment')
    assert.equal(gr.sourceKind, 'original')
    assert.ok(gr.tags.includes('gradient'), 'Expected "gradient" tag')
    assert.ok(gr.tags.includes('radial'), 'Expected "radial" tag')
    assert.deepEqual(gr.renderers, ['webgl2'])
    assert.deepEqual(gr.environments, ['three', 'react-three-fiber'])
  })

  await runTest('listShadersFromDisk — returns empty for nonexistent directory', async () => {
    const shaders = await listShadersFromDisk(resolve(repoRoot, 'nonexistent-dir'))
    assert.equal(shaders.length, 0)
  })

  // ---------------------------------------------------------------------------
  // loadShaderDetail tests
  // ---------------------------------------------------------------------------

  await runTest('loadShaderDetail — loads full detail for gradient-radial', async () => {
    const detail = await loadShaderDetail(resolve(shadersRoot, 'gradient-radial'))
    assert.equal(detail.name, 'gradient-radial')
    assert.equal(detail.displayName, 'Radial Gradient')
    assert.equal(detail.version, '0.1.0')
    assert.equal(detail.category, 'color')
    assert.equal(detail.pipeline, 'surface')
    assert.equal(detail.license, 'MIT')
    assert.ok(detail.vertexSource.includes('vUv'), 'vertexSource should contain "vUv"')
    assert.ok(
      detail.fragmentSource.includes('uInnerColor'),
      'fragmentSource should contain "uInnerColor"',
    )
  })

  await runTest('loadShaderDetail — loads recipes with inlined code', async () => {
    const detail = await loadShaderDetail(resolve(shadersRoot, 'gradient-radial'))
    assert.ok(detail.recipes.length >= 2, `Expected at least 2 recipes, got ${detail.recipes.length}`)
    for (const recipe of detail.recipes) {
      assert.ok(recipe.target, 'recipe should have a target')
      assert.ok(typeof recipe.code === 'string', 'recipe code should be a string')
      assert.ok(recipe.code.length > 0, 'recipe code should not be empty')
      assert.ok(recipe.exportName, 'recipe should have an exportName')
      assert.ok(recipe.summary, 'recipe should have a summary')
    }
    const threeRecipe = detail.recipes.find((r) => r.target === 'three')
    assert.ok(threeRecipe, 'Should have a "three" recipe')
    assert.ok(
      threeRecipe.code.includes('createGradientRadialMaterial'),
      'three recipe should contain the export function',
    )
  })

  await runTest('loadShaderDetail — loads uniforms', async () => {
    const detail = await loadShaderDetail(resolve(shadersRoot, 'gradient-radial'))
    assert.ok(detail.uniforms.length >= 4, `Expected at least 4 uniforms, got ${detail.uniforms.length}`)

    const innerColor = detail.uniforms.find((u) => u.name === 'uInnerColor')
    assert.ok(innerColor, 'Should have uInnerColor uniform')
    assert.equal(innerColor.type, 'vec3')
    assert.ok(innerColor.description.length > 0, 'uniform should have a description')

    const radius = detail.uniforms.find((u) => u.name === 'uRadius')
    assert.ok(radius, 'Should have uRadius uniform')
    assert.equal(radius.type, 'float')
    assert.equal(radius.min, 0.05)
    assert.equal(radius.max, 1)
  })

  await runTest('loadShaderDetail — loads provenance', async () => {
    const detail = await loadShaderDetail(resolve(shadersRoot, 'gradient-radial'))
    assert.equal(detail.provenance.sourceKind, 'original')
    assert.ok(detail.provenance.attribution.summary.length > 0, 'attribution summary should exist')
  })

  await runTest('loadShaderDetail — loads preview SVG', async () => {
    const detail = await loadShaderDetail(resolve(shadersRoot, 'gradient-radial'))
    assert.ok(detail.previewSvg !== null, 'previewSvg should not be null for gradient-radial')
    assert.ok(detail.previewSvg!.includes('<svg'), 'previewSvg should contain SVG markup')
  })

  // ---------------------------------------------------------------------------
  // TSL shader detail tests
  // ---------------------------------------------------------------------------

  await runTest('loadShaderDetail — loads TSL shader with tslSource', async () => {
    const detail = await loadShaderDetail(resolve(shadersRoot, 'tsl-gradient-wave'))
    assert.equal(detail.language, 'tsl')
    assert.equal(detail.name, 'tsl-gradient-wave')
    assert.equal(detail.displayName, 'TSL Gradient Wave')
    assert.ok('tslSource' in detail, 'TSL detail should have tslSource')
    assert.ok(detail.tslSource.includes('createMaterial'), 'tslSource should contain createMaterial')
    assert.ok(!('vertexSource' in detail), 'TSL detail should not have vertexSource')
    assert.ok(!('fragmentSource' in detail), 'TSL detail should not have fragmentSource')
  })

  await runTest('loadShaderDetail — TSL shader has correct metadata', async () => {
    const detail = await loadShaderDetail(resolve(shadersRoot, 'tsl-gradient-wave'))
    assert.equal(detail.category, 'color')
    assert.equal(detail.pipeline, 'surface')
    assert.equal(detail.material, 'node-material')
    assert.deepEqual(detail.renderers, ['webgpu'])
    assert.ok(detail.tags.includes('tsl'), 'Expected "tsl" tag')
  })

  await runTest('loadShaderDetail — TSL shader loads recipes', async () => {
    const detail = await loadShaderDetail(resolve(shadersRoot, 'tsl-gradient-wave'))
    assert.ok(detail.recipes.length >= 1, 'Expected at least 1 recipe')
    const threeRecipe = detail.recipes.find((r) => r.target === 'three')
    assert.ok(threeRecipe, 'Should have a "three" recipe')
    assert.ok(threeRecipe.code.length > 0, 'recipe code should not be empty')
  })

  await runTest('loadShaderDetail — GLSL shader has language glsl', async () => {
    const detail = await loadShaderDetail(resolve(shadersRoot, 'gradient-radial'))
    assert.equal(detail.language, 'glsl')
    assert.ok('vertexSource' in detail, 'GLSL detail should have vertexSource')
    assert.ok('fragmentSource' in detail, 'GLSL detail should have fragmentSource')
    assert.ok(!('tslSource' in detail), 'GLSL detail should not have tslSource')
  })

  await runTest('getShaderDetailFromSource â€” registry-backed TSL bundle returns tslSource', async () => {
    const { getShaderDetailFromSource } = await importShaderSourceModule('registry-tsl')
    const originalFetch = globalThis.fetch

    globalThis.fetch = (async (input) => {
      assert.equal(String(input), 'https://registry.example/shaders/tsl-gradient-wave.json')
      return jsonResponse({
        name: 'tsl-gradient-wave',
        displayName: 'TSL Gradient Wave',
        version: '0.1.0',
        summary: 'Registry-backed TSL shader',
        description: 'Registry-backed TSL shader detail',
        author: { name: 'ShaderBase' },
        license: 'MIT',
        tags: ['tsl', 'wave'],
        category: 'color',
        language: 'tsl',
        compatibility: {
          three: '>=0.170.0',
          renderers: ['webgpu'],
          material: 'node-material',
          environments: ['three'],
        },
        capabilityProfile: {
          pipeline: 'surface',
          stage: 'vertex-and-fragment',
          requires: ['uv', 'time'],
          outputs: ['color'],
        },
        uniformsFull: [],
        inputs: [],
        outputs: [{ name: 'surfaceColor', kind: 'color', description: 'Color output' }],
        recipes: {
          three: {
            exportName: 'createTslGradientWaveMaterial',
            summary: 'Create a TSL material',
            code: 'export function createTslGradientWaveMaterial() {}',
            placeholders: [],
            requirements: ['three-scene'],
          },
        },
        provenance: {
          sourceKind: 'original',
          sources: [],
          attribution: { summary: 'Created in ShaderBase' },
        },
        tslSource: 'export function createMaterial() {}',
      })
    }) as typeof fetch

    try {
      const detail = await getShaderDetailFromSource('tsl-gradient-wave')
      assert.equal(detail.language, 'tsl')
      assert.ok('tslSource' in detail, 'TSL detail should have tslSource')
      assert.equal(detail.tslSource, 'export function createMaterial() {}')
      assert.ok(!('vertexSource' in detail), 'TSL detail should not have vertexSource')
      assert.ok(!('fragmentSource' in detail), 'TSL detail should not have fragmentSource')
      assert.equal(detail.previewSvg, null)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  await runTest('getShaderDetailFromSource â€” registry-backed GLSL bundle returns GLSL sources', async () => {
    const { getShaderDetailFromSource } = await importShaderSourceModule('registry-glsl')
    const originalFetch = globalThis.fetch

    globalThis.fetch = (async (input) => {
      assert.equal(String(input), 'https://registry.example/shaders/gradient-radial.json')
      return jsonResponse({
        name: 'gradient-radial',
        displayName: 'Radial Gradient',
        version: '0.1.0',
        summary: 'Registry-backed GLSL shader',
        description: 'Registry-backed GLSL shader detail',
        author: { name: 'ShaderBase' },
        license: 'MIT',
        tags: ['glsl', 'gradient'],
        category: 'color',
        language: 'glsl',
        compatibility: {
          three: '>=0.160.0',
          renderers: ['webgl2'],
          material: 'shader-material',
          environments: ['three', 'react-three-fiber'],
        },
        capabilityProfile: {
          pipeline: 'surface',
          stage: 'vertex-and-fragment',
          requires: ['uv', 'time'],
          outputs: ['color'],
        },
        uniformsFull: [],
        inputs: [],
        outputs: [{ name: 'color', kind: 'color', description: 'Color output' }],
        recipes: {
          three: {
            exportName: 'createGradientRadialMaterial',
            summary: 'Create a GLSL material',
            code: 'export function createGradientRadialMaterial() {}',
            placeholders: [],
            requirements: ['three-scene'],
          },
        },
        provenance: {
          sourceKind: 'original',
          sources: [],
          attribution: { summary: 'Created in ShaderBase' },
        },
        vertexSource: 'void main() { gl_Position = vec4(position, 1.0); }',
        fragmentSource: 'void main() { gl_FragColor = vec4(1.0); }',
      })
    }) as typeof fetch

    try {
      const detail = await getShaderDetailFromSource('gradient-radial')
      assert.equal(detail.language, 'glsl')
      assert.ok('vertexSource' in detail, 'GLSL detail should have vertexSource')
      assert.ok('fragmentSource' in detail, 'GLSL detail should have fragmentSource')
      assert.ok(!('tslSource' in detail), 'GLSL detail should not have tslSource')
      assert.ok(detail.vertexSource.includes('gl_Position'))
      assert.ok(detail.fragmentSource.includes('gl_FragColor'))
      assert.equal(detail.previewSvg, null)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  console.log('shaders tests passed')
}

main()
