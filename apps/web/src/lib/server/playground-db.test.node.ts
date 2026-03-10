import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'playground-test-'))

const {
  createSession,
  getSession,
  updateShader,
  setScreenshot,
  setErrors,
  setStructuredErrors,
  setUniformValues,
  updateMetadata,
} = await import('./playground-db.ts')

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

runTest('createSession returns default GLSL session', () => {
  const { id, session } = createSession()
  assert.equal(typeof id, 'string')
  assert.equal(session.id, id)
  assert.equal(session.language, 'glsl')
  assert.ok(session.vertexSource.includes('gl_Position'))
  assert.ok(session.fragmentSource.includes('gl_FragColor'))
  assert.equal(session.pipeline, 'surface')
  assert.equal(session.uniforms.length, 1)
  assert.equal(session.uniforms[0]!.name, 'uTime')
  assert.deepEqual(session.compilationErrors, [])
  assert.deepEqual(session.structuredErrors, [])
  assert.equal(session.screenshotBase64, null)
  assert.equal(session.metadata, null)
})

runTest('createSession accepts custom GLSL', () => {
  const { session } = createSession({
    vertexSource: 'void main() { gl_Position = vec4(0.0); }',
    fragmentSource: 'void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }',
    pipeline: 'postprocessing',
    uniforms: [{ name: 'uColor', type: 'vec3', defaultValue: [1, 0, 0] }],
  })
  assert.equal(session.language, 'glsl')
  assert.ok(session.vertexSource.includes('vec4(0.0)'))
  assert.ok(session.fragmentSource.includes('1.0, 0.0, 0.0'))
  assert.equal(session.pipeline, 'postprocessing')
})

runTest('createSession accepts TSL without GLSL payloads', () => {
  const { session } = createSession({
    language: 'tsl',
    tslSource: 'export function createMaterial() {}',
    pipeline: 'geometry',
  })
  assert.equal(session.language, 'tsl')
  assert.equal(session.tslSource, 'export function createMaterial() {}')
  assert.equal(session.pipeline, 'geometry')
})

runTest('createSession rejects tslSource on GLSL sessions', () => {
  assert.throws(
    () => createSession({ tslSource: 'export function createMaterial() {}' }),
    /GLSL sessions do not accept tslSource/,
  )
})

runTest('createSession rejects GLSL source fields on TSL sessions', () => {
  assert.throws(
    () =>
      createSession({
        language: 'tsl',
        tslSource: 'export function createMaterial() {}',
        vertexSource: 'void main() {}',
      }),
    /TSL sessions do not accept vertexSource/,
  )
})

runTest('createSession rejects TSL postprocessing sessions', () => {
  assert.throws(
    () =>
      createSession({
        language: 'tsl',
        tslSource: 'export function createMaterial() {}',
        pipeline: 'postprocessing',
      }),
    /TSL sessions do not support the postprocessing pipeline/,
  )
})

runTest('getSession returns null for unknown id', () => {
  assert.equal(getSession('nonexistent-id'), null)
})

runTest('updateShader updates GLSL sources', () => {
  const { id } = createSession()
  updateShader(id, { vertexSource: 'vertex shader', fragmentSource: 'fragment shader' }, 'glsl')
  const session = getSession(id)!
  assert.equal(session.language, 'glsl')
  assert.equal(session.vertexSource, 'vertex shader')
  assert.equal(session.fragmentSource, 'fragment shader')
})

runTest('updateShader updates TSL source', () => {
  const { id } = createSession({ language: 'tsl', tslSource: 'old tsl' })
  updateShader(id, { tslSource: 'new tsl' }, 'tsl')
  const session = getSession(id)!
  assert.equal(session.language, 'tsl')
  assert.equal(session.tslSource, 'new tsl')
})

runTest('updateShader rejects mismatched GLSL fields for TSL sessions', () => {
  const { id } = createSession({ language: 'tsl', tslSource: 'old tsl' })
  assert.throws(
    () => updateShader(id, { vertexSource: 'bad' }, 'tsl'),
    /TSL sessions do not accept vertexSource updates/,
  )
})

runTest('updateShader rejects mismatched TSL fields for GLSL sessions', () => {
  const { id } = createSession()
  assert.throws(
    () => updateShader(id, { tslSource: 'bad' }, 'glsl'),
    /GLSL sessions do not accept tslSource updates/,
  )
})

runTest('updateShader with empty object is a no-op', () => {
  const { id, session: original } = createSession()
  updateShader(id, {}, 'glsl')
  const session = getSession(id)!
  assert.equal(session.language, 'glsl')
  assert.equal(session.vertexSource, original.vertexSource)
  assert.equal(session.fragmentSource, original.fragmentSource)
})

runTest('setScreenshot stores base64 data', () => {
  const { id } = createSession()
  setScreenshot(id, 'data:image/png;base64,abc123')
  const session = getSession(id)!
  assert.equal(session.screenshotBase64, 'data:image/png;base64,abc123')
  assert.ok(session.screenshotAt)
})

runTest('setErrors stores compilation errors', () => {
  const { id } = createSession()
  const errors = ["ERROR: 0:5: 'foo' : undeclared identifier", 'ERROR: 0:10: syntax error']
  setErrors(id, errors)
  const session = getSession(id)!
  assert.deepEqual(session.compilationErrors, errors)
})

runTest('setStructuredErrors stores structured errors', () => {
  const { id } = createSession({ language: 'tsl', tslSource: 'export function createMaterial() {}' })
  const errors = [{ kind: 'tsl-runtime', message: 'createMaterial failed' }] as const
  setStructuredErrors(id, [...errors])
  const session = getSession(id)!
  assert.deepEqual(session.structuredErrors, errors)
})

runTest('setUniformValues stores values', () => {
  const { id } = createSession()
  const values = { uTime: 1.5, uColor: [1, 0, 0] }
  setUniformValues(id, values)
  const session = getSession(id)!
  assert.deepEqual(session.uniformValues, values)
})

runTest('updateMetadata stores metadata', () => {
  const { id } = createSession()
  const metadata = { name: 'test-shader', displayName: 'Test Shader', summary: 'A test', tags: ['test'] }
  updateMetadata(id, metadata)
  const session = getSession(id)!
  assert.deepEqual(session.metadata, metadata)
})

runTest('createSession rejects invalid language', () => {
  assert.throws(
    () => createSession({ language: 'foo' as 'glsl' }),
    /Invalid language "foo"/,
  )
})

runTest('createSession rejects arbitrary language strings', () => {
  assert.throws(
    () => createSession({ language: 'wgsl' as 'glsl' }),
    /Invalid language "wgsl"/,
  )
})

console.log('playground-db tests passed')
