import assert from 'node:assert/strict'
import {
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

console.log('tsl-error-reporting tests passed')
