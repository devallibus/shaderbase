import assert from 'node:assert/strict'
import { createShaderPR } from './github-pr.ts'
import type { CreateShaderPRInput } from './github-pr.ts'

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
// Mock data
// ---------------------------------------------------------------------------

const mockInput: CreateShaderPRInput = {
  name: 'test-shader',
  manifest: {
    schemaVersion: '0.1.0',
    name: 'test-shader',
    displayName: 'Test Shader',
    category: 'utility',
    summary: 'A test shader',
  },
  vertexSource: 'void main() { gl_Position = vec4(position, 1.0); }',
  fragmentSource: 'void main() { gl_FragColor = vec4(1.0); }',
  recipes: {
    three: {
      fileName: 'recipes/three.ts',
      code: 'export function createTestShaderMaterial() {}',
    },
  },
  previewSvg: '<svg></svg>',
}

const ghOpts = { token: 'fake-token', owner: 'testowner', repo: 'testrepo' }

// ---------------------------------------------------------------------------
// Mock fetch tracking API calls
// ---------------------------------------------------------------------------

type ApiCall = { url: string; method: string; body?: unknown }

function createMockFetch() {
  const calls: ApiCall[] = []
  let blobCounter = 0

  const mockFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(init.body as string) : undefined
    calls.push({ url, method, body })

    // Branch check — doesn't exist
    if (url.includes('/git/ref/heads/shader/') && method === 'GET') {
      return new Response('Not found', { status: 404 })
    }

    // Get latest commit on master
    if (url.includes('/git/ref/heads/master') && method === 'GET') {
      return new Response(
        JSON.stringify({ object: { sha: 'base-commit-sha' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Get commit data
    if (url.includes('/git/commits/base-commit-sha') && method === 'GET') {
      return new Response(
        JSON.stringify({ tree: { sha: 'base-tree-sha' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Create blob
    if (url.includes('/git/blobs') && method === 'POST') {
      blobCounter++
      return new Response(
        JSON.stringify({ sha: `blob-sha-${blobCounter}` }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Create tree
    if (url.includes('/git/trees') && method === 'POST') {
      return new Response(
        JSON.stringify({ sha: 'new-tree-sha' }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Create commit
    if (url.includes('/git/commits') && method === 'POST') {
      return new Response(
        JSON.stringify({ sha: 'new-commit-sha' }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Create ref (branch)
    if (url.includes('/git/refs') && method === 'POST') {
      return new Response(
        JSON.stringify({ ref: 'refs/heads/shader/test-shader' }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Create PR
    if (url.includes('/pulls') && method === 'POST') {
      return new Response(
        JSON.stringify({
          html_url: 'https://github.com/testowner/testrepo/pull/42',
          number: 42,
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      )
    }

    return new Response('Not found', { status: 404 })
  }

  return { mockFetch, calls }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {
  await runTest('creates a PR and returns URL and number', async () => {
    const { mockFetch } = createMockFetch()
    const result = await createShaderPR(mockInput, ghOpts, mockFetch)
    assert.equal(result.prUrl, 'https://github.com/testowner/testrepo/pull/42')
    assert.equal(result.prNumber, 42)
  })

  await runTest('creates correct number of blobs (manifest + vertex + fragment + recipe + preview)', async () => {
    const { mockFetch, calls } = createMockFetch()
    await createShaderPR(mockInput, ghOpts, mockFetch)
    const blobCalls = calls.filter((c) => c.url.includes('/git/blobs') && c.method === 'POST')
    assert.equal(blobCalls.length, 5) // manifest, vertex, fragment, recipe, preview
  })

  await runTest('commit message mentions CLI/MCP', async () => {
    const { mockFetch, calls } = createMockFetch()
    await createShaderPR(mockInput, ghOpts, mockFetch)
    const commitCall = calls.find((c) => c.url.includes('/git/commits') && c.method === 'POST')
    assert.ok(commitCall)
    assert.ok((commitCall!.body as { message: string }).message.includes('CLI/MCP'))
  })

  await runTest('PR body includes shader name and category', async () => {
    const { mockFetch, calls } = createMockFetch()
    await createShaderPR(mockInput, ghOpts, mockFetch)
    const prCall = calls.find((c) => c.url.includes('/pulls') && c.method === 'POST')
    assert.ok(prCall)
    const body = (prCall!.body as { body: string }).body
    assert.ok(body.includes('test-shader'))
    assert.ok(body.includes('utility'))
  })

  await runTest('throws on duplicate branch', async () => {
    const mockFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      // Branch exists
      if (url.includes('/git/ref/heads/shader/') && (init?.method ?? 'GET') === 'GET') {
        return new Response(JSON.stringify({ ref: 'exists' }), { status: 200 })
      }
      return new Response('Not found', { status: 404 })
    }

    await assert.rejects(
      () => createShaderPR(mockInput, ghOpts, mockFetch),
      /already exists/,
    )
  })

  await runTest('skips preview blob when previewSvg is undefined', async () => {
    const { mockFetch, calls } = createMockFetch()
    const inputNoPreview = { ...mockInput, previewSvg: undefined }
    await createShaderPR(inputNoPreview, ghOpts, mockFetch)
    const blobCalls = calls.filter((c) => c.url.includes('/git/blobs') && c.method === 'POST')
    assert.equal(blobCalls.length, 4) // manifest, vertex, fragment, recipe (no preview)
  })

  console.log('github-pr tests passed')
}

main()
