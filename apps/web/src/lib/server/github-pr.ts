import { createServerFn } from '@tanstack/solid-start'

export type CreateShaderPRInput = {
  name: string
  manifest: Record<string, unknown>
  vertexSource: string
  fragmentSource: string
  recipes: Record<string, { code: string; fileName: string }>
  previewSvg?: string
}

type GitHubApiOptions = {
  token: string
  owner: string
  repo: string
}

type GitHubTreeEntry = {
  path: string
  mode: '100644'
  type: 'blob'
  sha: string
}

async function githubApi(
  opts: GitHubApiOptions,
  path: string,
  method: string,
  body?: unknown,
): Promise<unknown> {
  const url = `https://api.github.com/repos/${opts.owner}/${opts.repo}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `token ${opts.token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`GitHub API ${method} ${path} failed (${res.status}): ${text}`)
  }

  return res.json()
}

async function createBlob(
  opts: GitHubApiOptions,
  content: string,
  encoding: 'utf-8' | 'base64' = 'utf-8',
): Promise<string> {
  const result = (await githubApi(opts, '/git/blobs', 'POST', {
    content,
    encoding,
  })) as { sha: string }
  return result.sha
}

async function getLatestCommitSha(
  opts: GitHubApiOptions,
  branch: string,
): Promise<string> {
  const result = (await githubApi(
    opts,
    `/git/ref/heads/${branch}`,
    'GET',
  )) as { object: { sha: string } }
  return result.object.sha
}

async function branchExists(
  opts: GitHubApiOptions,
  branch: string,
): Promise<boolean> {
  const url = `https://api.github.com/repos/${opts.owner}/${opts.repo}/git/ref/heads/${branch}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `token ${opts.token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  })
  return res.ok
}

export const createShaderPR = createServerFn({ method: 'POST' })
  .inputValidator((input: CreateShaderPRInput) => input)
  .handler(async ({ data }) => {
    const token = process.env.GITHUB_TOKEN
    if (!token) {
      throw new Error(
        'GITHUB_TOKEN is not configured. Add it to apps/web/.env to enable PR creation.',
      )
    }

    const repoSlug = process.env.GITHUB_REPO || 'devallibus/shaderbase'
    const [owner, repo] = repoSlug.split('/')
    if (!owner || !repo) {
      throw new Error(
        `GITHUB_REPO must be in "owner/repo" format. Got: "${repoSlug}"`,
      )
    }

    const opts: GitHubApiOptions = { token, owner, repo }
    const shaderName = data.name
    const branchName = `shader/${shaderName}`

    // Check if branch already exists (duplicate submission)
    if (await branchExists(opts, branchName)) {
      throw new Error(
        `A branch "${branchName}" already exists. A shader with the name "${shaderName}" may have already been submitted. Choose a different name or check existing pull requests.`,
      )
    }

    // 1. Get latest commit SHA on master
    const baseSha = await getLatestCommitSha(opts, 'master')

    // 2. Create blobs for each file
    const treeEntries: GitHubTreeEntry[] = []

    // shader.json manifest
    const manifestBlob = await createBlob(
      opts,
      JSON.stringify(data.manifest, null, 2) + '\n',
    )
    treeEntries.push({
      path: `shaders/${shaderName}/shader.json`,
      mode: '100644',
      type: 'blob',
      sha: manifestBlob,
    })

    // vertex.glsl
    const vertexBlob = await createBlob(opts, data.vertexSource)
    treeEntries.push({
      path: `shaders/${shaderName}/vertex.glsl`,
      mode: '100644',
      type: 'blob',
      sha: vertexBlob,
    })

    // fragment.glsl
    const fragmentBlob = await createBlob(opts, data.fragmentSource)
    treeEntries.push({
      path: `shaders/${shaderName}/fragment.glsl`,
      mode: '100644',
      type: 'blob',
      sha: fragmentBlob,
    })

    // Recipe files
    for (const [, recipe] of Object.entries(data.recipes)) {
      const recipeBlob = await createBlob(opts, recipe.code)
      treeEntries.push({
        path: `shaders/${shaderName}/${recipe.fileName}`,
        mode: '100644',
        type: 'blob',
        sha: recipeBlob,
      })
    }

    // Optional preview SVG
    if (data.previewSvg) {
      const previewBlob = await createBlob(opts, data.previewSvg)
      treeEntries.push({
        path: `shaders/${shaderName}/preview.svg`,
        mode: '100644',
        type: 'blob',
        sha: previewBlob,
      })
    }

    // 3. Create a tree with all files
    const tree = (await githubApi(opts, '/git/trees', 'POST', {
      base_tree: baseSha,
      tree: treeEntries,
    })) as { sha: string }

    // 4. Create a commit
    const commit = (await githubApi(opts, '/git/commits', 'POST', {
      message: `feat: add shader "${shaderName}"\n\nSubmitted via ShaderBase web app.`,
      tree: tree.sha,
      parents: [baseSha],
    })) as { sha: string }

    // 5. Create the branch
    await githubApi(opts, '/git/refs', 'POST', {
      ref: `refs/heads/${branchName}`,
      sha: commit.sha,
    })

    // 6. Create the pull request
    const manifest = data.manifest as Record<string, unknown>
    const category = (manifest.category as string) || 'unknown'
    const summary = (manifest.summary as string) || 'No summary provided.'

    const prBody = [
      `## New Shader: ${shaderName}`,
      '',
      `**Category:** ${category}`,
      `**Summary:** ${summary}`,
      '',
      '### Files',
      ...treeEntries.map((e) => `- \`${e.path}\``),
      '',
      '---',
      '*Submitted via the ShaderBase web app.*',
    ].join('\n')

    const pr = (await githubApi(opts, '/pulls', 'POST', {
      title: `feat: add shader "${shaderName}"`,
      head: branchName,
      base: 'master',
      body: prBody,
    })) as { html_url: string; number: number }

    return {
      prUrl: pr.html_url,
      prNumber: pr.number,
    }
  })
