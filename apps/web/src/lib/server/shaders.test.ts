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

  console.log('shaders tests passed')
}

main()
