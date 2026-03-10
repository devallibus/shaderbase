import assert from 'node:assert/strict'
import { collectShaderDiagnostics, diagnosticsToMessages } from './webgl-shader-errors.ts'

function runTest(name: string, callback: () => void) {
  callback()
  console.log(`ok ${name}`)
}

type MockShader = {
  ok: boolean
  log: string | null
}

type MockProgram = {
  log: string | null
}

const mockGl = {
  COMPILE_STATUS: 1,
  getProgramInfoLog(program: unknown) {
    return (program as MockProgram).log
  },
  getShaderInfoLog(shader: unknown) {
    return (shader as MockShader).log
  },
  getShaderParameter(shader: unknown) {
    return (shader as MockShader).ok
  },
}

runTest('collectShaderDiagnostics returns shader and link logs', () => {
  const diagnostics = collectShaderDiagnostics({
    gl: mockGl,
    program: { log: 'Program Info Log: link failed' },
    vertexShader: { ok: false, log: 'VERTEX ERROR: undeclared identifier' },
    fragmentShader: { ok: false, log: 'FRAGMENT ERROR: syntax error' },
  })

  assert.deepEqual(diagnostics, [
    { kind: 'glsl-compile', message: 'VERTEX ERROR: undeclared identifier' },
    { kind: 'glsl-compile', message: 'FRAGMENT ERROR: syntax error' },
    { kind: 'glsl-link', message: 'Program Info Log: link failed' },
  ])
  assert.deepEqual(diagnosticsToMessages(diagnostics), [
    'VERTEX ERROR: undeclared identifier',
    'FRAGMENT ERROR: syntax error',
    'Program Info Log: link failed',
  ])
})

runTest('collectShaderDiagnostics falls back to a generic compile message', () => {
  const diagnostics = collectShaderDiagnostics({
    gl: mockGl,
    program: { log: null },
    vertexShader: { ok: false, log: null },
    fragmentShader: { ok: true, log: null },
  })

  assert.deepEqual(diagnostics, [
    { kind: 'glsl-compile', message: 'GLSL shader compilation failed.' },
  ])
})

console.log('webgl-shader-errors tests passed')
