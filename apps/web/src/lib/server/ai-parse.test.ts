import assert from 'node:assert/strict'
import { resolveSource } from './resolve-source.ts'

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
// Mock fetch
// ---------------------------------------------------------------------------

const MOCK_SHADERTOY_CODE = 'void mainImage(out vec4 fragColor, in vec2 fragCoord) { fragColor = vec4(1.0); }'

function createMockFetch() {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

    // Shadertoy API
    if (url.includes('shadertoy.com/api/v1/shaders/')) {
      const idMatch = url.match(/shaders\/([A-Za-z0-9]+)\?/)
      const id = idMatch?.[1]

      if (id === 'notfound') {
        return new Response('Not found', { status: 404 })
      }

      if (id === 'empty') {
        return new Response(
          JSON.stringify({
            Shader: {
              info: { name: 'Empty Shader', username: 'testuser' },
              renderpass: [{ code: '' }],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      return new Response(
        JSON.stringify({
          Shader: {
            info: { name: 'Test Shader', username: 'iq' },
            renderpass: [{ code: MOCK_SHADERTOY_CODE }],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // GitHub Gist API
    if (url.includes('api.github.com/gists/')) {
      return new Response(
        JSON.stringify({
          description: 'My cool shader gist',
          owner: { login: 'gistuser' },
          files: {
            'shader.glsl': {
              filename: 'shader.glsl',
              content: 'void main() { gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0); }',
            },
            'notes.txt': {
              filename: 'notes.txt',
              content: 'Some notes',
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // GitHub raw file
    if (url.includes('raw.githubusercontent.com/')) {
      return new Response(
        'uniform float uTime;\nvoid main() { gl_FragColor = vec4(uTime); }',
        { status: 200, headers: { 'Content-Type': 'text/plain' } },
      )
    }

    return new Response('Not found', { status: 404 })
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const mockFetch = createMockFetch()

async function main() {
  await runTest('returns plain GLSL as-is', async () => {
    const glsl = 'void main() { gl_FragColor = vec4(1.0); }'
    const result = await resolveSource(glsl, mockFetch)
    assert.equal(result.sourceType, 'glsl')
    assert.equal(result.code, glsl)
    assert.equal(result.metadata, undefined)
  })

  await runTest('trims whitespace from plain GLSL', async () => {
    const glsl = '  void main() { gl_FragColor = vec4(1.0); }  '
    const result = await resolveSource(glsl, mockFetch)
    assert.equal(result.sourceType, 'glsl')
    assert.equal(result.code, glsl.trim())
  })

  await runTest('resolves Shadertoy URL', async () => {
    const result = await resolveSource(
      'https://www.shadertoy.com/view/XsXXDn',
      mockFetch,
    )
    assert.equal(result.sourceType, 'shadertoy')
    assert.equal(result.code, MOCK_SHADERTOY_CODE)
    assert.equal(result.metadata?.title, 'Test Shader')
    assert.equal(result.metadata?.author, 'iq')
    assert.equal(result.metadata?.url, 'https://www.shadertoy.com/view/XsXXDn')
  })

  await runTest('resolves GitHub gist URL', async () => {
    const result = await resolveSource(
      'https://gist.github.com/gistuser/abc123def456',
      mockFetch,
    )
    assert.equal(result.sourceType, 'gist')
    assert.ok(result.code.includes('gl_FragColor'))
    assert.equal(result.metadata?.title, 'My cool shader gist')
    assert.equal(result.metadata?.author, 'gistuser')
    assert.equal(result.metadata?.url, 'https://gist.github.com/abc123def456')
  })

  await runTest('resolves GitHub gist URL and prefers .glsl file', async () => {
    const result = await resolveSource(
      'https://gist.github.com/gistuser/abc123def456',
      mockFetch,
    )
    // Should pick shader.glsl over notes.txt
    assert.ok(result.code.includes('gl_FragColor'))
    assert.ok(!result.code.includes('Some notes'))
  })

  await runTest('resolves GitHub file URL', async () => {
    const result = await resolveSource(
      'https://github.com/user/repo/blob/main/shaders/effect.glsl',
      mockFetch,
    )
    assert.equal(result.sourceType, 'github-file')
    assert.ok(result.code.includes('uTime'))
    assert.equal(result.metadata?.author, 'user')
    assert.equal(
      result.metadata?.url,
      'https://github.com/user/repo/blob/main/shaders/effect.glsl',
    )
  })

  await runTest('throws on Shadertoy API error', async () => {
    await assert.rejects(
      () =>
        resolveSource(
          'https://www.shadertoy.com/view/notfound',
          mockFetch,
        ),
      /Shadertoy API returned 404/,
    )
  })

  await runTest('throws on empty Shadertoy response', async () => {
    await assert.rejects(
      () =>
        resolveSource(
          'https://www.shadertoy.com/view/empty',
          mockFetch,
        ),
      /No shader code found in Shadertoy response/,
    )
  })

  console.log('ai-parse tests passed')
}

main()
