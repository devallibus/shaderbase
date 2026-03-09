import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Isolate test DB in a temp directory so runs are idempotent
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'playground-test-'))

const {
  createSession,
  getSession,
  updateShader,
  setScreenshot,
  setErrors,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

runTest('createSession returns id and session with defaults', () => {
  const { id, session } = createSession()
  assert.equal(typeof id, 'string')
  assert.ok(id.length > 0)
  assert.equal(session.id, id)
  assert.ok(session.vertexSource.includes('gl_Position'))
  assert.ok(session.fragmentSource.includes('gl_FragColor'))
  assert.equal(session.pipeline, 'surface')
  assert.equal(session.uniforms.length, 1)
  assert.equal(session.uniforms[0]!.name, 'uTime')
  assert.deepEqual(session.compilationErrors, [])
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
  assert.ok(session.vertexSource.includes('vec4(0.0)'))
  assert.ok(session.fragmentSource.includes('1.0, 0.0, 0.0'))
  assert.equal(session.pipeline, 'postprocessing')
  assert.equal(session.uniforms.length, 1)
  assert.equal(session.uniforms[0]!.name, 'uColor')
})

runTest('getSession returns null for unknown id', () => {
  const session = getSession('nonexistent-id')
  assert.equal(session, null)
})

runTest('getSession returns created session', () => {
  const { id } = createSession()
  const session = getSession(id)
  assert.ok(session)
  assert.equal(session.id, id)
})

runTest('updateShader updates vertex source', () => {
  const { id } = createSession()
  const newVertex = 'void main() { gl_Position = vec4(1.0); }'
  updateShader(id, { vertexSource: newVertex })
  const session = getSession(id)!
  assert.equal(session.vertexSource, newVertex)
  // Fragment should remain the default
  assert.ok(session.fragmentSource.includes('gl_FragColor'))
})

runTest('updateShader updates fragment source', () => {
  const { id } = createSession()
  const newFrag = 'void main() { gl_FragColor = vec4(0.0); }'
  updateShader(id, { fragmentSource: newFrag })
  const session = getSession(id)!
  assert.equal(session.fragmentSource, newFrag)
})

runTest('updateShader updates both sources', () => {
  const { id } = createSession()
  const newVertex = 'vertex shader'
  const newFrag = 'fragment shader'
  updateShader(id, { vertexSource: newVertex, fragmentSource: newFrag })
  const session = getSession(id)!
  assert.equal(session.vertexSource, newVertex)
  assert.equal(session.fragmentSource, newFrag)
})

runTest('updateShader with empty object is a no-op', () => {
  const { id, session: original } = createSession()
  updateShader(id, {})
  const session = getSession(id)!
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

runTest('setErrors with empty array clears errors', () => {
  const { id } = createSession()
  setErrors(id, ['some error'])
  setErrors(id, [])
  const session = getSession(id)!
  assert.deepEqual(session.compilationErrors, [])
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

runTest('updateMetadata overwrites previous metadata', () => {
  const { id } = createSession()
  updateMetadata(id, { name: 'old' })
  updateMetadata(id, { name: 'new', tags: ['updated'] })
  const session = getSession(id)!
  assert.equal(session.metadata!.name, 'new')
  assert.deepEqual(session.metadata!.tags, ['updated'])
})

runTest('multiple sessions are independent', () => {
  const { id: id1 } = createSession({ fragmentSource: 'shader1' })
  const { id: id2 } = createSession({ fragmentSource: 'shader2' })
  assert.notEqual(id1, id2)
  assert.equal(getSession(id1)!.fragmentSource, 'shader1')
  assert.equal(getSession(id2)!.fragmentSource, 'shader2')
})

console.log('playground-db tests passed')
