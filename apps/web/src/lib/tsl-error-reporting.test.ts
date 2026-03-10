import assert from 'node:assert/strict'
import {
  createKnownTslErrorReport,
  createPlainErrorReport,
  createTslErrorReport,
  TslPreviewError,
} from './tsl-error-reporting.ts'

function runTest(name: string, callback: () => void) {
  callback()
  console.log(`ok ${name}`)
}

runTest('createPlainErrorReport keeps structured errors empty', () => {
  assert.deepEqual(createPlainErrorReport(['plain error']), {
    errors: ['plain error'],
    structuredErrors: [],
  })
})

runTest('createTslErrorReport preserves explicit preview error kinds', () => {
  const report = createTslErrorReport(
    new TslPreviewError('tsl-material-build', 'createPreview(runtime) must return a material.'),
    'tsl-runtime',
    'fallback',
  )

  assert.deepEqual(report, {
    errors: ['createPreview(runtime) must return a material.'],
    structuredErrors: [{
      kind: 'tsl-material-build',
      message: 'createPreview(runtime) must return a material.',
    }],
  })
})

runTest('createTslErrorReport maps SyntaxError to tsl-parse', () => {
  const report = createTslErrorReport(
    new SyntaxError('Unexpected token'),
    'tsl-runtime',
    'fallback',
  )

  assert.deepEqual(report, {
    errors: ['Unexpected token'],
    structuredErrors: [{
      kind: 'tsl-parse',
      message: 'Unexpected token',
    }],
  })
})

runTest('createTslErrorReport falls back to the provided kind for plain Error', () => {
  const report = createTslErrorReport(
    new Error('Material compilation failed'),
    'tsl-runtime',
    'fallback',
  )

  assert.deepEqual(report, {
    errors: ['Material compilation failed'],
    structuredErrors: [{
      kind: 'tsl-runtime',
      message: 'Material compilation failed',
    }],
  })
})

runTest('createKnownTslErrorReport creates a structured TSL error directly', () => {
  const report = createKnownTslErrorReport('tsl-runtime', 'WebGPU is not available in this browser.')

  assert.deepEqual(report, {
    errors: ['WebGPU is not available in this browser.'],
    structuredErrors: [{
      kind: 'tsl-runtime',
      message: 'WebGPU is not available in this browser.',
    }],
  })
})

console.log('tsl-error-reporting tests passed')
