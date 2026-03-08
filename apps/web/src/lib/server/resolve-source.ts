export type ResolvedSource = {
  code: string
  sourceType: 'glsl' | 'shadertoy' | 'gist' | 'github-file'
  metadata?: { title?: string; author?: string; url?: string }
}

export async function resolveSource(
  rawInput: string,
  fetchFn: typeof fetch = fetch,
): Promise<ResolvedSource> {
  const input = rawInput.trim()

  // Shadertoy URL
  const shadertoyMatch = input.match(/shadertoy\.com\/view\/([A-Za-z0-9]+)/)
  if (shadertoyMatch) {
    const id = shadertoyMatch[1]
    const apiUrl = `https://www.shadertoy.com/api/v1/shaders/${id}?key=BdHjRn`
    const resp = await fetchFn(apiUrl)
    if (!resp.ok) throw new Error(`Shadertoy API returned ${resp.status}`)
    const json = (await resp.json()) as {
      Shader?: {
        info?: { name?: string; username?: string }
        renderpass?: Array<{ code?: string }>
      }
    }
    const shader = json.Shader
    const code = shader?.renderpass?.[0]?.code ?? ''
    if (!code) throw new Error('No shader code found in Shadertoy response')
    return {
      code,
      sourceType: 'shadertoy',
      metadata: {
        title: shader?.info?.name,
        author: shader?.info?.username,
        url: `https://www.shadertoy.com/view/${id}`,
      },
    }
  }

  // GitHub gist URL
  const gistMatch = input.match(/gist\.github\.com\/(?:[^/]+\/)?([a-f0-9]+)/)
  if (gistMatch) {
    const id = gistMatch[1]
    const resp = await fetchFn(`https://api.github.com/gists/${id}`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    })
    if (!resp.ok) throw new Error(`GitHub API returned ${resp.status}`)
    const json = (await resp.json()) as {
      description?: string
      owner?: { login?: string }
      files?: Record<string, { content?: string; filename?: string }>
    }
    const files = Object.values(json.files ?? {})
    const glslFile = files.find(
      (f) =>
        f.filename?.endsWith('.glsl') ||
        f.filename?.endsWith('.frag') ||
        f.filename?.endsWith('.vert'),
    )
    const code = glslFile?.content ?? files[0]?.content ?? ''
    if (!code) throw new Error('No files found in gist')
    return {
      code,
      sourceType: 'gist',
      metadata: {
        title: json.description ?? undefined,
        author: json.owner?.login ?? undefined,
        url: `https://gist.github.com/${id}`,
      },
    }
  }

  // Raw GitHub file URL
  const githubFileMatch = input.match(
    /github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/,
  )
  if (githubFileMatch) {
    const [, owner, repo, branch, path] = githubFileMatch
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
    const resp = await fetchFn(rawUrl)
    if (!resp.ok) throw new Error(`GitHub raw fetch returned ${resp.status}`)
    return {
      code: await resp.text(),
      sourceType: 'github-file',
      metadata: {
        url: input,
        author: owner,
      },
    }
  }

  // Plain GLSL
  return { code: input, sourceType: 'glsl' }
}
