import { resolveSource } from '../lib/resolve-source.ts'
import { aiParseShader } from '../lib/ai-parse.ts'
import { buildManifest } from '../lib/build-manifest.ts'
import { createShaderPR } from '../lib/github-pr.ts'
import type { CreateShaderPRResult } from '../lib/github-pr.ts'

export type SubmitInput = {
  source: string
  anthropicApiKey: string
  githubToken: string
  repo?: string
}

export type SubmitResult = {
  prUrl: string
  prNumber: number
  shaderName: string
}

export async function runSubmit(input: SubmitInput): Promise<SubmitResult> {
  const repoSlug = input.repo ?? 'devallibus/shaderbase'
  const [owner, repo] = repoSlug.split('/')
  if (!owner || !repo) {
    throw new Error(`repo must be in "owner/repo" format. Got: "${repoSlug}"`)
  }

  // 1. Resolve source (URL → code, or pass through raw GLSL)
  const resolved = await resolveSource(input.source)

  // 2. AI parse the shader
  const parsed = await aiParseShader(
    {
      code: resolved.code,
      sourceType: resolved.sourceType,
      metadata: resolved.metadata,
    },
    input.anthropicApiKey,
  )

  // 3. Build manifest
  const resolvedMeta = resolved.metadata
    ? {
        sourceType: resolved.sourceType,
        url: resolved.metadata.url,
        title: resolved.metadata.title,
        author: resolved.metadata.author,
      }
    : undefined
  const manifest = buildManifest(parsed, resolvedMeta)

  // 4. Generate recipe
  const exportName = `create${parsed.displayName.replace(/\s+/g, '')}Material`
  const recipes: Record<string, { code: string; fileName: string }> = {
    three: {
      fileName: 'recipes/three.ts',
      code: [
        `import { ShaderMaterial } from "three";`,
        ``,
        `// TODO: Configure uniforms and customize for your project`,
        `export function ${exportName}() {`,
        `  return new ShaderMaterial({`,
        `    vertexShader: "", // Load from vertex.glsl`,
        `    fragmentShader: "", // Load from fragment.glsl`,
        `    uniforms: {},`,
        `  });`,
        `}`,
      ].join('\n'),
    },
  }

  // 5. Generate preview SVG
  const previewSvg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">',
    '  <rect width="512" height="512" fill="#1a1a2e"/>',
    `  <text x="256" y="256" text-anchor="middle" fill="#e0e0e0" font-size="24">${parsed.displayName}</text>`,
    '</svg>',
  ].join('\n')

  // 6. Create PR
  const prResult: CreateShaderPRResult = await createShaderPR(
    {
      name: parsed.name,
      manifest,
      vertexSource: parsed.vertexShader,
      fragmentSource: parsed.fragmentShader,
      recipes,
      previewSvg,
    },
    { token: input.githubToken, owner, repo },
  )

  return {
    prUrl: prResult.prUrl,
    prNumber: prResult.prNumber,
    shaderName: parsed.name,
  }
}
