import assert from 'node:assert/strict'
import { runSubmit } from './submit.ts'

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

async function main() {
  await runTest('rejects invalid repo format', async () => {
    await assert.rejects(
      () =>
        runSubmit({
          source: 'void main() {}',
          anthropicApiKey: 'fake',
          githubToken: 'fake',
          repo: 'invalid-no-slash',
        }),
      /owner\/repo/,
    )
  })

  console.log('submit command tests passed')
}

main()
